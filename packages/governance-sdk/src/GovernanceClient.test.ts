import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    GovernanceClient,
    PolicyDeniedError,
    BudgetExceededError,
    ApprovalRequestError,
    isPolicyDeniedError,
    isApprovalRequestError,
} from './GovernanceClient.js';
import { EventBuffer } from './EventBuffer.js';
import { CircuitBreaker, CircuitBreakerRegistry, routeKeyFromUrl } from './CircuitBreaker.js';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function createClient(overrides?: Partial<ConstructorParameters<typeof GovernanceClient>[0]>) {
    return new GovernanceClient({
        platformUrl: 'http://localhost:3000',
        agentId: VALID_UUID,
        apiKey: 'test-api-key',
        autoShutdown: false,
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

    describe('LangSmith cross-link metadata (P1 plumbing)', () => {
        const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
        const PROJECT = 'agentos-dev';

        function readBufferedEvents(): Array<Record<string, unknown>> {
            const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
            return JSON.parse(options.body as string).events;
        }

        it('wrapLLMCall propagates langsmithRunId and langsmithProject into the buffered event', async () => {
            const client = createClient();

            await client.wrapLLMCall(
                async () => ({ ok: true }),
                {
                    provider: 'test',
                    model: 'test-model',
                    langsmithRunId: RUN_ID,
                    langsmithProject: PROJECT,
                },
            );

            await client.shutdown();
            const events = readBufferedEvents();
            expect(events[0]).toMatchObject({
                event: 'llm_call',
                success: true,
                langsmithRunId: RUN_ID,
                langsmithProject: PROJECT,
            });
        });

        it('wrapLLMCall propagates langsmith fields on the failure path too', async () => {
            const client = createClient();

            await expect(
                client.wrapLLMCall(
                    async () => { throw new Error('boom'); },
                    {
                        provider: 'test',
                        model: 'test-model',
                        langsmithRunId: RUN_ID,
                        langsmithProject: PROJECT,
                    },
                ),
            ).rejects.toThrow('boom');

            await client.shutdown();
            const events = readBufferedEvents();
            expect(events[0]).toMatchObject({
                event: 'llm_call',
                success: false,
                errorMsg: 'boom',
                langsmithRunId: RUN_ID,
                langsmithProject: PROJECT,
            });
        });

        it('wrapLLMStream propagates langsmith fields from onComplete', async () => {
            const client = createClient();

            async function* source() {
                yield 'a';
                yield 'b';
            }

            for await (const _ of client.wrapLLMStream(source, (chunks) => ({
                provider: 'test',
                model: 'mock-1',
                outputTokens: chunks.length,
                langsmithRunId: RUN_ID,
                langsmithProject: PROJECT,
            }))) {
                void _;
            }

            await client.shutdown();
            const events = readBufferedEvents();
            expect(events[0]).toMatchObject({
                event: 'llm_call',
                success: true,
                langsmithRunId: RUN_ID,
                langsmithProject: PROJECT,
            });
        });

        it('omits langsmith fields entirely when caller does not supply them (no null leakage)', async () => {
            const client = createClient();

            await client.wrapLLMCall(
                async () => 'result',
                { provider: 'test', model: 'test-model' },
            );

            await client.shutdown();
            const events = readBufferedEvents();
            expect(events[0]).not.toHaveProperty('langsmithRunId');
            expect(events[0]).not.toHaveProperty('langsmithProject');
        });
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

    it('requestApproval throws AUTH ApprovalRequestError on 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: 'TOKEN_INVALID', message: 'bad key' }),
        }));

        const client = createClient();
        await expect(
            client.requestApproval({ actionType: 'send_email', payload: {}, reasoning: 't', riskScore: 0.5 }),
        ).rejects.toMatchObject({
            name: 'ApprovalRequestError',
            kind: 'AUTH',
            httpStatus: 401,
        });
        await client.shutdown();
    });

    it('requestApproval throws RATE_LIMITED ApprovalRequestError on 429', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ error: 'RATE_LIMITED' }),
        }));

        const client = createClient();
        await expect(
            client.requestApproval({ actionType: 'a', payload: {}, reasoning: 't', riskScore: 0.5 }),
        ).rejects.toMatchObject({ name: 'ApprovalRequestError', kind: 'RATE_LIMITED', httpStatus: 429 });
        await client.shutdown();
    });

    it('requestApproval throws SERVER ApprovalRequestError on 5xx', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ error: 'INTERNAL_ERROR' }),
        }));

        const client = createClient();
        await expect(
            client.requestApproval({ actionType: 'a', payload: {}, reasoning: 't', riskScore: 0.5 }),
        ).rejects.toMatchObject({ name: 'ApprovalRequestError', kind: 'SERVER', httpStatus: 503 });
        await client.shutdown();
    });

    it('requestApproval surfaces 403 POLICY_BLOCKED as PolicyDeniedError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => ({
                error: 'POLICY_BLOCKED',
                message: "Action 'wire_money' blocked by policy: SOC2",
            }),
        }));

        const client = createClient();
        await expect(
            client.requestApproval({ actionType: 'wire_money', payload: {}, reasoning: 't', riskScore: 0.9 }),
        ).rejects.toMatchObject({
            name: 'PolicyDeniedError',
            actionType: 'wire_money',
            kind: 'POLICY',
        });
        await client.shutdown();
    });

    it('requestApproval throws NETWORK ApprovalRequestError on transport failure (fail-closed)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

        const client = createClient();
        await expect(
            client.requestApproval({ actionType: 'a', payload: {}, reasoning: 't', riskScore: 0.5 }),
        ).rejects.toMatchObject({ name: 'ApprovalRequestError', kind: 'NETWORK', httpStatus: 0 });
        await client.shutdown();
    });

    it('requestApproval auto-approves on transport failure when fail-open', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

        const client = createClient({ resilience: { onPlatformUnavailable: 'fail-open' } });
        const result = await client.requestApproval({
            actionType: 'a', payload: {}, reasoning: 't', riskScore: 0.5,
        });

        expect(result.decision).toBe('AUTO_APPROVED');
        await client.shutdown();
    });

    it('requestApproval throws INVALID_RESPONSE when 2xx body has no ticketId', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({}),
        }));

        const client = createClient();
        await expect(
            client.requestApproval({ actionType: 'a', payload: {}, reasoning: 't', riskScore: 0.5 }),
        ).rejects.toMatchObject({ name: 'ApprovalRequestError', kind: 'INVALID_RESPONSE' });
        await client.shutdown();
    });

    it('callTool propagates ApprovalRequestError and logs action_blocked', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url.includes('/policies/check')) {
                return {
                    ok: true,
                    json: async () => ({ effect: 'REQUIRE_APPROVAL', reason: 'manual review' }),
                };
            }
            if (url.includes('/approvals')) {
                return {
                    ok: false,
                    status: 401,
                    json: async () => ({ error: 'TOKEN_INVALID' }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        }));

        const client = createClient();
        await expect(
            client.callTool('send_email', { to: 'a' }, async () => 'sent', {
                riskScore: 0.5,
                approvalParams: { reasoning: 'test' },
            }),
        ).rejects.toMatchObject({ name: 'ApprovalRequestError', kind: 'AUTH' });

        await client.shutdown();
        const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
        const batchCall = calls.find((c) => (c[0] as string).includes('/audit/batch'));
        expect(batchCall).toBeDefined();
        const body = JSON.parse((batchCall![1] as RequestInit).body as string);
        const blocked = body.events.find((e: { event: string }) => e.event === 'action_blocked');
        expect(blocked).toBeDefined();
        expect(blocked.reason).toContain('AUTH');
    });

    it('isApprovalRequestError tolerates cross-realm errors', () => {
        expect(isApprovalRequestError(new ApprovalRequestError('AUTH', 401, null))).toBe(true);
        expect(isApprovalRequestError({ name: 'ApprovalRequestError' })).toBe(true);
        expect(isApprovalRequestError(new Error('boom'))).toBe(false);
        expect(isApprovalRequestError(null)).toBe(false);
    });

    it('flushEvents drops batch silently on 402 (server budget cap)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 402,
            json: async () => ({ error: 'BUDGET_EXCEEDED' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = createClient({ bufferMaxFlushAttempts: 5 });
        client.logEvent({ event: 'tool_call', toolName: 'x' });
        await client.shutdown();

        // Single attempt — no retry hammering.
        const batchCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/audit/batch'));
        expect(batchCalls.length).toBe(1);
        // No fallback to /audit/log either.
        const logCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).endsWith('/audit/log'));
        expect(logCalls.length).toBe(0);
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
        expect(policyErr.kind).toBe('POLICY');
        expect(policyErr.ticketId).toBeUndefined();

        const budgetErr = new BudgetExceededError(1.5, 1.0);
        expect(budgetErr.name).toBe('BudgetExceededError');
        expect(budgetErr.currentCost).toBe(1.5);
    });

    it('PolicyDeniedError exposes ticketId and kind when surfaced from approval flow', async () => {
        let call = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            call += 1;
            if (url.includes('/policies/check')) {
                return {
                    ok: true,
                    json: async () => ({ effect: 'REQUIRE_APPROVAL', reason: 'manual review' }),
                };
            }
            if (url.includes('/approvals') && call === 2) {
                return {
                    ok: true,
                    json: async () => ({ ticketId: 'ticket-xyz' }),
                };
            }
            if (url.includes('/events/token')) {
                return { ok: true, json: async () => ({ sseToken: 'fake' }) };
            }
            if (url.includes('/approvals/ticket-xyz')) {
                return { ok: true, json: async () => ({ status: 'DENIED' }) };
            }
            return { ok: true, json: async () => ({}) };
        }));

        const client = createClient();
        await expect(
            client.callTool('send_email', { to: 'x' }, async () => 'sent', {
                riskScore: 0.5,
                approvalParams: { reasoning: 'test' },
            }),
        ).rejects.toMatchObject({
            name: 'PolicyDeniedError',
            ticketId: 'ticket-xyz',
            kind: 'APPROVAL_DENIED',
        });
        await client.shutdown();
    });

    it('isPolicyDeniedError tolerates cross-realm errors', () => {
        expect(isPolicyDeniedError(new PolicyDeniedError('a', 'b'))).toBe(true);
        expect(isPolicyDeniedError({ name: 'PolicyDeniedError' })).toBe(true);
        expect(isPolicyDeniedError(new Error('boom'))).toBe(false);
        expect(isPolicyDeniedError(null)).toBe(false);
    });

    it('withTrace isolates traceId across concurrent invocations', async () => {
        const client = createClient();
        const seenA: string[] = [];
        const seenB: string[] = [];

        await Promise.all([
            client.withTrace(async () => {
                seenA.push(client.traceId);
                await new Promise((r) => setTimeout(r, 5));
                seenA.push(client.traceId);
                await new Promise((r) => setTimeout(r, 5));
                seenA.push(client.traceId);
            }),
            client.withTrace(async () => {
                seenB.push(client.traceId);
                await new Promise((r) => setTimeout(r, 5));
                seenB.push(client.traceId);
                await new Promise((r) => setTimeout(r, 5));
                seenB.push(client.traceId);
            }),
        ]);

        expect(new Set(seenA).size).toBe(1);
        expect(new Set(seenB).size).toBe(1);
        expect(seenA[0]).not.toBe(seenB[0]);

        const outside = client.traceId;
        expect(outside).not.toBe(seenA[0]);
        expect(outside).not.toBe(seenB[0]);

        await client.shutdown();
    });

    it('withTrace isolates span hierarchy across concurrent invocations', async () => {
        const client = createClient();
        let aSpanId = '';
        let bSpanId = '';

        await Promise.all([
            client.withTrace(async () => {
                client.startSpan('a-root');
                aSpanId = client['spanManager'].currentSpanId ?? '';
                await new Promise((r) => setTimeout(r, 5));
                expect(client['spanManager'].currentSpanId).toBe(aSpanId);
                client.endSpan();
            }),
            client.withTrace(async () => {
                client.startSpan('b-root');
                bSpanId = client['spanManager'].currentSpanId ?? '';
                await new Promise((r) => setTimeout(r, 5));
                expect(client['spanManager'].currentSpanId).toBe(bSpanId);
                client.endSpan();
            }),
        ]);

        expect(aSpanId).not.toBe('');
        expect(bSpanId).not.toBe('');
        expect(aSpanId).not.toBe(bSpanId);
        await client.shutdown();
    });
});

