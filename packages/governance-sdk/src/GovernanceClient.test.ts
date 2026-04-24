import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernanceClient, PolicyDeniedError, BudgetExceededError } from './GovernanceClient.js';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function createClient(overrides?: Partial<ConstructorParameters<typeof GovernanceClient>[0]>) {
    return new GovernanceClient({
        platformUrl: 'http://localhost:3000',
        agentId: VALID_UUID,
        apiKey: 'test-api-key',
        ...overrides,
    });
}

describe('GovernanceClient', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        }));
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('generates a unique traceId on construction', () => {
        const client1 = createClient();
        const client2 = createClient();
        expect(client1.traceId).toBeDefined();
        expect(client2.traceId).toBeDefined();
        expect(client1.traceId).not.toBe(client2.traceId);
    });

    it('logEvent buffers events instead of immediate fetch', () => {
        const client = createClient();
        client.logEvent({ event: 'tool_call', toolName: 'search' });

        // Should not have called fetch yet (buffered)
        expect(fetch).not.toHaveBeenCalled();
    });

    it('shutdown flushes buffered events', async () => {
        const client = createClient();
        client.logEvent({ event: 'tool_call', toolName: 'search' });

        await client.shutdown();

        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://localhost:3000/api/v1/audit/batch');
        expect(options.method).toBe('POST');
        expect(options.headers).toEqual({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
        });

        const body = JSON.parse(options.body as string);
        expect(body.events).toHaveLength(1);
        expect(body.events[0].agentId).toBe(VALID_UUID);
        expect(body.events[0].event).toBe('tool_call');
    });

    it('wrapLLMCall executes function and logs event', async () => {
        const client = createClient();
        const result = await client.wrapLLMCall(
            async () => ({ text: 'hello', usage: { input: 10, output: 20 } }),
            (res) => ({
                provider: 'test',
                model: 'test-model',
                inputTokens: res.usage.input,
                outputTokens: res.usage.output,
            }),
        );

        expect(result.text).toBe('hello');

        await client.shutdown();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('wrapLLMCall logs failure on error', async () => {
        const client = createClient();

        await expect(
            client.wrapLLMCall(
                async () => { throw new Error('LLM failed'); },
                { provider: 'test', model: 'test-model' },
            ),
        ).rejects.toThrow('LLM failed');

        await client.shutdown();
        expect(fetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(
            ((fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.events[0].success).toBe(false);
        expect(body.events[0].errorMsg).toBe('LLM failed');
    });

    it('callTool executes and logs tool_call event', async () => {
        const client = createClient();
        const result = await client.callTool('search', { query: 'test' }, async () => 'result');

        expect(result).toBe('result');

        await client.shutdown();
        expect(fetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(
            ((fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.events[0].event).toBe('tool_call');
        expect(body.events[0].toolName).toBe('search');
        expect(body.events[0].success).toBe(true);
    });

    it('callTool re-throws fn errors after logging', async () => {
        const client = createClient();
        const error = new Error('tool failed');

        await expect(
            client.callTool('broken-tool', {}, async () => { throw error; }),
        ).rejects.toThrow('tool failed');

        await client.shutdown();
        const body = JSON.parse(
            ((fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.events[0].success).toBe(false);
        expect(body.events[0].errorMsg).toBe('tool failed');
    });

    it('span management creates correct span hierarchy', async () => {
        const client = createClient();

        await client.withSpan('parent', async () => {
            client.logEvent({ event: 'llm_call', model: 'test' });

            await client.withSpan('child', async () => {
                client.logEvent({ event: 'tool_call', toolName: 'search' });
            });
        });

        await client.shutdown();
        const body = JSON.parse(
            ((fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
        );

        const events = body.events;
        expect(events).toHaveLength(2);

        const parentEvent = events[0];
        const childEvent = events[1];

        expect(parentEvent.spanId).toBeDefined();
        expect(parentEvent.parentSpanId).toBeUndefined();
        expect(childEvent.spanId).toBeDefined();
        expect(childEvent.parentSpanId).toBe(parentEvent.spanId);
    });

    it('budget throws BudgetExceededError when exceeded', async () => {
        const client = createClient({
            budget: { maxCostUsd: 0.01, onBudgetExceeded: 'throw' },
        });

        // First call succeeds but puts us over budget
        await client.wrapLLMCall(
            async () => 'result',
            { provider: 'test', model: 'test', costUsd: 0.02 },
        );

        // Second call should throw
        await expect(
            client.wrapLLMCall(
                async () => 'result2',
                { provider: 'test', model: 'test', costUsd: 0.01 },
            ),
        ).rejects.toThrow(BudgetExceededError);

        await client.shutdown();
    });

    it('wrapLLMStream yields chunks to the caller and logs metadata once', async () => {
        const client = createClient();

        async function* source() {
            yield 'hello';
            yield ' ';
            yield 'world';
        }

        const received: string[] = [];
        for await (const chunk of client.wrapLLMStream(source, (chunks) => ({
            provider: 'test',
            model: 'mock-1',
            inputTokens: 1,
            outputTokens: chunks.length,
            costUsd: 0.0001,
        }))) {
            received.push(chunk);
        }

        expect(received).toEqual(['hello', ' ', 'world']);

        await client.shutdown();
        const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string);
        const llmEvents = body.events.filter((e: { event: string }) => e.event === 'llm_call');
        expect(llmEvents).toHaveLength(1);
        expect(llmEvents[0]).toMatchObject({
            provider: 'test',
            model: 'mock-1',
            outputTokens: 3,
            success: true,
        });
    });

    it('wrapLLMStream surfaces stream errors and logs failure', async () => {
        const client = createClient();

        async function* source() {
            yield 'a';
            throw new Error('stream broke');
        }

        await expect(async () => {
            for await (const _ of client.wrapLLMStream(source, () => ({
                provider: 'test',
                model: 'mock-1',
            }))) {
                void _;
            }
        }).rejects.toThrow('stream broke');

        await client.shutdown();
        const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string);
        const llmEvents = body.events.filter((e: { event: string }) => e.event === 'llm_call');
        expect(llmEvents).toHaveLength(1);
        expect(llmEvents[0]).toMatchObject({ success: false, errorMsg: 'stream broke' });
    });

    it('requestApproval returns AUTO_APPROVED when policy allows', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'AUTO_APPROVED' }),
        }));

        const client = createClient();
        const result = await client.requestApproval({
            actionType: 'test',
            payload: {},
            reasoning: 'test',
            riskScore: 0.1,
        });

        expect(result.decision).toBe('AUTO_APPROVED');
        await client.shutdown();
    });

    it('checkPolicy returns policy evaluation result', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ effect: 'ALLOW', reason: 'Allowed by test policy' }),
        }));

        const client = createClient();
        const result = await client.checkPolicy('test_action', 0.5);

        expect(result.effect).toBe('ALLOW');
        expect(result.reason).toBe('Allowed by test policy');
        await client.shutdown();
    });

    it('checkPolicy returns fail-open when platform unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const client = createClient({
            resilience: { onPlatformUnavailable: 'fail-open' },
        });
        const result = await client.checkPolicy('test_action', 0.5);

        expect(result.effect).toBe('ALLOW');
        await client.shutdown();
    });

    it('checkPolicy returns fail-closed when platform unavailable (default)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const client = createClient();
        const result = await client.checkPolicy('test_action', 0.5);

        expect(result.effect).toBe('REQUIRE_APPROVAL');
        await client.shutdown();
    });

    it('currentCost tracks cumulative spending', async () => {
        const client = createClient();

        await client.wrapLLMCall(
            async () => 'r1',
            { provider: 'test', model: 'test', costUsd: 0.005 },
        );
        await client.wrapLLMCall(
            async () => 'r2',
            { provider: 'test', model: 'test', costUsd: 0.003 },
        );

        expect(client.currentCost).toBeCloseTo(0.008, 6);
        await client.shutdown();
    });

    it('exports PolicyDeniedError and BudgetExceededError', () => {
        const policyErr = new PolicyDeniedError('send_email', 'blocked');
        expect(policyErr.name).toBe('PolicyDeniedError');
        expect(policyErr.actionType).toBe('send_email');

        const budgetErr = new BudgetExceededError(1.5, 1.0);
        expect(budgetErr.name).toBe('BudgetExceededError');
        expect(budgetErr.currentCost).toBe(1.5);
    });
});
