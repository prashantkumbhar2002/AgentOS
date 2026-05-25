import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '../config/env.js';

let anthropicClient: Anthropic | null = null;

/**
 * Get singleton Anthropic client
 */
export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const env = getEnv();
    
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    anthropicClient = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  return anthropicClient;
}

/**
 * Call Claude with structured parameters
 */
export async function callClaude(params: {
  model?: string;
  system?: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
}> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: params.model ?? 'claude-sonnet-4-5',
    max_tokens: params.maxTokens ?? 2048,
    temperature: params.temperature ?? 1.0,
    system: params.system,
    messages: params.messages,
  });

  // Extract text content
  const content = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n');

  return {
    content,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? undefined,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? undefined,
    },
  };
}

/**
 * Parse email format from Claude response
 */
export function parseEmailFromResponse(text: string): {
  subject: string;
  body: string;
} {
  const trimmed = text.trim();
  const lines = trimmed.split('\n');
  
  const subjectLineIndex = lines.findIndex((line) =>
    line.toLowerCase().startsWith('subject:')
  );

  if (subjectLineIndex !== -1) {
    const subject = (lines[subjectLineIndex] ?? '')
      .replace(/^Subject:\s*/i, '')
      .trim();
    const body = lines.slice(subjectLineIndex + 1).join('\n').trim();
    return { subject, body };
  }

  // Fallback: first line is subject
  const subject = lines[0]?.trim() ?? '';
  const body = lines.slice(1).join('\n').trim();
  return { subject, body };
}