describe('EventBuffer resilience', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('requeues batches on transient failure and retries with backoff', async () => {
        let attempt = 0;
        const flushFn = vi.fn(async (events: Record<string, unknown>[]) => {
            attempt += 1;
            if (attempt < 2) throw new Error('boom');
            return events.length === 1 ? undefined : undefined;
        });

        const buf = new EventBuffer(flushFn, 1, 5_000, {
            maxFlushAttempts: 5,
            retryBaseMs: 1,
            retryMaxMs: 2,
        });

        buf.push({ event: 'one' });
        // first attempt fails immediately because batch size = 1
        await new Promise((r) => setTimeout(r, 30));
        // second attempt should have happened from the scheduled retry
        expect(flushFn.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(buf.pending).toBe(0);
        expect(buf.dropped).toBe(0);
    });

    it('drops batches after exceeding maxFlushAttempts', async () => {
        const flushFn = vi.fn(async () => {
            throw new Error('always fails');
        });

        const buf = new EventBuffer(flushFn, 1, 5_000, {
            maxFlushAttempts: 3,
            retryBaseMs: 1,
            retryMaxMs: 1,
        });

        buf.push({ event: 'one' });
        await new Promise((r) => setTimeout(r, 50));
        expect(flushFn.mock.calls.length).toBe(3);
        expect(buf.pending).toBe(0);
        expect(buf.dropped).toBe(1);
    });

    it('caps queue at maxQueueSize, dropping oldest events', () => {
        const flushFn = vi.fn(async () => { });
        const buf = new EventBuffer(flushFn, 1000, 10_000, { maxQueueSize: 3 });

        for (let i = 0; i < 5; i++) buf.push({ idx: i });

        expect(buf.pending).toBe(3);
        expect(buf.dropped).toBe(2);
    });
});

