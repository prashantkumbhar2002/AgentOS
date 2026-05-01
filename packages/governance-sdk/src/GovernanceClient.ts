import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventBuffer } from './EventBuffer.js';
import { SpanManager } from './SpanManager.js';
import { CircuitBreakerRegistry, routeKeyFromUrl } from './CircuitBreaker.js';

interface TraceContext {
    traceId: string;
}

export interface LLMCallMetadata {
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    /**
     * LangSmith run id this call was also reported to. When the SDK gains
     * an optional LangSmith fanout (planned PR4), it will mint this id
     * client-side and pass it through both the AgentOS audit event and
     * the LangSmith run, letting the dashboard cross-link the two views.
     * Today this field is plumbed end-to-end so callers can populate it
     * manually (e.g. when using LangChain's tracer alongside the SDK).
     *
     * Server-side validation: max 64 chars, `^[A-Za-z0-9_-]+$`.
     */
    langsmithRunId?: string;
    /**
     * Logical LangSmith project name (NOT a URL). Allows grouping runs
     * across agents that share a workflow.
     *
     * Server-side validation: max 128 chars, `^[A-Za-z0-9_\-/.]+$`.
     */
    langsmithProject?: string;
}

export interface BudgetConfig {
    maxCostUsd: number;
    warnAtUsd?: number;
    onBudgetExceeded?: 'throw' | 'warn' | 'log';
}

export interface ResilienceConfig {
    onPlatformUnavailable?: 'fail-open' | 'fail-closed';
    /** Total fetch attempts including the first one. Default: 1 (no retry). */
    retryAttempts?: number;
    /**
     * Base delay (ms) for exponential backoff between retries. Actual wait is
     * `random(0, min(retryMaxMs, retryDelayMs * 2^attempt))` — full jitter.
     * Default: 1000.
     */
    retryDelayMs?: number;
    /** Cap on per-retry backoff window. Default: 30_000. */
    retryMaxMs?: number;
    /** Failures before the per-route breaker opens. Default: 5. */
    circuitBreakerThreshold?: number;
    /** How long the breaker stays open before allowing a probe. Default: 30s. */
    circuitBreakerCooldownMs?: number;
}

export interface CallToolOptions {
    skipPolicyCheck?: boolean;
    riskScore?: number;
    approvalParams?: { reasoning: string; payload?: unknown };
}

export interface GovernanceClientConfig {
    platformUrl: string;
    agentId: string;
    apiKey: string;
    budget?: BudgetConfig;
    resilience?: ResilienceConfig;
    bufferMaxSize?: number;
    bufferFlushIntervalMs?: number;
    /** Hard cap on queued events; oldest dropped on overflow. Defaults to 50× batch size. */
    bufferMaxQueueSize?: number;
    /** Max retry attempts per batch before dropping. Default 5. */
    bufferMaxFlushAttempts?: number;
    /**
     * Automatically register process exit handlers (SIGINT/SIGTERM/beforeExit)
     * to best-effort flush remaining buffered events. Default: true in Node.js.
     * Set to false if you manage shutdown explicitly.
     */
    autoShutdown?: boolean;
    /**
     * How long the SDK waits for an SSE-pushed approval resolution before
     * falling back to HTTP polling. The previous 10s default kept agents
     * blocked needlessly when the SSE handshake silently failed (e.g. proxy
     * dropped the connection); 2.5s is a tight ceiling that still rides the
     * happy path while degrading fast. Default: 2_500.
     */
    sseConnectTimeoutMs?: number;
}

export type PolicyDenialKind = 'POLICY' | 'APPROVAL_DENIED' | 'APPROVAL_EXPIRED' | 'APPROVAL_TIMEOUT' | 'UNKNOWN';

export class PolicyDeniedError extends Error {
    constructor(
        public readonly actionType: string,
        public readonly reason: string,
        public readonly ticketId?: string,
        public readonly kind: PolicyDenialKind = 'POLICY',
    ) {
        super(`Policy denied action "${actionType}": ${reason}`);
        this.name = 'PolicyDeniedError';
    }
}

export function isPolicyDeniedError(err: unknown): err is PolicyDeniedError {
    if (err instanceof PolicyDeniedError) return true;
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as { name?: unknown }).name === 'PolicyDeniedError'
    );
}

export class BudgetExceededError extends Error {
    constructor(
        public readonly currentCost: number,
        public readonly maxCost: number,
    ) {
        super(`Budget exceeded: $${currentCost.toFixed(6)} / $${maxCost.toFixed(6)}`);
        this.name = 'BudgetExceededError';
    }
}

/**
 * Categorises why an approval request failed before the policy decision was
 * reached. Lets callers distinguish a real `DENIED` from an integration
 * issue (bad API key, rate limit, server outage).
 */
