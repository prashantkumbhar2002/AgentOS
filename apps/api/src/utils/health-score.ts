export function calculateHealthScore(
  errorRate: number,
  approvalDenyRate: number,
  avgLatencyMs: number,
): number {
  const errorComponent = (1 - errorRate) * 0.4;
  const approvalComponent = (1 - approvalDenyRate) * 0.3;
  const latencyComponent = Math.max(0, 1 - avgLatencyMs / 10000) * 0.3;

  const raw = (errorComponent + approvalComponent + latencyComponent) * 100;

  return Math.round(Math.max(0, Math.min(100, raw)));
}
