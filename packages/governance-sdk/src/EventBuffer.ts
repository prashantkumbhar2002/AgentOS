export interface EventBufferOptions {
    /** Hard cap on queued events; oldest are dropped when exceeded. */
    maxQueueSize?: number;
    /** Initial flush delay after the first push. */
    flushIntervalMs?: number;
    /** Max attempts when a flush fails before dropping the batch. */
    maxFlushAttempts?: number;
    /** Base delay for exponential backoff between retries. */
    retryBaseMs?: number;
    /** Maximum delay cap for exponential backoff. */
    retryMaxMs?: number;
}

interface NormalizedOptions {
    maxBatchSize: number;
    maxQueueSize: number;
    flushIntervalMs: number;
    maxFlushAttempts: number;
    retryBaseMs: number;
    retryMaxMs: number;
}

/**
 * In-memory queue that batches events and flushes them via a user-provided
 * function. Failed flushes are requeued (preserving order) and retried with
 * exponential backoff plus jitter. The queue has a hard cap to bound memory
 * usage during prolonged outages — once exceeded, the oldest events are
 * dropped to make room.
 */
export class EventBuffer {
    private queue: Record<string, unknown>[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private flushing = false;
    private consecutiveFailures = 0;
    private droppedCount = 0;
    private readonly opts: NormalizedOptions;

    constructor(
        private readonly flushFn: (events: Record<string, unknown>[]) => Promise<void>,
        maxBatchSize: number = 20,
        flushIntervalMs: number = 5_000,
        options: EventBufferOptions = {},
    ) {
        this.opts = {
            maxBatchSize,
            flushIntervalMs: options.flushIntervalMs ?? flushIntervalMs,
            maxQueueSize: options.maxQueueSize ?? Math.max(maxBatchSize * 50, 1_000),
            maxFlushAttempts: options.maxFlushAttempts ?? 5,
            retryBaseMs: options.retryBaseMs ?? 500,
            retryMaxMs: options.retryMaxMs ?? 30_000,
        };
    }

    push(event: Record<string, unknown>): void {
        this.queue.push(event);
        this.enforceQueueLimit();
        if (this.queue.length >= this.opts.maxBatchSize) {
            void this.flush();
        } else {
            this.scheduleFlush(this.opts.flushIntervalMs);
        }
    }

    async flush(): Promise<void> {
        if (this.flushing || this.queue.length === 0) return;
        this.flushing = true;
        this.clearTimer();

        const batch = this.queue.splice(0, this.opts.maxBatchSize);

        try {
            await this.flushFn(batch);
            this.consecutiveFailures = 0;
        } catch (err) {
            this.consecutiveFailures += 1;
            if (this.consecutiveFailures >= this.opts.maxFlushAttempts) {
                this.droppedCount += batch.length;
                console.warn(
                    `[EventBuffer] Dropping ${batch.length} events after ${this.consecutiveFailures} failed attempts (total dropped: ${this.droppedCount}). Last error:`,
                    err instanceof Error ? err.message : err,
                );
                this.consecutiveFailures = 0;
            } else {
                this.queue.unshift(...batch);
                this.enforceQueueLimit();
                this.scheduleFlush(this.computeBackoffMs());
            }
        } finally {
            this.flushing = false;
        }

        if (this.queue.length > 0 && !this.timer) {
            this.scheduleFlush(this.opts.flushIntervalMs);
        }
    }

    /** Synchronously drain everything in the queue, retrying until empty or all attempts fail. */
    async shutdown(): Promise<void> {
        this.clearTimer();
        while (this.queue.length > 0) {
            const before = this.queue.length;
            await this.flush();
            if (this.queue.length >= before) break; // no progress; bail out
        }
    }

    get pending(): number {
        return this.queue.length;
    }

    get dropped(): number {
        return this.droppedCount;
    }

    private enforceQueueLimit(): void {
        if (this.queue.length > this.opts.maxQueueSize) {
            const overflow = this.queue.length - this.opts.maxQueueSize;
            this.queue.splice(0, overflow);
            this.droppedCount += overflow;
            if (this.droppedCount % 100 === 0 || overflow === this.opts.maxQueueSize) {
                console.warn(
                    `[EventBuffer] Queue capped at ${this.opts.maxQueueSize}; dropped ${overflow} oldest events (total dropped: ${this.droppedCount}).`,
                );
            }
        }
    }

    private computeBackoffMs(): number {
        const expBackoff = Math.min(
            this.opts.retryBaseMs * 2 ** (this.consecutiveFailures - 1),
            this.opts.retryMaxMs,
        );
        // full jitter: random value in [0, expBackoff]
        return Math.floor(Math.random() * expBackoff);
    }

    private scheduleFlush(delay: number): void {
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, delay);
        const t = this.timer as unknown as { unref?: () => void };
        if (typeof t.unref === 'function') t.unref();
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
