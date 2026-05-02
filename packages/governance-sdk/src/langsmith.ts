import { randomUUID } from 'node:crypto';
import { EventBuffer } from './EventBuffer.js';
import { CircuitBreaker } from './CircuitBreaker.js';

/**
 * Optional LangSmith fanout for the SDK.
 *
 * When `langsmith` config is supplied to `GovernanceClient`, every wrapped
 * LLM call is also reported to LangSmith *alongside* the AgentOS audit log.
 * The two pipelines are isolated: a LangSmith outage cannot affect AgentOS
 * audit ingest, budget enforcement, or approval flow. The bridge owns its
 * own buffer, its own circuit breaker, and never propagates errors back
 * into the caller's hot path.
 *
 * Wire shape (per LangSmith REST API):
 *
 *   POST {baseUrl}/runs/batch
 *   Authorization: Bearer {apiKey}
 *   Body: { post: [...], patch: [] }
 *
 * We always send "complete" runs — i.e. each entry in `post` carries both
 * start and end fields. This collapses the typical start+update lifecycle
 * into a single best-effort write, which retries cleanly without leaving
 * half-finished runs behind.
 */

export interface LangSmithConfig {
    /** LangSmith API key. Stored on the bridge only; never echoed in logs. */
    apiKey: string;
    /** Logical project name used to group runs in the LangSmith UI. */
    projectName: string;
    /** Override for self-hosted LangSmith. Default https://api.smith.langchain.com */
    baseUrl?: string;
    /**
     * Optional sanitiser applied to inputs/outputs before serialisation.
     * Receives the raw value, returns a sanitised one. Returning
     * `undefined` causes the field to be omitted entirely.
     */
    redact?: (value: unknown) => unknown;
    /**
     * Hard cap on bytes per run sent to LangSmith. Anything larger has its
     * inputs/outputs replaced with `{ truncated: true, originalBytes: N }`
     * before being shipped. Default 64 KB.
     */
    maxPayloadBytes?: number;
    /**
     * If true, never send inputs/outputs — only metadata (model, tokens,
     * latency, cost). Defense-in-depth for PII-sensitive workloads even
     * when a redactor is misconfigured. Default false.
     */
    metadataOnly?: boolean;
    /** Internal: override the buffer's batch size. Default 20. */
    bufferMaxSize?: number;
    /** Internal: override the buffer's flush interval. Default 5_000ms. */
    bufferFlushIntervalMs?: number;
    /** Internal: max flush attempts before dropping a batch. Default 5. */
    bufferMaxFlushAttempts?: number;
    /** Internal: base delay for buffer's retry backoff. Default 500ms. */
    bufferRetryBaseMs?: number;
    /** Internal: cap on buffer's retry backoff. Default 30_000ms. */
    bufferRetryMaxMs?: number;
    /** Internal: failures before the LangSmith breaker opens. Default 5. */
    circuitBreakerThreshold?: number;
    /** Internal: how long the breaker stays open. Default 30_000ms. */
    circuitBreakerCooldownMs?: number;
}

/**
 * A single completed LLM call to ship to LangSmith. Inputs/outputs are
 * subject to redaction, size capping, and `metadataOnly`. The bridge does
 * NOT mutate the record passed in — copies are made internally.
 */
export interface LangSmithRunRecord {
    /** UUID minted client-side via `bridge.mintRunId()` before the LLM call. */
    runId: string;
    /** Display name for the run, typically the model id. */
    name: string;
    /** Raw inputs to the LLM call. Subject to redact + size cap. */
    inputs?: unknown;
    /** Raw outputs from the LLM call. Subject to redact + size cap. */
    outputs?: unknown;
    /** Error message if the call failed. Stored verbatim — keep it free of secrets. */
    error?: string;
    /** When the LLM call started, captured by the caller before invoking `fn`. */
    startTime: Date;
    /** When the LLM call finished (or threw). */
    endTime: Date;
    /** Optional parent run id for nested traces. */
    parentRunId?: string;
    /** LangSmith run type. Default 'llm'. */
    runType?: 'llm' | 'chain' | 'tool' | 'retriever' | 'embedding' | 'prompt' | 'parser';
    /**
     * Free-form metadata recorded alongside the run. NOT subject to size
     * cap or redaction — keep it small and safe (model, tokens, costUsd).
     */
    metadata?: Record<string, unknown>;
}

