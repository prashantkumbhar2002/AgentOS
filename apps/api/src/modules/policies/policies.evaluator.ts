import type { PolicyEvaluationResult, PolicyEffect, RiskTier } from '@agentos/types';
import type { IPolicyRepository } from '../../repositories/interfaces/IPolicyRepository.js';
import type { IAgentRepository } from '../../repositories/interfaces/IAgentRepository.js';
import type { PolicyRuleDTO } from '../../types/dto.js';

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
    rule: PolicyRuleDTO,
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

export class PolicyEvaluator {
    constructor(
        private readonly policyRepo: IPolicyRepository,
        private readonly agentRepo: IAgentRepository,
    ) { }

    async evaluate(
        agentId: string,
        actionType: string,
        riskTier: RiskTier,
        context: Record<string, unknown> = {},
    ): Promise<PolicyEvaluationResult> {
        const agentExists = await this.agentRepo.exists(agentId);
        if (!agentExists) {
            throw new Error('Agent not found');
        }

        const [agentPolicies, globalPolicies] = await Promise.all([
            this.policyRepo.getAgentPoliciesWithRules(agentId),
            this.policyRepo.getGlobalPoliciesWithRules(),
        ]);

        const allPolicies = [...agentPolicies, ...globalPolicies];

        interface MatchedEffect {
            effect: PolicyEffect;
            rule: PolicyRuleDTO;
            policy: { id: string; name: string };
        }

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
}
