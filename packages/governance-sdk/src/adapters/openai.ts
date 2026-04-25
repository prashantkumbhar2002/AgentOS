import type { GovernanceClient, LLMCallMetadata } from '../GovernanceClient.js';

/**
 * Convenience adapter for OpenAI SDK.
 *
 * Usage:
 *   import OpenAI from 'openai';
 *   import { createOpenAIAdapter } from '@agentos/governance-sdk/adapters/openai';
 *
 *   const openai = new OpenAI();
 *   const governed = createOpenAIAdapter(gov, openai);
 *   const chat = await governed.createChatCompletion({ model: 'gpt-4o', ... });
 */
export interface OpenAIUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface OpenAIChatCompletion {
    choices: Array<{ message: { role: string; content: string | null } }>;
    usage?: OpenAIUsage;
    model: string;
    [key: string]: unknown;
}

export interface OpenAIChatParams {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    tools?: unknown[];
    [key: string]: unknown;
}

/** Single chunk of an OpenAI streaming chat completion. */
export interface OpenAIChatChunk {
    id?: string;
    model?: string;
    choices: Array<{
        index?: number;
        delta?: { role?: string; content?: string | null };
        finish_reason?: string | null;
    }>;
    /** Present only on the *final* chunk when `stream_options: { include_usage: true }`. */
    usage?: OpenAIUsage;
}

export interface OpenAIEmbeddingResponse {
    data: Array<{ embedding: number[]; index: number }>;
    model: string;
    usage: { prompt_tokens: number; total_tokens: number };
}

export interface OpenAIEmbeddingParams {
    model: string;
    input: string | string[];
    [key: string]: unknown;
}

export interface OpenAILike {
    chat: {
        completions: {
            create(params: OpenAIChatParams): Promise<OpenAIChatCompletion>;
            // Streaming overload: depends on `params.stream === true`. We type
            // it loosely to avoid coupling to the OpenAI SDK's overloaded sigs.
            create(params: OpenAIChatParams & { stream: true }): Promise<AsyncIterable<OpenAIChatChunk>>;
        };
    };
    embeddings?: {
        create(params: OpenAIEmbeddingParams): Promise<OpenAIEmbeddingResponse>;
    };
}

export function extractOpenAIMetadata(
    result: OpenAIChatCompletion,
): LLMCallMetadata {
    return {
        provider: 'openai',
        model: result.model,
        inputTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
    };
}

/**
 * Sum token usage across chunks. OpenAI emits `usage` only on the final
 * chunk when the caller passes `stream_options: { include_usage: true }`;
 * otherwise we return undefined and the SDK will log the call with no
 * token counts (still valuable for latency/error tracking).
 */
export function aggregateOpenAIStreamUsage(
    chunks: OpenAIChatChunk[],
): { inputTokens?: number; outputTokens?: number; model?: string } {
    const last = chunks.find((c) => !!c.usage) ?? chunks[chunks.length - 1];
    return {
        inputTokens: last?.usage?.prompt_tokens,
        outputTokens: last?.usage?.completion_tokens,
        model: last?.model,
    };
}

export function createOpenAIAdapter(
    gov: GovernanceClient,
    openai: OpenAILike,
) {
    return {
        async createChatCompletion(params: OpenAIChatParams): Promise<OpenAIChatCompletion> {
            return gov.wrapLLMCall(
                () => openai.chat.completions.create(params),
                (result) => extractOpenAIMetadata(result),
            );
        },

        /**
         * Stream a chat completion and record the call once iteration ends.
         * For accurate token counts pass `stream_options: { include_usage: true }`
         * — without it the audit event will have null token counts (cost
         * tracking degrades to latency-only).
         *
         * @example
         *   for await (const chunk of governed.streamChatCompletion({
         *     model: 'gpt-4o', messages, stream_options: { include_usage: true },
         *   })) {
         *     process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
         *   }
         */
        streamChatCompletion(params: OpenAIChatParams): AsyncIterable<OpenAIChatChunk> {
            const source = async function* (): AsyncIterable<OpenAIChatChunk> {
                // OpenAI's create() is overloaded — passing `stream: true`
                // returns an AsyncIterable, but the public type can't reliably
                // narrow without coupling us to the upstream type definitions.
                const stream = (await openai.chat.completions.create({
                    ...params,
                    stream: true,
                } as OpenAIChatParams & { stream: true })) as unknown as AsyncIterable<OpenAIChatChunk>;
                for await (const chunk of stream) {
                    yield chunk;
                }
            };
            return gov.wrapLLMStream<OpenAIChatChunk>(
                () => source(),
                (chunks) => {
                    const { inputTokens, outputTokens, model } = aggregateOpenAIStreamUsage(chunks);
                    return {
                        provider: 'openai',
                        model: model ?? params.model,
                        inputTokens,
                        outputTokens,
                    };
                },
            );
        },

        /**
         * Wrap `openai.embeddings.create` so embedding calls are tracked
         * alongside chat completions. Only `prompt_tokens` is meaningful for
         * embeddings — `outputTokens` is left undefined.
         */
        async createEmbedding(params: OpenAIEmbeddingParams): Promise<OpenAIEmbeddingResponse> {
            if (!openai.embeddings) {
                throw new Error(
                    'createOpenAIAdapter: embeddings client not exposed by the provided OpenAI instance.',
                );
            }
            return gov.wrapLLMCall(
                () => openai.embeddings!.create(params),
                (result) => ({
                    provider: 'openai',
                    model: result.model,
                    inputTokens: result.usage.prompt_tokens,
                }),
            );
        },
    };
}