export type ApprovalRequestErrorKind =
    | 'NETWORK'        // socket/dns/circuit-breaker — server never answered
    | 'AUTH'           // 401 — bad or missing API key
    | 'FORBIDDEN'      // 403 not caused by policy — e.g. agent scope mismatch
    | 'NOT_FOUND'      // 404 — endpoint or agent missing
    | 'RATE_LIMITED'   // 429 — back off and retry later
    | 'SERVER'         // 5xx — transient server-side failure
    | 'INVALID_RESPONSE' // 2xx with malformed body (no ticketId)
    | 'UNKNOWN';

/**
 * Thrown by `requestApproval` (and surfaced from `callTool`) when the
 * approval ticket could not be created because of a transport, auth, or
 * server problem — *not* because a human/policy denied the action. Inspect
 * `kind` to decide whether to retry, alert, or fail closed.
 *
 * @example
 *   try {
 *     await gov.callTool('charge_card', inputs, run, { riskScore: 0.9 });
 *   } catch (err) {
 *     if (isApprovalRequestError(err) && err.kind === 'AUTH') {
 *       throw new Error('AgentOS API key is invalid');
 *     }
 *     throw err;
 *   }
 */
export class ApprovalRequestError extends Error {
    constructor(
        public readonly kind: ApprovalRequestErrorKind,
        public readonly httpStatus: number,
        public readonly body: unknown,
        message?: string,
    ) {
        super(message ?? `Approval request failed (${kind}, HTTP ${httpStatus})`);
        this.name = 'ApprovalRequestError';
    }
}

export function isApprovalRequestError(err: unknown): err is ApprovalRequestError {
    if (err instanceof ApprovalRequestError) return true;
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as { name?: unknown }).name === 'ApprovalRequestError'
    );
}

export class GovernanceClient {
    private readonly platformUrl: string;
    private readonly agentId: string;
    private readonly apiKey: string;
    private readonly buffer: EventBuffer;
    private readonly spanManager: SpanManager;
    private readonly breakers: CircuitBreakerRegistry;
    private readonly budgetConfig?: BudgetConfig;
    private readonly resilienceConfig: ResilienceConfig;
    private readonly sseConnectTimeoutMs: number;
    private readonly traceStorage = new AsyncLocalStorage<TraceContext>();
    private readonly defaultTraceId: string;
    private cumulativeCostUsd = 0;
    private exitHandlersInstalled = false;
    private readonly exitHandlers = {
        beforeExit: () => { void this.shutdown(); },
        sigint: () => { void this.shutdown().finally(() => process.exit(130)); },
        sigterm: () => { void this.shutdown().finally(() => process.exit(143)); },
    };

    constructor(config: GovernanceClientConfig) {
        this.platformUrl = config.platformUrl.replace(/\/$/, '');
        this.agentId = config.agentId;
        this.apiKey = config.apiKey;
        this.defaultTraceId = randomUUID();
        this.budgetConfig = config.budget;
        this.resilienceConfig = config.resilience ?? {};
        this.sseConnectTimeoutMs = config.sseConnectTimeoutMs ?? 2_500;
        this.spanManager = new SpanManager();
        this.breakers = new CircuitBreakerRegistry(
            config.resilience?.circuitBreakerThreshold ?? 5,
            config.resilience?.circuitBreakerCooldownMs ?? 30_000,
        );

        this.buffer = new EventBuffer(
            (events) => this.flushEvents(events),
            config.bufferMaxSize ?? 20,
            config.bufferFlushIntervalMs ?? 5_000,
            {
                maxQueueSize: config.bufferMaxQueueSize,
                maxFlushAttempts: config.bufferMaxFlushAttempts,
            },
        );

        if ((config.autoShutdown ?? true) && typeof process !== 'undefined' && typeof process.on === 'function') {
            this.installExitHandlers();
        }
    }

    private installExitHandlers(): void {
        if (this.exitHandlersInstalled) return;
        this.exitHandlersInstalled = true;
        process.once('beforeExit', this.exitHandlers.beforeExit);
        // SIGINT/SIGTERM: only install if no other handler exists, to avoid
        // double-handling in apps that already manage signals themselves.
        if (process.listenerCount('SIGINT') === 0) {
            process.once('SIGINT', this.exitHandlers.sigint);
        }
        if (process.listenerCount('SIGTERM') === 0) {
            process.once('SIGTERM', this.exitHandlers.sigterm);
        }
    }

    private uninstallExitHandlers(): void {
        if (!this.exitHandlersInstalled) return;
        this.exitHandlersInstalled = false;
        process.off('beforeExit', this.exitHandlers.beforeExit);
        process.off('SIGINT', this.exitHandlers.sigint);
        process.off('SIGTERM', this.exitHandlers.sigterm);
    }

    /**
     * The traceId currently in scope. Returns the active per-invocation trace
     * inside `withTrace`, otherwise the long-lived default for this client.
     */
    get traceId(): string {
        return this.traceStorage.getStore()?.traceId ?? this.defaultTraceId;
    }

