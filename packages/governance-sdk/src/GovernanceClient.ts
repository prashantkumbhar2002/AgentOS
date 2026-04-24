import { randomUUID } from 'node:crypto';
import { EventBuffer } from './EventBuffer.js';
import { SpanManager } from './SpanManager.js';
import { CircuitBreaker } from './CircuitBreaker.js';

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
}

export class PolicyDeniedError extends Error {
    constructor(
        public readonly actionType: string,
        public readonly reason: string,
    ) {
        super(`Policy denied action "${actionType}": ${reason}`);
        this.name = 'PolicyDeniedError';
    }
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

export class GovernanceClient {
    private readonly platformUrl: string;
    private readonly agentId: string;
    private readonly apiKey: string;
    private readonly buffer: EventBuffer;
    private readonly spanManager: SpanManager;
    private readonly circuitBreaker: CircuitBreaker;
    private readonly budgetConfig?: BudgetConfig;
    private readonly resilienceConfig: ResilienceConfig;
    private cumulativeCostUsd = 0;

    readonly traceId: string;

    constructor(config: GovernanceClientConfig) {
        this.platformUrl = config.platformUrl.replace(/\/$/, '');
        this.agentId = config.agentId;
        this.apiKey = config.apiKey;
        this.traceId = randomUUID();
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

                const { decision, ticketId } = await this.requestApproval({
                    actionType: toolName,
                    payload: approvalParams.payload ?? inputs,
                    reasoning: approvalParams.reasoning,
                    riskScore: options.riskScore,
                });

                if (decision !== 'APPROVED' && decision !== 'AUTO_APPROVED') {
                    this.logEvent({
                        event: 'action_blocked',
                        toolName,
                        inputs,
                        reason: `Approval ${decision}`,
                        ticketId,
                    });
                    throw new PolicyDeniedError(toolName, `Approval ${decision} (ticket: ${ticketId})`);
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

        try {
            const createRes = await this.fetchWithResilience(
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

            const createBody = (await createRes.json()) as Record<string, unknown>;

            if (createBody['status'] === 'AUTO_APPROVED') {
                return { decision: 'AUTO_APPROVED', ticketId: '' };
            }

            if (!createRes.ok) {
                return { decision: 'DENIED', ticketId: '' };
            }

            const ticketId = createBody['ticketId'] as string;

            // Try SSE-based push first, fall back to polling
            return await this.waitForApproval(ticketId, pollInterval, maxWait);
        } catch (err) {
            console.warn('[GovernanceClient] requestApproval failed:', err);
            return this.handlePlatformFailure();
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

    async withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
        this.startSpan(name);
        try {
            return await fn();
        } finally {
            this.endSpan();
        }
    }

    get currentCost(): number {
        return this.cumulativeCostUsd;
    }

    async shutdown(): Promise<void> {
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
        try {
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

            if (!res.ok) {
                // Fall back to individual logging
                for (const event of events) {
                    try {
                        await fetch(`${this.platformUrl}/api/v1/audit/log`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${this.apiKey}`,
                            },
                            body: JSON.stringify(event),
                        });
                    } catch { /* swallow */ }
                }
            }
        } catch {
            console.warn('[GovernanceClient] Failed to flush events');
        }
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

    private handlePlatformFailure(): { decision: string; ticketId: string } {
        if (this.resilienceConfig.onPlatformUnavailable === 'fail-open') {
            return { decision: 'AUTO_APPROVED', ticketId: '' };
        }
        return { decision: 'ERROR', ticketId: '' };
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