describe('withSpan failure tagging (#23)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits a span_failed event with span name in metadata when fn rejects', async () => {
        const client = createClient();
        const logged: Record<string, unknown>[] = [];
        const realLog = client.logEvent.bind(client);
        vi.spyOn(client, 'logEvent').mockImplementation((p: Record<string, unknown>) => {
            logged.push(p);
            realLog(p);
        });

        await expect(
            client.withSpan('checkout', async () => {
                throw new Error('payment declined');
            }),
        ).rejects.toThrow('payment declined');

        const failure = logged.find((e) => e.event === 'span_failed');
        expect(failure).toBeDefined();
        expect(failure?.success).toBe(false);
        expect(failure?.errorMsg).toBe('payment declined');
        expect((failure?.metadata as { spanName?: unknown })?.spanName).toBe('checkout');
        expect(typeof failure?.latencyMs).toBe('number');

        await client.shutdown();
    });

    it('does NOT emit span_failed on success', async () => {
        const client = createClient();
        const logged: Record<string, unknown>[] = [];
        vi.spyOn(client, 'logEvent').mockImplementation((p: Record<string, unknown>) => {
            logged.push(p);
        });

        const result = await client.withSpan('happy', async () => 'ok');
        expect(result).toBe('ok');
        expect(logged.find((e) => e.event === 'span_failed')).toBeUndefined();
    });

    it('still pops the span stack when fn rejects', async () => {
        const client = createClient();
        const before = client['spanManager'].depth;

        await expect(
            client.withSpan('boom', async () => { throw new Error('x'); }),
        ).rejects.toThrow();

        expect(client['spanManager'].depth).toBe(before);
    });
});

