import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from './health-score.js';

describe('calculateHealthScore', () => {
  it('returns 100 for perfect metrics (new agent with no activity)', () => {
    expect(calculateHealthScore(0, 0, 0)).toBe(100);
  });

  it('returns 0 for worst-case metrics', () => {
    expect(calculateHealthScore(1, 1, 10000)).toBe(0);
  });

  it('weighs error rate at 40%', () => {
    const score = calculateHealthScore(0.5, 0, 0);
    expect(score).toBe(80);
  });

  it('weighs approval deny rate at 30%', () => {
    const score = calculateHealthScore(0, 0.5, 0);
    expect(score).toBe(85);
  });

  it('weighs latency at 30% with 10s threshold', () => {
    const score = calculateHealthScore(0, 0, 5000);
    expect(score).toBe(85);
  });

  it('clamps latency component to zero when latency exceeds 10000ms', () => {
    const score = calculateHealthScore(0, 0, 20000);
    expect(score).toBe(70);
  });

  it('handles combined moderate metrics', () => {
    const score = calculateHealthScore(0.1, 0.2, 2000);
    expect(score).toBe(Math.round(((1 - 0.1) * 0.4 + (1 - 0.2) * 0.3 + (1 - 2000 / 10000) * 0.3) * 100));
  });

  it('rounds to nearest integer', () => {
    const score = calculateHealthScore(0.03, 0.07, 1500);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('never returns below 0', () => {
    const score = calculateHealthScore(2, 2, 50000);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('never returns above 100', () => {
    const score = calculateHealthScore(-1, -1, -5000);
    expect(score).toBeLessThanOrEqual(100);
  });
});
