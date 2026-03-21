import { describe, it, expect } from 'vitest';
import { calculateCost } from './cost-calculator.js';

describe('calculateCost', () => {
  it('calculates claude-sonnet-4-5 cost correctly', () => {
    const cost = calculateCost('claude-sonnet-4-5', 1000, 500);
    expect(cost).toBe(parseFloat((0.000003 * 1000 + 0.000015 * 500).toFixed(6)));
  });

  it('calculates claude-opus-4-5 cost correctly', () => {
    const cost = calculateCost('claude-opus-4-5', 1000, 500);
    expect(cost).toBe(parseFloat((0.000015 * 1000 + 0.000075 * 500).toFixed(6)));
  });

  it('calculates claude-haiku-4-5 cost correctly', () => {
    const cost = calculateCost('claude-haiku-4-5', 2000, 1000);
    expect(cost).toBe(parseFloat((0.00000025 * 2000 + 0.00000125 * 1000).toFixed(6)));
  });

  it('calculates gpt-4o cost correctly', () => {
    const cost = calculateCost('gpt-4o', 1500, 500);
    expect(cost).toBe(parseFloat((0.0000025 * 1500 + 0.00001 * 500).toFixed(6)));
  });

  it('calculates gpt-4o-mini cost correctly', () => {
    const cost = calculateCost('gpt-4o-mini', 5000, 2000);
    expect(cost).toBe(parseFloat((0.00000015 * 5000 + 0.0000006 * 2000).toFixed(6)));
  });

  it('returns 0 for unknown models', () => {
    expect(calculateCost('unknown-model', 1000, 500)).toBe(0);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateCost('claude-sonnet-4-5', 0, 0)).toBe(0);
  });

  it('maintains 6-decimal precision', () => {
    const cost = calculateCost('claude-sonnet-4-5', 1, 1);
    const parts = cost.toString().split('.');
    expect(parts.length).toBe(2);
    expect(parts[1]!.length).toBeLessThanOrEqual(6);
  });
});
