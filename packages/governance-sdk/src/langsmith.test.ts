import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLangSmithBridge, type LangSmithBridge, type LangSmithConfig } from './langsmith.js';

const VALID_CONFIG: LangSmithConfig = {
    apiKey: 'ls_test_secret_xxxxxxxxxxxxxxxxxx',
    projectName: 'agentos-dev',
    baseUrl: 'http://localhost:1984',
    // Minimal buffer config so flush triggers on first push for most tests.
    bufferMaxSize: 1,
    bufferFlushIntervalMs: 5,
};

function freshConfig(overrides: Partial<LangSmithConfig> = {}): LangSmithConfig {
    return { ...VALID_CONFIG, ...overrides };
}

function lastFetchBody(): { post: Array<Record<string, unknown>>; patch: unknown[] } {
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1] as [string, RequestInit];
    return JSON.parse(lastCall[1].body as string) as {
        post: Array<Record<string, unknown>>;
        patch: unknown[];
    };
}

function lastFetchUrl(): string {
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1] as [string, RequestInit];
    return lastCall[0];
}

function lastFetchHeaders(): Record<string, string> {
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1] as [string, RequestInit];
    return lastCall[1].headers as Record<string, string>;
}

const NOW = new Date('2026-05-02T10:00:00.000Z');
const LATER = new Date('2026-05-02T10:00:01.234Z');