export interface LangSmithBridge {
    /** Project name as configured. Used by GovernanceClient to stamp the AgentOS audit event. */
    readonly project: string;
    /** Generate a fresh UUID-shaped runId. */
    mintRunId(): string;
    /** Enqueue a completed LLM call for fanout. Non-blocking, never throws. */
    recordLLM(record: LangSmithRunRecord): void;
    /** Best-effort flush of the internal buffer. Called by GovernanceClient.shutdown(). */
    shutdown(): Promise<void>;
    /** Snapshot of the bridge's runtime state for getMetrics(). */
    getMetrics(): LangSmithBridgeMetrics;
}

export interface LangSmithBridgeMetrics {
    enabled: true;
    pending: number;
    dropped: number;
    breaker: { failures: number; openedAt: number | null; isOpen: boolean };
    lastFlushMs: number;
}

const DEFAULT_BASE_URL = 'https://api.smith.langchain.com';
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * Build the bridge. The function is exported so it can be unit-tested
 * directly without spinning up a full GovernanceClient — the existing
 * client wires this up under its `langsmith` config.
 */
export function createLangSmithBridge(config: LangSmithConfig): LangSmithBridge {
    if (!config.apiKey) {
        throw new Error('LangSmithConfig.apiKey is required when langsmith fanout is enabled');
    }
    if (!config.projectName) {
        throw new Error('LangSmithConfig.projectName is required when langsmith fanout is enabled');
    }

    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const maxPayloadBytes = config.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    const metadataOnly = config.metadataOnly ?? false;
    const redact = config.redact;

    // The bridge owns its own breaker — keyed only to the LangSmith host so
    // it cannot interfere with the agentos breakers held by GovernanceClient.
    const breaker = new CircuitBreaker(
        config.circuitBreakerThreshold ?? 5,
        config.circuitBreakerCooldownMs ?? 30_000,
    );

    let lastFlushMs = 0;

    const buffer = new EventBuffer(
        async (events) => {
            await flushBatch(baseUrl, config.apiKey, events, breaker);
            lastFlushMs = Date.now();
        },
        config.bufferMaxSize ?? 20,
        config.bufferFlushIntervalMs ?? 5_000,
        {
            ...(config.bufferMaxFlushAttempts !== undefined && {
                maxFlushAttempts: config.bufferMaxFlushAttempts,
            }),
            ...(config.bufferRetryBaseMs !== undefined && {
                retryBaseMs: config.bufferRetryBaseMs,
            }),
            ...(config.bufferRetryMaxMs !== undefined && {
                retryMaxMs: config.bufferRetryMaxMs,
            }),
        },
    );

    return {
        project: config.projectName,

        mintRunId(): string {
            return randomUUID();
        },

        recordLLM(record: LangSmithRunRecord): void {
            // Build the LangSmith wire payload up-front. Do it lazily
            // (i.e. inside push) so the redactor's CPU cost lands on the
            // caller's thread instead of inside the buffer's flush — the
            // caller already paid the LLM-call latency, a few microseconds
            // of redaction won't move the needle, and it keeps the flush
            // fast / lock-free.
            try {
                const wirePayload = buildWirePayload(record, {
                    project: config.projectName,
                    redact,
                    metadataOnly,
                    maxPayloadBytes,
                });
                buffer.push(wirePayload);
            } catch (err) {
                // A redactor that throws must NOT break the calling LLM
                // path. Drop the run and log once (without echoing the
                // payload — it might be the unredacted thing the user was
                // trying to keep out of LangSmith).
                console.warn(
                    '[LangSmithBridge] Dropping run; redactor or payload-build threw:',
                    err instanceof Error ? err.message : String(err),
                );
            }
        },

        async shutdown(): Promise<void> {
            await buffer.shutdown();
        },

        getMetrics(): LangSmithBridgeMetrics {
            return {
                enabled: true,
                pending: buffer.pending,
                dropped: buffer.dropped,
                breaker: breaker.state,
                lastFlushMs,
            };
        },
    };
}

interface BuildOptions {
    project: string;
    redact?: (value: unknown) => unknown;
    metadataOnly: boolean;
    maxPayloadBytes: number;
}

/**
 * Compose a LangSmith `post` entry from a record. Encodes redaction order
 * exactly: redact first, then size-cap. `metadataOnly` short-circuits both
 * so even a permissive redactor cannot leak inputs/outputs.
 *
 * Exposed on `module` only via the bridge's own use; not exported, not
 * part of the public API.
 */
