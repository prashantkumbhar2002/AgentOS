import { randomUUID } from 'node:crypto';

export interface Span {
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
}

export class SpanManager {
    private readonly stack: Span[] = [];

    startSpan(name: string): string {
        const parentSpanId = this.stack.length > 0
            ? this.stack[this.stack.length - 1]!.spanId
            : undefined;

        const span: Span = {
            spanId: randomUUID(),
            parentSpanId,
            name,
            startTime: Date.now(),
        };

        this.stack.push(span);
        return span.spanId;
    }

    endSpan(): Span | undefined {
        return this.stack.pop();
    }

    get currentSpanId(): string | undefined {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.spanId : undefined;
    }

    get currentParentSpanId(): string | undefined {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.parentSpanId : undefined;
    }

    get depth(): number {
        return this.stack.length;
    }
}
