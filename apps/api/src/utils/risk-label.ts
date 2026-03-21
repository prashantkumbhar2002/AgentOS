export type RiskLabel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const TIERS: { max: number; label: RiskLabel; emoji: string }[] = [
  { max: 0.39, label: 'LOW', emoji: '🟢' },
  { max: 0.69, label: 'MEDIUM', emoji: '🟡' },
  { max: 0.89, label: 'HIGH', emoji: '🟠' },
  { max: 1.0, label: 'CRITICAL', emoji: '🔴' },
];

export function getRiskLabel(riskScore: number): { label: RiskLabel; emoji: string } {
  for (const tier of TIERS) {
    if (riskScore <= tier.max) {
      return { label: tier.label, emoji: tier.emoji };
    }
  }
  return { label: 'CRITICAL', emoji: '🔴' };
}
