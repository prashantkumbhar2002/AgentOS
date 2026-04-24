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

export interface OpenAILike {
    chat: {
        completions: {
            create(params: OpenAIChatParams): Promise<OpenAIChatCompletion>;
        };
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
    };
}