    /** Mint a fresh trace ID without entering it. Useful when correlating IDs across boundaries. */
    newTraceId(): string {
        return randomUUID();
    }

    /**
     * Run `fn` inside an isolated trace context. All `logEvent`, `wrapLLMCall`,
     * `callTool`, `withSpan`, etc. invocations inside `fn` will use the given
     * (or freshly generated) traceId, even when called concurrently from a
     * shared client instance.
     *
     * @example
     *   app.post('/run', async (req, res) => {
     *     await gov.withTrace(async () => {
     *       await runAgent(req.body);
     *     });
     *   });
     */
    withTrace<T>(fn: () => T | Promise<T>, traceId?: string): T | Promise<T> {
        return this.traceStorage.run(
            { traceId: traceId ?? randomUUID() },
            () => this.spanManager.runInIsolatedStack(fn),
        );
    }

    /**
     * Enqueue an arbitrary audit event. Use this for one-off signals the
     * higher-level helpers (`wrapLLMCall`, `callTool`, `withSpan`) don't
     * already cover — e.g. business events, custom action types, or
     * external system handoffs.
     *
     * The call is non-blocking: the event is appended to the in-memory
     * `EventBuffer` and flushed on the next batch boundary or interval.
     * `agentId`, `traceId`, `spanId`, and `parentSpanId` are stamped
     * automatically from ambient context so callers don't repeat themselves.
     */
    logEvent(payload: Record<string, unknown>): void {
        this.buffer.push({
            agentId: this.agentId,
            traceId: this.traceId,
            spanId: this.spanManager.currentSpanId,
            parentSpanId: this.spanManager.currentParentSpanId,
            ...payload,
        });
    }

    /**
     * Wrap any async LLM call so the SDK records tokens, cost, latency,
     * and success/failure as a single `llm_call` audit event. `metadata`
     * may be a static object or a function called with the resolved result
     * (use the latter when token counts are only known after the call).
     *
     * Throws `BudgetExceededError` (synchronously, before `fn` runs) when
     * the client-side budget cap has been hit and `BudgetConfig.onBudgetExceeded`
     * is `'throw'` (the default). Errors from `fn` are re-thrown unchanged
     * after a failure event is logged.
     *
     * @example
     *   const msg = await gov.wrapLLMCall(
     *     () => anthropic.messages.create({ model, ... }),
     *     (result) => ({
     *       provider: 'anthropic',
     *       model,
     *       inputTokens: result.usage.input_tokens,
     *       outputTokens: result.usage.output_tokens,
     *       costUsd: estimateCost(result),
     *     }),
     *   );
     */
    async wrapLLMCall<T>(
        fn: () => Promise<T>,
        metadata: LLMCallMetadata | ((result: T) => LLMCallMetadata),
    ): Promise<T> {
        this.checkBudget();
        const start = Date.now();

        try {
            const result = await fn();
            const latencyMs = Date.now() - start;
            const meta = typeof metadata === 'function' ? metadata(result) : metadata;
            const costUsd = meta.costUsd ?? 0;

            this.trackCost(costUsd);
            this.logEvent({
                event: 'llm_call',
                model: meta.model,
                provider: meta.provider,
                inputTokens: meta.inputTokens,
                outputTokens: meta.outputTokens,
                costUsd,
                latencyMs,
                success: true,
                ...(meta.langsmithRunId !== undefined && { langsmithRunId: meta.langsmithRunId }),
                ...(meta.langsmithProject !== undefined && { langsmithProject: meta.langsmithProject }),
            });

            return result;
        } catch (err) {
            const latencyMs = Date.now() - start;
            const meta = typeof metadata === 'function'
                ? { provider: 'unknown', model: 'unknown' }
                : metadata;

            this.logEvent({
                event: 'llm_call',
                model: meta.model,
                provider: meta.provider,
                latencyMs,
                success: false,
                errorMsg: err instanceof Error ? err.message : String(err),
                // Failure paths still cross-link to LangSmith if the caller knew
                // the run id ahead of time — e.g. when the id was minted client-side
                // before the LLM call started.
                ...(meta.langsmithRunId !== undefined && { langsmithRunId: meta.langsmithRunId }),
                ...(meta.langsmithProject !== undefined && { langsmithProject: meta.langsmithProject }),
            });
            throw err;
        }
    }