describe('CircuitBreaker (per-route) and backoff (#13)', () => {
    it('routeKeyFromUrl buckets by host + first /api/vN segment', () => {
        expect(routeKeyFromUrl('https://api.x/api/v1/audit/batch')).toBe('api.x|audit');
        expect(routeKeyFromUrl('https://api.x/api/v1/audit/log')).toBe('api.x|audit');
        expect(routeKeyFromUrl('https://api.x/api/v2/policies/check')).toBe('api.x|policies');
        expect(routeKeyFromUrl('https://api.x/api/v1/approvals/abc-123')).toBe('api.x|approvals');
        expect(routeKeyFromUrl('not-a-url')).toBe('unknown');
    });

    it('CircuitBreakerRegistry returns the same breaker for repeated keys', () => {
        const reg = new CircuitBreakerRegistry(2, 1000);
        const a = reg.get('host|audit');
        const b = reg.get('host|audit');
        expect(a).toBe(b);
        const c = reg.get('host|policies');
        expect(c).not.toBe(a);
    });

    it('opens after threshold, refuses requests, and recovers after cooldown', async () => {
        const cb = new CircuitBreaker(2, 30);
        expect(cb.canRequest()).toBe(true);
        cb.recordFailure();
        expect(cb.canRequest()).toBe(true);
        cb.recordFailure();
        expect(cb.canRequest()).toBe(false);
        expect(cb.isOpen).toBe(true);

        await new Promise((r) => setTimeout(r, 35));
        expect(cb.canRequest()).toBe(true);
        expect(cb.isOpen).toBe(false);
    });

    it('a flaky route does not trip the breaker on a healthy route', async () => {
        const client = createClient({
            resilience: {
                circuitBreakerThreshold: 2,
                circuitBreakerCooldownMs: 1_000,
                retryAttempts: 1,
            },
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (url.includes('/audit/')) throw new Error('audit down');
                return { ok: true, status: 200, json: async () => ({}) };
            }),
        );

        // Trip the audit breaker
        await expect(
            client['fetchWithResilience']('http://localhost:3000/api/v1/audit/batch'),
        ).rejects.toThrow();
        await expect(
            client['fetchWithResilience']('http://localhost:3000/api/v1/audit/batch'),
        ).rejects.toThrow();

        // Audit should now be tripped
        await expect(
            client['fetchWithResilience']('http://localhost:3000/api/v1/audit/batch'),
        ).rejects.toThrow(/Circuit breaker open/);

        // Policies route is unaffected
        const res = await client['fetchWithResilience'](
            'http://localhost:3000/api/v1/policies/check',
        );
        expect(res.ok).toBe(true);

        const metrics = client.getMetrics();
        expect(metrics.breakers['localhost:3000|audit']?.isOpen).toBe(true);
        expect(metrics.breakers['localhost:3000|policies']?.isOpen ?? false).toBe(false);

        await client.shutdown();
    });

    it('counts 5xx responses as breaker failures', async () => {
        const client = createClient({
            resilience: { circuitBreakerThreshold: 1, retryAttempts: 1 },
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
        );

        const res = await client['fetchWithResilience']('http://localhost:3000/api/v1/audit/batch');
        expect(res.status).toBe(503);

        const metrics = client.getMetrics();
        expect(metrics.breakers['localhost:3000|audit']?.isOpen).toBe(true);

        await client.shutdown();
    });
});

describe('getMetrics() (#21)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    });
    afterEach(() => vi.restoreAllMocks());

    it('returns a snapshot of cost, buffer, breakers, and traceId', () => {
        const client = createClient({ budget: { maxCostUsd: 5 } });
        client.logEvent({ event: 'tool_call' });
        const m = client.getMetrics();
        expect(m.cost).toEqual({ cumulativeUsd: 0, budgetUsd: 5 });
        expect(m.buffer.pending).toBeGreaterThanOrEqual(1);
        expect(m.buffer.dropped).toBe(0);
        expect(typeof m.traceId).toBe('string');
        expect(m.breakers).toEqual({});
    });
});