describe('createLangSmithBridge', () => {
    let bridge: LangSmithBridge | undefined;

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok' }),
        }));
        vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(async () => {
        if (bridge) {
            await bridge.shutdown();
            bridge = undefined;
        }
        vi.restoreAllMocks();
    });

    describe('constructor validation', () => {
        it('throws when apiKey is missing', () => {
            expect(() => createLangSmithBridge({
                ...VALID_CONFIG,
                apiKey: '',
            })).toThrow(/apiKey is required/i);
        });

        it('throws when projectName is missing', () => {
            expect(() => createLangSmithBridge({
                ...VALID_CONFIG,
                projectName: '',
            })).toThrow(/projectName is required/i);
        });

        it('exposes the project name unchanged', () => {
            bridge = createLangSmithBridge(freshConfig({ projectName: 'my-project' }));
            expect(bridge.project).toBe('my-project');
        });

        it('strips trailing slashes from baseUrl before building flush URL', async () => {
            bridge = createLangSmithBridge(freshConfig({ baseUrl: 'http://localhost:1984/////' }));
            bridge.recordLLM({
                runId: bridge.mintRunId(),
                name: 'test',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();
            expect(lastFetchUrl()).toBe('http://localhost:1984/runs/batch');
        });

        it('defaults baseUrl to https://api.smith.langchain.com when omitted', async () => {
            bridge = createLangSmithBridge({
                apiKey: VALID_CONFIG.apiKey,
                projectName: VALID_CONFIG.projectName,
                bufferMaxSize: 1,
            });
            bridge.recordLLM({
                runId: bridge.mintRunId(),
                name: 'test',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();
            expect(lastFetchUrl()).toBe('https://api.smith.langchain.com/runs/batch');
        });
    });

    describe('mintRunId', () => {
        it('returns UUID-shaped strings', () => {
            bridge = createLangSmithBridge(freshConfig());
            const id = bridge.mintRunId();
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        it('returns unique ids on repeated calls', () => {
            bridge = createLangSmithBridge(freshConfig());
            const ids = new Set([
                bridge.mintRunId(),
                bridge.mintRunId(),
                bridge.mintRunId(),
            ]);
            expect(ids.size).toBe(3);
        });
    });

    describe('recordLLM + flush wire format', () => {
        it('posts to {baseUrl}/runs/batch with the correct headers', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: bridge.mintRunId(),
                name: 'gpt-4',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();

            expect(lastFetchUrl()).toBe('http://localhost:1984/runs/batch');
            const headers = lastFetchHeaders();
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['X-API-Key']).toBe(VALID_CONFIG.apiKey);
        });

        it('wraps each run in a `post` array with empty `patch`', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'run-1',
                name: 'gpt-4',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();

            const body = lastFetchBody();
            expect(body.post).toHaveLength(1);
            expect(body.patch).toEqual([]);
        });

        it('serialises a complete run with all required LangSmith fields', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'run-abc',
                name: 'claude-sonnet-4',
                runType: 'llm',
                startTime: NOW,
                endTime: LATER,
                inputs: { prompt: 'hi' },
                outputs: { text: 'hello' },
                metadata: { provider: 'anthropic', costUsd: 0.001 },
            });
            await bridge.shutdown();

            const post = lastFetchBody().post[0]!;
            expect(post).toMatchObject({
                id: 'run-abc',
                name: 'claude-sonnet-4',
                run_type: 'llm',
                start_time: NOW.toISOString(),
                end_time: LATER.toISOString(),
                session_name: 'agentos-dev',
                inputs: { prompt: 'hi' },
                outputs: { text: 'hello' },
                extra: { metadata: { provider: 'anthropic', costUsd: 0.001 } },
            });
            expect(post['error']).toBeUndefined();
        });

        it('defaults run_type to "llm" when not specified', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'run-1',
                name: 'gpt-4',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();
            expect(lastFetchBody().post[0]).toMatchObject({ run_type: 'llm' });
        });

        it('includes `error` and omits outputs when the run failed', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'run-1',
                name: 'gpt-4',
                startTime: NOW,
                endTime: LATER,
                error: 'rate limited',
            });
            await bridge.shutdown();

            const post = lastFetchBody().post[0]!;
            expect(post['error']).toBe('rate limited');
            expect(post['outputs']).toBeUndefined();
        });

        it('includes parent_run_id when provided', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'child',
                parentRunId: 'parent',
                name: 'gpt-4',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();
            expect(lastFetchBody().post[0]).toMatchObject({ parent_run_id: 'parent' });
        });

        it('batches multiple runs into a single fetch when buffer size > 1', async () => {
            bridge = createLangSmithBridge(freshConfig({ bufferMaxSize: 5 }));
            for (let i = 0; i < 3; i++) {
                bridge.recordLLM({
                    runId: `run-${i}`,
                    name: 'gpt-4',
                    startTime: NOW,
                    endTime: LATER,
                });
            }
            await bridge.shutdown();

            expect(fetch).toHaveBeenCalledTimes(1);
            const post = lastFetchBody().post;
            expect(post).toHaveLength(3);
            expect(post.map((r) => r['id'])).toEqual(['run-0', 'run-1', 'run-2']);
        });
    });

    describe('redaction', () => {
        it('runs the redact callback over inputs and outputs', async () => {
            const redact = vi.fn((v: unknown) => {
                if (typeof v === 'object' && v !== null) {
                    return { ...(v as Record<string, unknown>), email: '[REDACTED]' };
                }
                return v;
            });
            bridge = createLangSmithBridge(freshConfig({ redact }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: { email: 'alice@example.com', q: 'hi' },
                outputs: { email: 'bob@example.com', a: 'ok' },
            });
            await bridge.shutdown();

            expect(redact).toHaveBeenCalledTimes(2);
            const post = lastFetchBody().post[0]!;
            expect((post['inputs'] as Record<string, unknown>)['email']).toBe('[REDACTED]');
            expect((post['outputs'] as Record<string, unknown>)['email']).toBe('[REDACTED]');
        });

        it('omits a field entirely when redact returns undefined', async () => {
            bridge = createLangSmithBridge(freshConfig({
                redact: () => undefined,
            }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: { secret: 'data' },
                outputs: { also: 'secret' },
            });
            await bridge.shutdown();

            const post = lastFetchBody().post[0]!;
            expect(post['inputs']).toBeUndefined();
            expect(post['outputs']).toBeUndefined();
        });

        it('drops the run silently when the redactor throws', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
            bridge = createLangSmithBridge(freshConfig({
                redact: () => { throw new Error('redactor blew up'); },
            }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: { x: 1 },
            });
            await bridge.shutdown();

            expect(fetch).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalled();
            const warning = (warn.mock.calls[0] as unknown[]).join(' ');
            expect(warning).toMatch(/Dropping run/);
            // The redactor message may surface but the inputs themselves
            // (which may be the unredacted secret) must not.
            expect(warning).not.toContain('"x":1');
        });
    });

    describe('metadataOnly', () => {
        it('strips inputs and outputs while keeping metadata + error', async () => {
            bridge = createLangSmithBridge(freshConfig({ metadataOnly: true }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: { secret: 'data' },
                outputs: { also: 'secret' },
                error: 'visible',
                metadata: { costUsd: 0.001 },
            });
            await bridge.shutdown();

            const post = lastFetchBody().post[0]!;
            expect(post['inputs']).toBeUndefined();
            expect(post['outputs']).toBeUndefined();
            expect(post['error']).toBe('visible');
            expect(post['extra']).toEqual({ metadata: { costUsd: 0.001 } });
        });
    });

    describe('maxPayloadBytes', () => {
        it('replaces oversized inputs with a truncation marker', async () => {
            // 2 KB cap, 4 KB input → must trigger truncation.
            const big = { huge: 'x'.repeat(4096) };
            bridge = createLangSmithBridge(freshConfig({ maxPayloadBytes: 2048 }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: big,
            });
            await bridge.shutdown();

            const post = lastFetchBody().post[0]!;
            expect(post['inputs']).toMatchObject({
                __truncated: true,
                maxBytes: 2048,
            });
            // Crucially, the original payload is NOT in the body.
            const wire = JSON.stringify(post['inputs']);
            expect(wire).not.toContain('xxxxxxx'); // original characters absent
        });

        it('passes small payloads through unchanged', async () => {
            const small = { q: 'hello' };
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: small,
            });
            await bridge.shutdown();
            expect(lastFetchBody().post[0]!['inputs']).toEqual(small);
        });

        it('replaces unserialisable (circular) payloads with a marker', async () => {
            const circular: Record<string, unknown> = { a: 1 };
            circular['self'] = circular;

            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
                inputs: circular,
            });
            await bridge.shutdown();
            expect(lastFetchBody().post[0]!['inputs']).toEqual({ __unserialisable: true });
        });
    });

    describe('circuit breaker isolation', () => {
        it('opens after threshold consecutive failures and short-circuits subsequent flushes', async () => {
            // Force every fetch to 500.
            (fetch as ReturnType<typeof vi.fn>).mockReset();
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => ({}),
            });

            // Disable EventBuffer retries (maxFlushAttempts: 1) so each
            // batch fails once, the breaker records one failure, and the
            // batch is dropped — no exponential backoff to wait through.
            bridge = createLangSmithBridge(freshConfig({
                bufferMaxSize: 1,
                bufferMaxFlushAttempts: 1,
                bufferRetryBaseMs: 1,
                bufferRetryMaxMs: 1,
                circuitBreakerThreshold: 2,
            }));

            for (let i = 0; i < 3; i++) {
                bridge.recordLLM({
                    runId: `r${i}`,
                    name: 'm',
                    startTime: NOW,
                    endTime: LATER,
                });
                await new Promise((r) => setTimeout(r, 20));
            }

            const breaker = bridge.getMetrics().breaker;
            expect(breaker.failures).toBeGreaterThanOrEqual(2);
            expect(breaker.isOpen).toBe(true);
        });

        it('records success and stays closed on 2xx responses', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
            });
            await bridge.shutdown();

            const breaker = bridge.getMetrics().breaker;
            expect(breaker.failures).toBe(0);
            expect(breaker.isOpen).toBe(false);
        });
    });

    describe('error logging hygiene', () => {
        it('never includes the apiKey in transport-error messages', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockReset();
            (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error(`socket hang up while sending Bearer ${VALID_CONFIG.apiKey}`),
            );

            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

            bridge = createLangSmithBridge(freshConfig({
                bufferMaxSize: 1,
                bufferMaxFlushAttempts: 1,
                bufferRetryBaseMs: 1,
                bufferRetryMaxMs: 1,
            }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
            });
            await new Promise((r) => setTimeout(r, 50));
            await bridge.shutdown();

            const allWarnings = warn.mock.calls
                .map((args) => (args as unknown[]).map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' '))
                .join('\n');
            expect(allWarnings).not.toContain(VALID_CONFIG.apiKey);
        });

        it('never includes the apiKey in HTTP-status error messages', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockReset();
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({ error: `bad key: ${VALID_CONFIG.apiKey}` }),
            });

            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

            bridge = createLangSmithBridge(freshConfig({
                bufferMaxSize: 1,
                bufferMaxFlushAttempts: 1,
                bufferRetryBaseMs: 1,
                bufferRetryMaxMs: 1,
            }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
            });
            await new Promise((r) => setTimeout(r, 50));
            await bridge.shutdown();

            const allWarnings = warn.mock.calls
                .map((args) => (args as unknown[]).map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' '))
                .join('\n');
            expect(allWarnings).not.toContain(VALID_CONFIG.apiKey);
        });
    });

    describe('getMetrics', () => {
        it('reports enabled=true with buffer + breaker state', async () => {
            bridge = createLangSmithBridge(freshConfig({ bufferMaxSize: 100 }));
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
            });
            const metrics = bridge.getMetrics();
            expect(metrics.enabled).toBe(true);
            expect(metrics.pending).toBe(1);
            expect(metrics.dropped).toBe(0);
            expect(metrics.breaker.isOpen).toBe(false);
            expect(metrics.lastFlushMs).toBe(0);
        });

        it('updates lastFlushMs after a successful flush', async () => {
            bridge = createLangSmithBridge(freshConfig());
            bridge.recordLLM({
                runId: 'r',
                name: 'm',
                startTime: NOW,
                endTime: LATER,
            });
            const before = Date.now();
            await bridge.shutdown();
            const metrics = bridge.getMetrics();
            expect(metrics.lastFlushMs).toBeGreaterThanOrEqual(before);
        });
    });
});