    /**
     * Wrap a streaming LLM call. Returns an async iterable that yields each
     * chunk to the caller while collecting them for `onComplete`, which is
     * invoked exactly once after the caller has finished iterating (or after
     * the stream errors). The original stream is NOT consumed by the SDK.
     *
     * @example
     *   for await (const chunk of gov.wrapLLMStream(
     *     () => client.messages.stream(...),
     *     (chunks) => ({ provider: 'anthropic', model, inputTokens, outputTokens, costUsd })
     *   )) {
     *     process.stdout.write(chunk.delta);
     *   }
     */
    wrapLLMStream<TChunk>(
        fn: () => AsyncIterable<TChunk>,
        onComplete: (chunks: TChunk[]) => LLMCallMetadata | void,
    ): AsyncIterable<TChunk> {
        this.checkBudget();
        const start = Date.now();
        const source = fn();
        const logEvent = this.logEvent.bind(this);
        const trackCost = this.trackCost.bind(this);

        return {
            [Symbol.asyncIterator]: async function* () {
                const collected: TChunk[] = [];
                try {
                    for await (const chunk of source) {
                        collected.push(chunk);
                        yield chunk;
                    }
                    const latencyMs = Date.now() - start;
                    const meta = onComplete(collected);
                    if (meta) {
                        const costUsd = meta.costUsd ?? 0;
                        trackCost(costUsd);
                        logEvent({
                            event: 'llm_call',
                            model: meta.model,
                            provider: meta.provider,
                            inputTokens: meta.inputTokens,
                            outputTokens: meta.outputTokens,
                            costUsd,
                            latencyMs,
                            success: true,
                            ...(meta.langsmithRunId !== undefined && { langsmithRunId: meta.langsmithRunId }),
                            ...(meta.langsmithProject !== undefined && { langsmithProject: meta.langsmithProject }),
                        });
                    }
                } catch (err) {
                    const latencyMs = Date.now() - start;
                    logEvent({
                        event: 'llm_call',
                        provider: 'unknown',
                        model: 'unknown',
                        latencyMs,
                        success: false,
                        errorMsg: err instanceof Error ? err.message : String(err),
                    });
                    throw err;
                }
            },
        };
    }

