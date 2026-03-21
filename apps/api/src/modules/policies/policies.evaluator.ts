import type { PrismaClient } from '@prisma/client';
import type { PolicyEvaluationResult, PolicyEffect } from '@agentos/types';
import type { RiskTier } from '@agentos/types';

interface PolicyWithRules {
  id: string;
  name: string;
  isActive: boolean;
  rules: {
    id: string;
    actionType: string;
    riskTiers: string[];
    effect: string;
    conditions: unknown;
  }[];
}

interface MatchedEffect {
  effect: PolicyEffect;
  rule: PolicyWithRules['rules'][number];
  policy: { id: string; name: string };
}

function checkConditions(
  conditions: Record<string, unknown>,
  context: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(conditions)) {
    if (context[key] !== conditions[key]) {
      return false;
    }
  }
  return true;
}

function ruleMatches(
  rule: PolicyWithRules['rules'][number],
  actionType: string,
  riskTier: RiskTier,
  context: Record<string, unknown>,
): boolean {
  const actionMatches = rule.actionType === '*' || rule.actionType === actionType;
  const tierMatches = rule.riskTiers.length === 0 || rule.riskTiers.includes(riskTier);

  const conditions = rule.conditions as Record<string, unknown> | null;
  const conditionsMatch =
    conditions && Object.keys(conditions).length > 0
      ? checkConditions(conditions, context)
      : true;

  return actionMatches && tierMatches && conditionsMatch;
}

export async function evaluatePolicy(
  prisma: PrismaClient,
  agentId: string,
  actionType: string,
  riskTier: RiskTier,
  context: Record<string, unknown> = {},
): Promise<PolicyEvaluationResult> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    throw new Error('Agent not found');
  }

  const agentPolicies = await prisma.policy.findMany({
    where: {
      agents: { some: { agentId } },
    },
    include: { rules: true },
  });

  const globalPolicies = await prisma.policy.findMany({
    where: {
      agents: { none: {} },
    },
    include: { rules: true },
  });

  const allPolicies: PolicyWithRules[] = [...agentPolicies, ...globalPolicies];

  const matchedEffects: MatchedEffect[] = [];

  for (const policy of allPolicies) {
    if (!policy.isActive) continue;
    for (const rule of policy.rules) {
      if (ruleMatches(rule, actionType, riskTier, context)) {
        matchedEffects.push({
          effect: rule.effect as PolicyEffect,
          rule,
          policy: { id: policy.id, name: policy.name },
        });
      }
    }
  }

  const denied = matchedEffects.find((m) => m.effect === 'DENY');
  if (denied) {
    return {
      effect: 'DENY',
      matchedRule: denied.rule,
      matchedPolicy: denied.policy,
      reason: `Blocked by policy: ${denied.policy.name}`,
    };
  }

  const requireApproval = matchedEffects.find((m) => m.effect === 'REQUIRE_APPROVAL');
  if (requireApproval) {
    return {
      effect: 'REQUIRE_APPROVAL',
      matchedRule: requireApproval.rule,
      matchedPolicy: requireApproval.policy,
      reason: `Approval required by policy: ${requireApproval.policy.name}`,
    };
  }

  const allowed = matchedEffects.find((m) => m.effect === 'ALLOW');
  if (allowed) {
    return {
      effect: 'ALLOW',
      matchedRule: allowed.rule,
      matchedPolicy: allowed.policy,
      reason: `Allowed by policy: ${allowed.policy.name}`,
    };
  }

  return {
    effect: 'REQUIRE_APPROVAL',
    reason: 'No matching policy — default to require approval',
  };
}
