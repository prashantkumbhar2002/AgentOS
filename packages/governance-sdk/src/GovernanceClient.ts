import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventBuffer } from './EventBuffer.js';
import { SpanManager } from './SpanManager.js';
import { CircuitBreaker } from './CircuitBreaker.js';

interface TraceContext {
    traceId: string;
}

export interface LLMCallMetadata {
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
}

export interface BudgetConfig {
    maxCostUsd: number;
    warnAtUsd?: number;
    onBudgetExceeded?: 'throw' | 'warn' | 'log';
}

export interface ResilienceConfig {
    onPlatformUnavailable?: 'fail-open' | 'fail-closed';
    retryAttempts?: number;
    retryDelayMs?: number;
    circuitBreakerThreshold?: number;
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
    private readonly circuitBreaker: CircuitBreaker;
    private readonly budgetConfig?: BudgetConfig;
    private readonly resilienceConfig: ResilienceConfig;
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
        this.spanManager = new SpanManager();
        this.circuitBreaker = new CircuitBreaker(
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

    logEvent(payload: Record<string, unknown>): void {
        this.buffer.push({
            agentId: this.agentId,
            traceId: this.traceId,
            spanId: this.spanManager.currentSpanId,
            parentSpanId: this.spanManager.currentParentSpanId,
            ...payload,
        });
    }

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

    startSpan(name: string): string {
        return this.spanManager.startSpan(name);
    }

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

    get currentCost(): number {
        return this.cumulativeCostUsd;
    }

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

    private waitForApprovalViaSSE(
        ticketId: string,
        sseToken: string,
        maxWait: number,
    ): Promise<{ decision: string; ticketId: string } | null> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(null);
            }, Math.min(maxWait, 10_000)); // SSE attempt limited to 10s before falling back

            try {
                const url = `${this.platformUrl}/api/v1/events/agent-stream?token=${sseToken}&ticketId=${ticketId}`;

                // Use EventSource if available (browser/modern Node), otherwise fall back
                if (typeof EventSource !== 'undefined') {
                    const es = new EventSource(url);
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
                } else {
                    clearTimeout(timeout);
                    resolve(null);
                }
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
        if (!this.circuitBreaker.canRequest()) {
            throw new Error('Circuit breaker open — platform unavailable');
        }

        const attempts = this.resilienceConfig.retryAttempts ?? 1;
        const delay = this.resilienceConfig.retryDelayMs ?? 1000;
        let lastError: Error | undefined;

        for (let i = 0; i < attempts; i++) {
            try {
                const res = await fetch(url, init);
                this.circuitBreaker.recordSuccess();
                return res;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                this.circuitBreaker.recordFailure();
                if (i < attempts - 1) {
                    await new Promise((r) => setTimeout(r, delay * (i + 1)));
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
