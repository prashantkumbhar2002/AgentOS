import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernanceClient } from '../GovernanceClient.js';
import { createLangChainCallback } from './langchain.js';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function createClient() {
    return new GovernanceClient({
        platformUrl: 'http://localhost:3000',
        agentId: VALID_UUID,
        apiKey: 'test-api-key',
        autoShutdown: false,
    });
}

describe('LangChain adapter', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs an llm_call with token usage on handleLLMEnd', () => {
        const gov = createClient();
        const logs: Record<string, unknown>[] = [];
        vi.spyOn(gov, 'logEvent').mockImplementation((p) => logs.push(p));

        const cb = createLangChainCallback(gov);
        cb.handleLLMStart({ id: ['x'] }, ['prompt'], 'run-1');
        cb.handleLLMEnd(
            {
                generations: [[{ text: 'hi' }]],
                llmOutput: {
                    model_name: 'gpt-4o',
                    tokenUsage: { promptTokens: 12, completionTokens: 7 },
                },
            },
            'run-1',
        );

        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            event: 'llm_call',
            provider: 'langchain',
            model: 'gpt-4o',
            inputTokens: 12,
            outputTokens: 7,
            success: true,
        });
        expect(typeof logs[0]?.latencyMs).toBe('number');
    });

    it('isolates per-runId state across concurrent LLM runs', async () => {
        const gov = createClient();
        const logs: Record<string, unknown>[] = [];
        vi.spyOn(gov, 'logEvent').mockImplementation((p) => logs.push(p));

        const cb = createLangChainCallback(gov);

        cb.handleLLMStart({ id: ['x'] }, ['p1'], 'run-A');
        await new Promise((r) => setTimeout(r, 5));
        cb.handleLLMStart({ id: ['x'] }, ['p2'], 'run-B');

        cb.handleLLMEnd(
            { generations: [[{ text: 'a' }]], llmOutput: { model_name: 'A', tokenUsage: { promptTokens: 1, completionTokens: 1 } } },
            'run-A',
        );
        cb.handleLLMEnd(
            { generations: [[{ text: 'b' }]], llmOutput: { model_name: 'B', tokenUsage: { promptTokens: 2, completionTokens: 2 } } },
            'run-B',
        );

        const aLog = logs.find((l) => l.model === 'A');
        const bLog = logs.find((l) => l.model === 'B');
        expect(aLog).toBeDefined();
        expect(bLog).toBeDefined();
        // run-A started first, so its latency should be >= run-B's
        expect(aLog!.latencyMs as number).toBeGreaterThanOrEqual(bLog!.latencyMs as number);
    });

    it('logs tool_call success/failure with the right tool name', () => {
        const gov = createClient();
        const logs: Record<string, unknown>[] = [];
        vi.spyOn(gov, 'logEvent').mockImplementation((p) => logs.push(p));
        const cb = createLangChainCallback(gov);

        cb.handleToolStart({ id: ['t'], name: 'web_search' }, 'q', 'tool-1');
        cb.handleToolEnd('result', 'tool-1');

        cb.handleToolStart({ id: ['t'], name: 'send_email' }, 'q', 'tool-2');
        cb.handleToolError(new Error('SMTP down'), 'tool-2');

        expect(logs).toHaveLength(2);
        expect(logs[0]).toMatchObject({ event: 'tool_call', toolName: 'web_search', success: true });
        expect(logs[1]).toMatchObject({
            event: 'tool_call',
            toolName: 'send_email',
            success: false,
            errorMsg: 'SMTP down',
        });
    });

    it('handleToolEnd is a no-op when no matching start was seen', () => {
        const gov = createClient();
        const logs: Record<string, unknown>[] = [];
        vi.spyOn(gov, 'logEvent').mockImplementation((p) => logs.push(p));
        const cb = createLangChainCallback(gov);

        cb.handleToolEnd('out', 'orphan');
        cb.handleToolError(new Error('x'), 'orphan');

        expect(logs).toHaveLength(0);
    });
});
