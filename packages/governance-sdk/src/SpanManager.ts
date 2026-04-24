import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface Span {
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
}

interface SpanContext {
    stack: Span[];
}

/**
 * Tracks the currently active span hierarchy.
 *
 * Stacks are scoped via AsyncLocalStorage when invoked via
 * `runInIsolatedStack`, so concurrent traces sharing a single client do not
 * interleave their span hierarchies. Calls outside an isolated stack fall
 * back to a single per-instance default stack.
 */
export class SpanManager {
    private readonly storage = new AsyncLocalStorage<SpanContext>();
    private readonly defaultStack: Span[] = [];

    private get stack(): Span[] {
        return this.storage.getStore()?.stack ?? this.defaultStack;
    }

    startSpan(name: string): string {
        const stack = this.stack;
        const parentSpanId = stack.length > 0 ? stack[stack.length - 1]!.spanId : undefined;

        const span: Span = {
            spanId: randomUUID(),
            parentSpanId,
            name,
            startTime: Date.now(),
        };

        stack.push(span);
        return span.spanId;
    }

    endSpan(): Span | undefined {
        return this.stack.pop();
    }

    get currentSpanId(): string | undefined {
        const stack = this.stack;
        return stack.length > 0 ? stack[stack.length - 1]!.spanId : undefined;
    }

    get currentParentSpanId(): string | undefined {
        const stack = this.stack;
        return stack.length > 0 ? stack[stack.length - 1]!.parentSpanId : undefined;
    }

    get depth(): number {
        return this.stack.length;
    }

    /** Run `fn` with a fresh, isolated span stack. */
    runInIsolatedStack<T>(fn: () => T | Promise<T>): T | Promise<T> {
        return this.storage.run({ stack: [] }, fn);
    }
}
