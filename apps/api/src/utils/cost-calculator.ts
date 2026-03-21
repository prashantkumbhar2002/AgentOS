interface ModelPricing {
  input: number;
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-5':   { input: 0.000015,   output: 0.000075   },
  'claude-sonnet-4-5': { input: 0.000003,   output: 0.000015   },
  'claude-haiku-4-5':  { input: 0.00000025, output: 0.00000125 },
  'gpt-4o':            { input: 0.0000025,  output: 0.00001    },
  'gpt-4o-mini':       { input: 0.00000015, output: 0.0000006  },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const raw = pricing.input * inputTokens + pricing.output * outputTokens;
  return parseFloat(raw.toFixed(6));
}