    /**
     * Run `fn` as a governed tool invocation.
     *
     * The lifecycle is:
     *   1. If `options.riskScore` is provided (and `skipPolicyCheck` is not),
     *      consult `/policies/check`. A `DENY` rejects with `PolicyDeniedError`;
     *      a `REQUIRE_APPROVAL` opens an approval ticket and blocks until the
     *      ticket resolves (push via SSE, fall back to polling).
     *   2. On approval (or when no policy gate applies), `fn` is invoked.
     *   3. Success/failure is recorded as a `tool_call` audit event with
     *      `inputs`, latency, and any error message. The original error from
     *      `fn` is re-thrown unchanged.
     *
     * `inputs` is captured into the audit log verbatim — strip secrets *before*
     * passing them in. Use `options.approvalParams` to override the reasoning
     * shown to human reviewers (defaults to a generic message).
     *
     * @example
     *   await gov.callTool(
     *     'send_email',
     *     { to, subject, body },
     *     () => emailClient.send({ to, subject, body }),
     *     { riskScore: 0.6, approvalParams: { reasoning: 'Cold outreach to lead' } },
     *   );
     *
     * @throws PolicyDeniedError when policy denies or a human/approval lifecycle blocks the action.
     * @throws ApprovalRequestError when the approval API itself is unreachable or misconfigured.
     */
    async callTool<T>(
        toolName: string,
        inputs: Record<string, unknown>,
        fn: () => Promise<T>,
        options?: CallToolOptions,
    ): Promise<T> {
        if (!options?.skipPolicyCheck && options?.riskScore !== undefined) {
            const policyResult = await this.checkPolicy(toolName, options.riskScore);

            if (policyResult.effect === 'DENY') {
                this.logEvent({
                    event: 'action_blocked',
                    toolName,
                    inputs,
                    reason: policyResult.reason,
                });
                throw new PolicyDeniedError(toolName, policyResult.reason);
            }

            if (policyResult.effect === 'REQUIRE_APPROVAL') {
                const approvalParams = options.approvalParams ?? {
                    reasoning: `Tool "${toolName}" requires approval per policy`,
                };

                let decision: string;
                let ticketId: string;
                try {
                    ({ decision, ticketId } = await this.requestApproval({
                        actionType: toolName,
                        payload: approvalParams.payload ?? inputs,
                        reasoning: approvalParams.reasoning,
                        riskScore: options.riskScore,
                    }));
                } catch (err) {
                    if (isApprovalRequestError(err)) {
                        this.logEvent({
                            event: 'action_blocked',
                            toolName,
                            inputs,
                            reason: `Approval request error: ${err.kind} (HTTP ${err.httpStatus})`,
                        });
                    }
                    throw err;
                }

                if (decision !== 'APPROVED' && decision !== 'AUTO_APPROVED') {
                    this.logEvent({
                        event: 'action_blocked',
                        toolName,
                        inputs,
                        reason: `Approval ${decision}`,
                        ticketId,
                    });
                    const kind: PolicyDenialKind =
                        decision === 'DENIED' ? 'APPROVAL_DENIED'
                            : decision === 'EXPIRED' ? 'APPROVAL_EXPIRED'
                                : decision === 'TIMEOUT' ? 'APPROVAL_TIMEOUT'
                                    : 'UNKNOWN';
                    throw new PolicyDeniedError(
                        toolName,
                        `Approval ${decision}`,
                        ticketId || undefined,
                        kind,
                    );
                }
            }
        }

        const start = Date.now();

        try {
            const result = await fn();
            const latencyMs = Date.now() - start;
            this.logEvent({
                event: 'tool_call',
                toolName,
                inputs,
                latencyMs,
                success: true,
            });
            return result;
        } catch (err) {
            const latencyMs = Date.now() - start;
            this.logEvent({
                event: 'tool_call',
                toolName,
                inputs,
                latencyMs,
                success: false,
                errorMsg: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }

    /**
     * Create an approval ticket and wait for its resolution. On success
     * returns `{ decision, ticketId }` where `decision` is one of
     * `AUTO_APPROVED | APPROVED | DENIED | EXPIRED | TIMEOUT`.
     *
     * Transport, auth, and server errors are surfaced as typed exceptions
     * (not silently mapped to `DENIED`):
     *   - `PolicyDeniedError` — the server's policy engine blocked the
     *     action (HTTP 403 with code `POLICY_BLOCKED`).
     *   - `ApprovalRequestError` — bad API key, rate limit, 5xx, malformed
     *     response, or — when `resilience.onPlatformUnavailable !== 'fail-open'`
     *     — a network/circuit-breaker failure. Inspect `err.kind`.
     *
     * When `resilience.onPlatformUnavailable === 'fail-open'`, network
     * failures resolve to `{ decision: 'AUTO_APPROVED', ticketId: '' }` so
     * agents keep moving during platform outages.
     */
    async requestApproval(params: {
        actionType: string;
        payload: unknown;
        reasoning: string;
        riskScore: number;
        pollIntervalMs?: number;
        maxWaitMs?: number;
    }): Promise<{ decision: string; ticketId: string }> {
        const pollInterval = params.pollIntervalMs ?? 3_000;
        const maxWait = params.maxWaitMs ?? 30 * 60 * 1000;

        let createRes: Response;
        try {
            createRes = await this.fetchWithResilience(
                `${this.platformUrl}/api/v1/approvals`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify({
                        agentId: this.agentId,
                        actionType: params.actionType,
                        payload: params.payload,
                        riskScore: params.riskScore,
                        reasoning: params.reasoning,
                    }),
                },
            );
        } catch (err) {
            if (this.resilienceConfig.onPlatformUnavailable === 'fail-open') {
                console.warn('[GovernanceClient] Platform unreachable; auto-approving (fail-open):', err);
                return { decision: 'AUTO_APPROVED', ticketId: '' };
            }
            throw new ApprovalRequestError(
                'NETWORK',
                0,
                undefined,
                `Approval request transport error: ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        const createBody = await this.safeJson(createRes);

        if (createRes.ok) {
            if (createBody && (createBody as Record<string, unknown>)['status'] === 'AUTO_APPROVED') {
                return { decision: 'AUTO_APPROVED', ticketId: '' };
            }
            const ticketId = createBody && (createBody as Record<string, unknown>)['ticketId'];
            if (typeof ticketId !== 'string' || !ticketId) {
                throw new ApprovalRequestError(
                    'INVALID_RESPONSE',
                    createRes.status,
                    createBody,
                    'Approval API returned no ticketId',
                );
            }
            return await this.waitForApproval(ticketId, pollInterval, maxWait);
        }

        // Map non-success HTTP status to a typed error.
        const errCode =
            createBody && typeof createBody === 'object'
                ? (createBody as Record<string, unknown>)['error']
                : undefined;

        if (createRes.status === 403 && errCode === 'POLICY_BLOCKED') {
            const message =
                (createBody as Record<string, unknown> | null)?.['message'] as string | undefined
                ?? `Action "${params.actionType}" blocked by policy`;
            throw new PolicyDeniedError(params.actionType, message, undefined, 'POLICY');
        }

        const kind: ApprovalRequestErrorKind =
            createRes.status === 401 ? 'AUTH'
                : createRes.status === 403 ? 'FORBIDDEN'
                    : createRes.status === 404 ? 'NOT_FOUND'
                        : createRes.status === 429 ? 'RATE_LIMITED'
                            : createRes.status >= 500 ? 'SERVER'
                                : 'UNKNOWN';

        throw new ApprovalRequestError(
            kind,
            createRes.status,
            createBody,
            `Approval request failed: HTTP ${createRes.status}`,
        );
    }

    private async safeJson(res: Response): Promise<unknown> {
        try {
            return await res.json();
        } catch {
            return null;
        }
    }

    /**
     * Ask the platform what should happen for `actionType` at the given
     * `riskScore`. Returns `{ effect, reason }` where `effect` is one of
     * `'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL'`.
     *
     * This call is **resilient by design** and never throws:
     *   - On non-2xx responses (other than 4xx contract errors) it returns
     *     `REQUIRE_APPROVAL` so callers fail closed when the platform is in
     *     a degraded state.
     *   - On transport failures the result depends on `ResilienceConfig.onPlatformUnavailable`:
     *     `'fail-open'` returns `ALLOW`; the default fail-closed returns
     *     `REQUIRE_APPROVAL` (safer for production).
     *
     * Most callers should use `callTool` instead — it wires `checkPolicy` +
     * `requestApproval` + tool execution + audit logging together.
     */
    async checkPolicy(
        actionType: string,
        riskScore: number,
        context?: Record<string, unknown>,
    ): Promise<{ effect: string; reason: string }> {
        try {
            const res = await this.fetchWithResilience(
                `${this.platformUrl}/api/v1/policies/check`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify({
                        agentId: this.agentId,
                        actionType,
                        riskScore,
                        context,
                    }),
                },
            );

            if (!res.ok) {
                return { effect: 'REQUIRE_APPROVAL', reason: 'Policy check failed — defaulting to require approval' };
            }

            return (await res.json()) as { effect: string; reason: string };
        } catch {
            return this.resilienceConfig.onPlatformUnavailable === 'fail-open'
                ? { effect: 'ALLOW', reason: 'Platform unavailable — fail-open' }
                : { effect: 'REQUIRE_APPROVAL', reason: 'Platform unavailable — fail-closed' };
        }
    }

    /**
     * Manually open a span. Prefer `withSpan(name, fn)` — it pairs the
     * `startSpan`/`endSpan` for you and tags failures automatically.
     * Returns the new span id so callers can correlate it externally.
     */
    startSpan(name: string): string {
        return this.spanManager.startSpan(name);
    }

    /** Close the most recently opened span. Pairs with `startSpan`. */
    endSpan(): void {
        this.spanManager.endSpan();
    }

    /**
     * Run `fn` inside a named span. All events emitted from within `fn` are
     * tagged with the span's id so the dashboard can render them as a tree.
     *
     * On rejection an extra `span_failed` audit event is emitted carrying
     * the span name, latency, and error message — without it the trace UI
     * has to inspect every child event to decide whether the span succeeded.
     * The original error is always re-thrown unchanged.
     */
    async withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        this.startSpan(name);
        try {
            return await fn();
        } catch (err) {
            const latencyMs = Date.now() - start;
            this.logEvent({
                event: 'span_failed',
                latencyMs,
                success: false,
                errorMsg: err instanceof Error ? err.message : String(err),
                metadata: { spanName: name },
            });
            throw err;
        } finally {
            this.endSpan();
        }
    }

    /**
     * Cumulative cost (USD) tracked by `wrapLLMCall` and `wrapLLMStream`
     * for the lifetime of this client instance. Resets only when a new
     * client is constructed. Use `getMetrics()` for a richer snapshot.
     */
    get currentCost(): number {
        return this.cumulativeCostUsd;
    }

    /**
     * Snapshot of the SDK's runtime state. Intended for `/healthz` endpoints,
     * Prometheus exporters, or ad-hoc debugging — *not* something to poll on
     * a hot path. Cheap (no I/O), lock-free, and never throws.
     *
     * Fields:
     *   - `cost.cumulativeUsd` — total spend tracked by `wrapLLMCall`/`wrapLLMStream`
     *     since process start.
     *   - `cost.budgetUsd` — configured `BudgetConfig.maxCostUsd` if any.
     *   - `buffer.pending` — events queued but not yet flushed.
     *   - `buffer.dropped` — events lost due to overflow or repeated flush failures.
     *   - `breakers` — per-route circuit-breaker state (open/closed, failure count).
     *   - `traceId` — the active traceId in scope (per-trace inside `withTrace`).
     */
    getMetrics(): {
        cost: { cumulativeUsd: number; budgetUsd: number | null };
        buffer: { pending: number; dropped: number };
        breakers: Record<string, { failures: number; openedAt: number | null; isOpen: boolean }>;
        traceId: string;
    } {
        return {
            cost: {
                cumulativeUsd: this.cumulativeCostUsd,
                budgetUsd: this.budgetConfig?.maxCostUsd ?? null,
            },
            buffer: {
                pending: this.buffer.pending,
                dropped: this.buffer.dropped,
            },
            breakers: this.breakers.snapshot(),
            traceId: this.traceId,
        };
    }

    /**
     * Best-effort flush of buffered events and removal of process exit
     * handlers. Safe to call multiple times. Long-running processes
     * generally don't need to call this manually — `autoShutdown` (default
     * `true`) wires it to `beforeExit`/`SIGINT`/`SIGTERM`. Tests and
     * short-lived scripts should `await gov.shutdown()` to make sure their
     * final batch is delivered before the process exits.
     */
    async shutdown(): Promise<void> {
        this.uninstallExitHandlers();
        await this.buffer.shutdown();
    }

    private async waitForApproval(
        ticketId: string,
        pollInterval: number,
        maxWait: number,
    ): Promise<{ decision: string; ticketId: string }> {
        // Try SSE first
        try {
            const tokenRes = await this.fetchWithResilience(
                `${this.platformUrl}/api/v1/events/token`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                },
            );

            if (tokenRes.ok) {
                const { sseToken } = (await tokenRes.json()) as { sseToken: string };
                const sseResult = await this.waitForApprovalViaSSE(ticketId, sseToken, maxWait);
                if (sseResult) return sseResult;
            }
        } catch {
            // SSE unavailable, fall through to polling
        }

        return this.pollForApproval(ticketId, pollInterval, maxWait);
    }

    private async waitForApprovalViaSSE(
        ticketId: string,
        sseToken: string,
        maxWait: number,
    ): Promise<{ decision: string; ticketId: string } | null> {
        const Ctor = await getEventSourceCtor();
        if (!Ctor) {
            // No EventSource and no `eventsource` polyfill installed —
            // signal a fallback to polling. Warning is emitted once by
            // `getEventSourceCtor` itself.
            return null;
        }

        return new Promise((resolve) => {
            // Cap the SSE attempt at the configured connect timeout (default 2.5s)
            // so we fall back to polling quickly when the upgrade is silently
            // dropped (load balancers, corporate proxies, etc.). The full
            // approval wait still uses `maxWait` via `pollForApproval`.
            const timeout = setTimeout(() => {
                resolve(null);
            }, Math.min(maxWait, this.sseConnectTimeoutMs));

            try {
                const url = `${this.platformUrl}/api/v1/events/agent-stream?token=${sseToken}&ticketId=${ticketId}`;
                const es = new Ctor(url);
                es.onmessage = (event: MessageEvent) => {
                    try {
                        const data = JSON.parse(event.data as string) as Record<string, unknown>;
                        if (
                            data['type'] === 'approval.resolved' &&
                            (data['payload'] as Record<string, unknown>)?.['ticketId'] === ticketId
                        ) {
                            clearTimeout(timeout);
                            es.close();
                            const payload = data['payload'] as Record<string, unknown>;
                            resolve({
                                decision: payload['decision'] as string,
                                ticketId,
                            });
                        }
                    } catch { /* ignore parse errors */ }
                };
                es.onerror = () => {
                    clearTimeout(timeout);
                    es.close();
                    resolve(null);
                };
            } catch {
                clearTimeout(timeout);
                resolve(null);
            }
        });
    }

    private async pollForApproval(
        ticketId: string,
        pollInterval: number,
        maxWait: number,
    ): Promise<{ decision: string; ticketId: string }> {
        const deadline = Date.now() + maxWait;

        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, pollInterval));

            try {
                const pollRes = await this.fetchWithResilience(
                    `${this.platformUrl}/api/v1/approvals/${ticketId}`,
                    { headers: { Authorization: `Bearer ${this.apiKey}` } },
                );

                if (!pollRes.ok) continue;

                const ticket = (await pollRes.json()) as Record<string, unknown>;
                const status = ticket['status'] as string;

                if (status !== 'PENDING') {
                    return { decision: status, ticketId };
                }
            } catch {
                console.warn('[GovernanceClient] Poll error — retrying');
            }
        }

        return { decision: 'EXPIRED', ticketId };
    }

    private async flushEvents(events: Record<string, unknown>[]): Promise<void> {
        const res = await this.fetchWithResilience(
            `${this.platformUrl}/api/v1/audit/batch`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({ events }),
            },
        );

        if (res.ok) return;

        // 402 = server-side budget cap hit. Hard-failure — drop the batch
        // instead of retrying individual events (each would also be rejected)
        // and let the EventBuffer's retry policy handle nothing further.
        if (res.status === 402) {
            console.warn(
                `[GovernanceClient] Audit batch rejected: server budget cap reached (HTTP 402). Dropping ${events.length} events.`,
            );
            return;
        }

        // 4xx other than 402 — almost certainly a config issue (auth, schema).
        // Surfacing avoids burning retries on something a retry can't fix.
        if (res.status >= 400 && res.status < 500) {
            const body = await this.safeJson(res);
            throw new Error(
                `Audit batch rejected: HTTP ${res.status} ${JSON.stringify(body) || ''}`,
            );
        }

        // 5xx / unknown — let EventBuffer requeue with backoff.
        throw new Error(`Audit batch flush failed: HTTP ${res.status}`);
    }

    private async fetchWithResilience(
        url: string,
        init?: RequestInit,
    ): Promise<Response> {
        const routeKey = routeKeyFromUrl(url);
        const breaker = this.breakers.get(routeKey);

        if (!breaker.canRequest()) {
            throw new Error(`Circuit breaker open for route "${routeKey}" — platform unavailable`);
        }

        const attempts = this.resilienceConfig.retryAttempts ?? 1;
        const baseMs = this.resilienceConfig.retryDelayMs ?? 1000;
        const maxMs = this.resilienceConfig.retryMaxMs ?? 30_000;
        let lastError: Error | undefined;

        for (let i = 0; i < attempts; i++) {
            try {
                const res = await fetch(url, init);
                // 5xx is a server-side failure: count it against the breaker
                // even though we got a Response, otherwise repeated 500s never
                // open the circuit and we'd retry indefinitely.
                if (res.status >= 500) {
                    breaker.recordFailure();
                    if (i < attempts - 1) {
                        await new Promise((r) => setTimeout(r, computeBackoffMs(i, baseMs, maxMs)));
                        continue;
                    }
                    return res;
                }
                breaker.recordSuccess();
                return res;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                breaker.recordFailure();
                if (i < attempts - 1) {
                    await new Promise((r) => setTimeout(r, computeBackoffMs(i, baseMs, maxMs)));
                }
            }
        }

        throw lastError ?? new Error('Fetch failed');
    }

    private checkBudget(): void {
        if (!this.budgetConfig) return;

        if (this.cumulativeCostUsd >= this.budgetConfig.maxCostUsd) {
            const behavior = this.budgetConfig.onBudgetExceeded ?? 'throw';
            if (behavior === 'throw') {
                throw new BudgetExceededError(this.cumulativeCostUsd, this.budgetConfig.maxCostUsd);
            } else if (behavior === 'warn') {
                console.warn(`[GovernanceClient] Budget exceeded: $${this.cumulativeCostUsd.toFixed(6)} / $${this.budgetConfig.maxCostUsd.toFixed(6)}`);
            }
        }
    }

    private trackCost(costUsd: number): void {
        this.cumulativeCostUsd += costUsd;

        if (
            this.budgetConfig?.warnAtUsd &&
            this.cumulativeCostUsd >= this.budgetConfig.warnAtUsd &&
            this.cumulativeCostUsd - costUsd < this.budgetConfig.warnAtUsd
        ) {
            console.warn(`[GovernanceClient] Budget warning: $${this.cumulativeCostUsd.toFixed(6)} / $${this.budgetConfig.maxCostUsd.toFixed(6)}`);
        }
    }
}

/**
 * Full-jitter exponential backoff: a random wait in `[0, min(cap, base * 2^attempt)]`.
 * Recommended in the AWS Architecture Blog "Exponential Backoff And Jitter"
 * post — pure exponential creates retry storms when many clients trip
 * simultaneously, full jitter de-correlates them.
 */
function computeBackoffMs(attempt: number, baseMs: number, capMs: number): number {
    const exp = Math.min(capMs, baseMs * 2 ** attempt);
    return Math.floor(Math.random() * exp);
}

// EventSource is built into browsers and Node ≥18, but older runtimes (and a
// few hosted Node environments) ship without it. Resolve a usable ctor once,
// preferring the global, then falling back to the optional `eventsource`
// peer dep. A single warning is emitted when neither is found so callers can
// `npm i eventsource` without paying for it on every approval wait.
type EventSourceCtor = new (url: string) => {
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    close(): void;
};

let cachedEventSourceCtor: EventSourceCtor | null | undefined;
let warnedAboutMissingEventSource = false;

async function getEventSourceCtor(): Promise<EventSourceCtor | null> {
    if (cachedEventSourceCtor !== undefined) return cachedEventSourceCtor;

    const globalES = (globalThis as { EventSource?: EventSourceCtor }).EventSource;
    if (globalES) {
        cachedEventSourceCtor = globalES;
        return cachedEventSourceCtor;
    }

    try {
        // Avoid bundlers statically resolving the optional dep.
        const moduleName = 'eventsource';
        const mod = (await import(/* @vite-ignore */ moduleName)) as
            | { default?: EventSourceCtor; EventSource?: EventSourceCtor }
            | EventSourceCtor;
        const ctor =
            (mod as { default?: EventSourceCtor }).default
            ?? (mod as { EventSource?: EventSourceCtor }).EventSource
            ?? (mod as EventSourceCtor);
        cachedEventSourceCtor = ctor ?? null;
    } catch {
        cachedEventSourceCtor = null;
    }

    if (!cachedEventSourceCtor && !warnedAboutMissingEventSource) {
        warnedAboutMissingEventSource = true;
        console.warn(
            '[GovernanceClient] No EventSource available — install the `eventsource` package for push-based approvals, otherwise the SDK will fall back to HTTP polling.',
        );
    }

    return cachedEventSourceCtor;
}
