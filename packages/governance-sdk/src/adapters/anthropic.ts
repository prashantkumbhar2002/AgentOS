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

export interface AnthropicLike {
    messages: {
        create(params: any): Promise<AnthropicMessage>;
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
    };
}
