/**
 * Cost calculation utilities for LLM usage tracking
 */

// Pricing per million tokens (as of 2026)
const MODEL_PRICING = {
  'claude-opus-4': {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  'claude-sonnet-4': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  'claude-sonnet-4-5': {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  'claude-haiku-4': {
    input: 0.8,
    output: 4.0,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
  'gpt-4-turbo': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-4o': {
    input: 2.5,
    output: 10.0,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },
} as const;

type ModelName = keyof typeof MODEL_PRICING;

/**
 * Calculate cost for LLM usage
 */
export function calculateCost(usage: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}): {
  costUsd: number;
  breakdown: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
  };
} {
  const model = (usage.model in MODEL_PRICING
    ? usage.model
    : 'claude-sonnet-4-5') as ModelName;
  const pricing = MODEL_PRICING[model];

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  
  let cacheWriteCost = 0;
  let cacheReadCost = 0;

  if ('cacheWrite' in pricing && usage.cacheCreationInputTokens) {
    cacheWriteCost = (usage.cacheCreationInputTokens / 1_000_000) * pricing.cacheWrite;
  }

  if ('cacheRead' in pricing && usage.cacheReadInputTokens) {
    cacheReadCost = (usage.cacheReadInputTokens / 1_000_000) * pricing.cacheRead;
  }

  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

  return {
    costUsd: totalCost,
    breakdown: {
      input: inputCost,
      output: outputCost,
      cacheWrite: cacheWriteCost,
      cacheRead: cacheReadCost,
    },
  };
}

/**
 * Estimate cost for a planned LLM call
 */
export function estimateCost(params: {
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}): number {
  return calculateCost({
    model: params.model,
    inputTokens: params.estimatedInputTokens,
    outputTokens: params.estimatedOutputTokens,
  }).costUsd;
}

/**
 * Check if cost is within budget
 */
export function isWithinBudget(
  currentCost: number,
  additionalCost: number,
  budget: number
): boolean {
  return currentCost + additionalCost <= budget;
}

/**
 * Format cost for display
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 1000).toFixed(4)}m`; // Show in millidollars
  }
  return `$${costUsd.toFixed(4)}`;
}
