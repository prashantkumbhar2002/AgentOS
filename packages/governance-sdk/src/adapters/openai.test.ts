import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernanceClient } from '../GovernanceClient.js';
import {
    aggregateOpenAIStreamUsage,
    createOpenAIAdapter,
    type OpenAIChatChunk,
} from './openai.js';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function createClient() {
    return new GovernanceClient({
        platformUrl: 'http://localhost:3000',
        agentId: VALID_UUID,
        apiKey: 'test-api-key',
        autoShutdown: false,
    });
}

describe('OpenAI adapter', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('aggregateOpenAIStreamUsage prefers the chunk carrying usage info', () => {
        const chunks: OpenAIChatChunk[] = [
            { model: 'gpt-4o', choices: [{ delta: { content: 'hi' } }] },
            { model: 'gpt-4o', choices: [{ delta: { content: ' there' } }] },
            {
                model: 'gpt-4o',
                choices: [{ finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
            },
        ];
        expect(aggregateOpenAIStreamUsage(chunks)).toEqual({
            inputTokens: 10,
            outputTokens: 4,
            model: 'gpt-4o',
        });
    });

    it('streamChatCompletion logs once after the stream completes', async () => {
        const gov = createClient();
        const logs: Record<string, unknown>[] = [];
        vi.spyOn(gov, 'logEvent').mockImplementation((p) => logs.push(p));

        const fakeOpenAI = {
            chat: {
                completions: {
                    create: vi.fn(async function* () {
                        yield { model: 'gpt-4o', choices: [{ delta: { content: 'a' } }] };
                        yield { model: 'gpt-4o', choices: [{ delta: { content: 'b' } }] };
                        yield {
                            model: 'gpt-4o',
                            choices: [{ finish_reason: 'stop' }],
                            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
                        };
                    }),
                },
            },
        };

        const governed = createOpenAIAdapter(gov, fakeOpenAI as never);
        const collected: OpenAIChatChunk[] = [];
        for await (const chunk of governed.streamChatCompletion({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'hi' }],
        })) {
            collected.push(chunk);
        }

        expect(collected).toHaveLength(3);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            event: 'llm_call',
            provider: 'openai',
            model: 'gpt-4o',
            inputTokens: 3,
            outputTokens: 2,
            success: true,
        });
    });

    it('createEmbedding logs as an llm_call with no outputTokens', async () => {
        const gov = createClient();
        const logs: Record<string, unknown>[] = [];
        vi.spyOn(gov, 'logEvent').mockImplementation((p) => logs.push(p));

        const fakeOpenAI = {
            chat: { completions: { create: vi.fn() } },
            embeddings: {
                create: vi.fn(async () => ({
                    model: 'text-embedding-3-small',
                    data: [{ embedding: [0.1, 0.2], index: 0 }],
                    usage: { prompt_tokens: 5, total_tokens: 5 },
                })),
            },
        };

        const governed = createOpenAIAdapter(gov, fakeOpenAI as never);
        const out = await governed.createEmbedding({
            model: 'text-embedding-3-small',
            input: 'hello',
        });

        expect(out.data).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            event: 'llm_call',
            provider: 'openai',
            model: 'text-embedding-3-small',
            inputTokens: 5,
            success: true,
        });
        expect(logs[0]?.outputTokens).toBeUndefined();
    });
});
