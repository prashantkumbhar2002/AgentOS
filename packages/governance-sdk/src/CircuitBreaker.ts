export class CircuitBreaker {
    private failures = 0;
    private openedAt: number | null = null;

    constructor(
        private readonly threshold: number,
        private readonly cooldownMs: number,
    ) { }

    canRequest(): boolean {
        if (this.openedAt === null) return true;
        if (Date.now() - this.openedAt >= this.cooldownMs) {
            this.reset();
            return true;
        }
        return false;
    }

    recordSuccess(): void {
        this.failures = 0;
        this.openedAt = null;
    }

    recordFailure(): void {
        this.failures++;
        if (this.failures >= this.threshold) {
            this.openedAt = Date.now();
        }
    }

    reset(): void {
        this.failures = 0;
        this.openedAt = null;
    }

    get isOpen(): boolean {
        return this.openedAt !== null && Date.now() - this.openedAt < this.cooldownMs;
    }

    /** Snapshot of breaker state for metrics/diagnostics. */
    get state(): { failures: number; openedAt: number | null; isOpen: boolean } {
        return {
            failures: this.failures,
            openedAt: this.openedAt,
            isOpen: this.isOpen,
        };
    }
}

/**
 * Routes requests to per-key CircuitBreaker instances so a failure in one
 * upstream route (e.g. `/audit/batch` flooded with 5xx) cannot cascade and
 * trip the breaker on a *critical* unrelated route (e.g. `/policies/check`).
 *
 * Keys are typically derived from URL — see `routeKeyFromUrl`. The registry
 * lazily creates breakers and reuses them for the lifetime of the client.
 */
export class CircuitBreakerRegistry {
    private readonly breakers = new Map<string, CircuitBreaker>();

    constructor(
        private readonly threshold: number,
        private readonly cooldownMs: number,
    ) { }

    get(key: string): CircuitBreaker {
        let b = this.breakers.get(key);
        if (!b) {
            b = new CircuitBreaker(this.threshold, this.cooldownMs);
            this.breakers.set(key, b);
        }
        return b;
    }

    /** Snapshot of every active breaker keyed by route. */
    snapshot(): Record<string, { failures: number; openedAt: number | null; isOpen: boolean }> {
        const out: Record<string, { failures: number; openedAt: number | null; isOpen: boolean }> = {};
        for (const [k, b] of this.breakers) {
            out[k] = b.state;
        }
        return out;
    }
}

/**
 * Bucket a request URL into a stable key for breaker isolation.
 *
 * Hostname guards against multi-platform clients; the *first* path segment
 * after `/api/v1` keeps cardinality bounded — without it, every approval
 * ticket id would mint its own breaker and we'd never trip.
 *
 * Examples:
 *   `https://api.x/api/v1/audit/batch`     -> `api.x|audit`
 *   `https://api.x/api/v1/audit/log`       -> `api.x|audit`
 *   `https://api.x/api/v1/policies/check`  -> `api.x|policies`
 *   `https://api.x/api/v1/approvals/abc`   -> `api.x|approvals`
 */
export function routeKeyFromUrl(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);
        const segments = u.pathname.split('/').filter(Boolean);
        const apiIdx = segments.findIndex((s) => /^v\d+$/.test(s));
        const route = apiIdx >= 0 && segments[apiIdx + 1] ? segments[apiIdx + 1] : segments[0] ?? 'root';
        return `${u.host}|${route}`;
    } catch {
        // Malformed URL — fall back to a single shared bucket so we still
        // get *some* breaker protection rather than crashing the request.
        return 'unknown';
    }
}
