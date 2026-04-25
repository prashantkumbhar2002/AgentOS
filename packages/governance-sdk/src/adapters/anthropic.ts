import type { GovernanceClient, LLMCallMetadata } from '../GovernanceClient.js';

/**
 * Convenience adapter for Anthropic SDK.
 * Wraps an Anthropic client's messages.create call with governance logging.
 *
 * Usage:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   import { createAnthropicAdapter } from '@agentos/governance-sdk/adapters/anthropic';
 *
 *   const anthropic = new Anthropic();
 *   const governed = createAnthropicAdapter(gov, anthropic);
 *   const msg = await governed.createMessage({ model: 'claude-sonnet-4-5', ... });
 */
export interface AnthropicMessage {
    usage: { input_tokens: number; output_tokens: number };
    content: Array<{ type: string; text?: string }>;
}

export interface AnthropicCreateParams {
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string | unknown }>;
    system?: string;
    tools?: unknown[];
    [key: string]: unknown;
}

/**
 * A *structural* subset of the SSE event objects emitted by
 * `anthropic.messages.stream()`. Only the fields the adapter reads are
 * declared; everything else is intentionally `unknown`-ish so different
 * versions of `@anthropic-ai/sdk` (each with slightly different unions for
 * `delta`/`content_block` shapes) all satisfy this type without casts.
 */
export type AnthropicStreamEvent = {
    type: string;
} & Partial<{
    usage: { input_tokens?: number | null; output_tokens?: number | null };
    message: { usage?: { input_tokens?: number | null; output_tokens?: number | null } };
}>;

export interface AnthropicLike {
    messages: {
        create(params: any): Promise<AnthropicMessage>;
        stream?(params: any): AsyncIterable<AnthropicStreamEvent>;
    };
}

export function extractAnthropicMetadata(
    params: AnthropicCreateParams,
    result: AnthropicMessage,
): LLMCallMetadata {
    return {
        provider: 'anthropic',
        model: params.model,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
    };
}

/**
 * Aggregate token usage from a sequence of stream events. Anthropic emits
 * `input_tokens` once on `message_start` and `output_tokens` cumulatively
 * via `message_delta`; we take the maximum (most recent) of each so the
 * final value reflects the full response even with partial events.
 */
export function aggregateAnthropicStreamUsage(
    chunks: AnthropicStreamEvent[],
): { inputTokens?: number; outputTokens?: number } {
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    for (const c of chunks) {
        const it = c.usage?.input_tokens ?? c.message?.usage?.input_tokens ?? null;
        const ot = c.usage?.output_tokens ?? c.message?.usage?.output_tokens ?? null;
        if (typeof it === 'number') inputTokens = Math.max(inputTokens ?? 0, it);
        if (typeof ot === 'number') outputTokens = Math.max(outputTokens ?? 0, ot);
    }
    return { inputTokens, outputTokens };
}

export function createAnthropicAdapter(
    gov: GovernanceClient,
    anthropic: AnthropicLike,
) {
    return {
        async createMessage(params: AnthropicCreateParams): Promise<AnthropicMessage> {
            return gov.wrapLLMCall(
                () => anthropic.messages.create(params),
                (result) => extractAnthropicMetadata(params, result),
            );
        },

        /**
         * Wrap `anthropic.messages.stream(params)` so the SDK records token
         * usage and latency once the stream completes. Yields each raw event
         * to the caller in real time — usage aggregation is a side effect.
         *
         * @example
         *   for await (const event of governed.streamMessage({ model, ... })) {
         *     if (event.type === 'content_block_delta') {
         *       process.stdout.write(event.delta?.text ?? '');
         *     }
         *   }
         */
        streamMessage(params: AnthropicCreateParams): AsyncIterable<AnthropicStreamEvent> {
            if (!anthropic.messages.stream) {
                throw new Error(
                    'createAnthropicAdapter: streaming requires `anthropic.messages.stream`. Upgrade @anthropic-ai/sdk to ≥0.20.',
                );
            }
            return gov.wrapLLMStream<AnthropicStreamEvent>(
                () => anthropic.messages.stream!(params),
                (chunks) => {
                    const { inputTokens, outputTokens } = aggregateAnthropicStreamUsage(chunks);
                    return {
                        provider: 'anthropic',
                        model: params.model,
                        inputTokens,
                        outputTokens,
                    };
                },
            );
        },
    };
}