function buildWirePayload(
    record: LangSmithRunRecord,
    opts: BuildOptions,
): Record<string, unknown> {
    let inputs: unknown = undefined;
    let outputs: unknown = undefined;

    if (!opts.metadataOnly) {
        if (record.inputs !== undefined) {
            const v = opts.redact ? opts.redact(record.inputs) : record.inputs;
            if (v !== undefined) inputs = capPayload(v, opts.maxPayloadBytes);
        }
        if (record.outputs !== undefined) {
            const v = opts.redact ? opts.redact(record.outputs) : record.outputs;
            if (v !== undefined) outputs = capPayload(v, opts.maxPayloadBytes);
        }
    }

    // LangSmith API contract:
    //   - id, name, run_type, start_time, end_time are required-ish.
    //   - session_name routes the run to a project.
    //   - error nudges the UI to render it as a failed run.
    //   - extra.metadata is a free-form bag rendered in the run sidebar.
    const post: Record<string, unknown> = {
        id: record.runId,
        name: record.name,
        run_type: record.runType ?? 'llm',
        start_time: record.startTime.toISOString(),
        end_time: record.endTime.toISOString(),
        session_name: opts.project,
    };
    if (inputs !== undefined) post['inputs'] = inputs;
    if (outputs !== undefined) post['outputs'] = outputs;
    if (record.error !== undefined) post['error'] = record.error;
    if (record.parentRunId !== undefined) post['parent_run_id'] = record.parentRunId;
    if (record.metadata !== undefined) post['extra'] = { metadata: record.metadata };

    return post;
}

/**
 * If serialising `value` exceeds `maxBytes`, replace the entire value with
 * a placeholder marker recording the original size. Truncating *inside*
 * the value would risk producing invalid JSON or partial PII; replacing
 * wholesale is a clean signal to the operator that the redactor or size
 * limit needs tuning.
 *
 * Uses `Buffer.byteLength` for an O(n) byte count. Returns `value` unchanged
 * when under the limit.
 */
function capPayload(value: unknown, maxBytes: number): unknown {
    let serialised: string;
    try {
        serialised = JSON.stringify(value);
    } catch {
        // Circular / unserialisable — replace with a marker so the bridge
        // doesn't crash on unexpected input shapes.
        return { __unserialisable: true };
    }

    const bytes = Buffer.byteLength(serialised, 'utf8');
    if (bytes <= maxBytes) return value;

    return { __truncated: true, originalBytes: bytes, maxBytes };
}

/**
 * POST a batch of run records to LangSmith. Honors the breaker — when
 * open, returns immediately so the EventBuffer's retry policy backs off
 * on its own schedule rather than hammering a known-broken upstream.
 *
 * Errors are rethrown so the EventBuffer can requeue / drop after retry
 * exhaustion. The error message is *generic*: it includes the HTTP
 * status but NEVER the request body, response body, or `Authorization`
 * header. Echoing those would risk leaking the LangSmith API key into
 * Pino logs / Sentry / customer dashboards.
 */
async function flushBatch(
    baseUrl: string,
    apiKey: string,
    events: Record<string, unknown>[],
    breaker: CircuitBreaker,
): Promise<void> {
    if (!breaker.canRequest()) {
        throw new Error('LangSmith circuit breaker open — skipping batch');
    }

    const url = `${baseUrl}/runs/batch`;
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify({ post: events, patch: [] }),
        });
    } catch (err) {
        breaker.recordFailure();
        // Underlying fetch errors occasionally surface the request context
        // (e.g. some HTTP/2 stacks include header strings in socket-level
        // errors). Even though we set the key in `X-API-Key`, scrub it
        // defensively so a leaky transport library can't leak our key into
        // the EventBuffer's `console.warn` logs.
        const raw = err instanceof Error ? err.message : 'unknown';
        throw new Error(`LangSmith batch transport error: ${scrubApiKey(raw, apiKey)}`);
    }

    if (res.status >= 500) {
        breaker.recordFailure();
        throw new Error(`LangSmith batch failed: HTTP ${res.status}`);
    }

    if (!res.ok) {
        // 4xx — config error; retrying won't help. Record as failure
        // (so the breaker eventually opens on a flapping bad key) but
        // don't requeue: throwing here lets EventBuffer retry once or
        // twice and then drop, which is the right behavior for a 4xx.
        breaker.recordFailure();
        throw new Error(`LangSmith batch rejected: HTTP ${res.status}`);
    }

    breaker.recordSuccess();
}

/**
 * Replace any occurrence of the API key in a string with a fixed marker.
 * O(n) and allocation-light; called only on the cold error path so cost
 * is irrelevant. Intentionally simple — we don't try to mask substrings,
 * Base64 encodings, or other transformations because the only known leak
 * vector is verbatim-in-error-message. If the underlying lib is doing
 * something fancier, we have bigger problems than redaction.
 */
function scrubApiKey(message: string, apiKey: string): string {
    if (!apiKey) return message;
    return message.split(apiKey).join('[REDACTED]');
}
