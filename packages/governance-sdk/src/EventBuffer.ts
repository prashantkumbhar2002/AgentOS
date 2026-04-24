export class EventBuffer {
    private queue: Record<string, unknown>[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private flushing = false;

    constructor(
        private readonly flushFn: (events: Record<string, unknown>[]) => Promise<void>,
        private readonly maxSize: number = 20,
        private readonly flushIntervalMs: number = 5_000,
    ) { }

    push(event: Record<string, unknown>): void {
        this.queue.push(event);
        if (this.queue.length >= this.maxSize) {
            void this.flush();
        } else {
            this.startTimer();
        }
    }

    async flush(): Promise<void> {
        if (this.flushing || this.queue.length === 0) return;
        this.flushing = true;
        this.clearTimer();

        const batch = this.queue.splice(0);
        try {
            await this.flushFn(batch);
        } catch {
            console.warn('[EventBuffer] Flush failed, events dropped');
        } finally {
            this.flushing = false;
        }

        if (this.queue.length > 0) {
            this.startTimer();
        }
    }

    async shutdown(): Promise<void> {
        this.clearTimer();
        await this.flush();
    }

    get pending(): number {
        return this.queue.length;
    }

    private startTimer(): void {
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, this.flushIntervalMs);
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
