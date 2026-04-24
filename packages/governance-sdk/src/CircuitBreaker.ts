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
}
