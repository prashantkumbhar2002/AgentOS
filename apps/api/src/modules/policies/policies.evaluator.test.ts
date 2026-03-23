process.env['DATABASE_URL'] =
    process.env['DATABASE_URL'] ??
    'postgresql://postgres:postgres@localhost:5432/agentos';
process.env['JWT_SECRET'] =
    'test-jwt-secret-key-that-is-at-least-32-characters-long';
process.env['JWT_EXPIRES_IN'] = '8h';
process.env['NODE_ENV'] = 'test';
process.env['FRONTEND_URL'] = 'http://localhost:5173';
process.env['REDIS_URL'] = 'redis://localhost:6379';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PolicyEvaluator } from './policies.evaluator.js';
import { PrismaPolicyRepository } from '../../repositories/prisma/PrismaPolicyRepository.js';
import { PrismaAgentRepository } from '../../repositories/prisma/PrismaAgentRepository.js';

const prisma = new PrismaClient();
const policyEvaluator = new PolicyEvaluator(
    new PrismaPolicyRepository(prisma),
    new PrismaAgentRepository(prisma),
);

let testAgentId: string;
const createdPolicyIds: string[] = [];

beforeAll(async () => {
    const agent = await prisma.agent.create({
        data: {
            name: 'Evaluator Test Agent',
            description: 'Agent for evaluator unit tests',
            ownerTeam: 'engineering',
            llmModel: 'claude-sonnet-4-5',
            riskTier: 'HIGH',
            environment: 'DEV',
            tags: ['test'],
        },
    });
    testAgentId = agent.id;
});

afterEach(async () => {
    for (const id of createdPolicyIds) {
        await prisma.agentPolicy.deleteMany({ where: { policyId: id } });
        await prisma.policyRule.deleteMany({ where: { policyId: id } });
        await prisma.policy.deleteMany({ where: { id } });
    }
    createdPolicyIds.length = 0;
});

afterAll(async () => {
    await prisma.agent.deleteMany({ where: { id: testAgentId } });
    await prisma.$disconnect();
});

async function createTestPolicy(
    name: string,
    rules: { actionType: string; riskTiers: string[]; effect: string; conditions?: unknown }[],
    assignToAgent?: string,
) {
    const policy = await prisma.policy.create({
        data: {
            name: `eval-test-${name}-${Date.now()}`,
            description: `Test policy: ${name}`,
            isActive: true,
            rules: {
                create: rules.map((r) => ({
                    actionType: r.actionType,
                    riskTiers: r.riskTiers as never[],
                    effect: r.effect as never,
                    conditions: r.conditions ?? undefined,
                })),
            },
        },
    });
    createdPolicyIds.push(policy.id);

    if (assignToAgent) {
        await prisma.agentPolicy.create({
            data: { agentId: assignToAgent, policyId: policy.id },
        });
    }

    return policy;
}

describe('evaluatePolicy', () => {
    it('returns DENY when a DENY rule matches', async () => {
        await createTestPolicy('deny-delete', [
            { actionType: 'delete_record', riskTiers: ['HIGH', 'CRITICAL'], effect: 'DENY' },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'delete_record', 'HIGH');

        expect(result.effect).toBe('DENY');
        expect(result.reason).toContain('Blocked by policy');
        expect(result.matchedRule).toBeDefined();
        expect(result.matchedPolicy).toBeDefined();
    });

    it('DENY wins over ALLOW when both match', async () => {
        await createTestPolicy('allow-all', [
            { actionType: '*', riskTiers: [], effect: 'ALLOW' },
        ]);
        await createTestPolicy('deny-send', [
            { actionType: 'send_email', riskTiers: ['HIGH'], effect: 'DENY' },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'send_email', 'HIGH');

        expect(result.effect).toBe('DENY');
    });

    it('REQUIRE_APPROVAL wins over ALLOW', async () => {
        await createTestPolicy('allow-low', [
            { actionType: '*', riskTiers: ['LOW'], effect: 'ALLOW' },
        ]);
        await createTestPolicy('require-send', [
            { actionType: 'send_email', riskTiers: [], effect: 'REQUIRE_APPROVAL' },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'send_email', 'LOW');

        expect(result.effect).toBe('REQUIRE_APPROVAL');
        expect(result.reason).toContain('Approval required by policy');
    });

    it('returns default REQUIRE_APPROVAL when no rules match', async () => {
        const result = await policyEvaluator.evaluate(testAgentId, 'unknown_action_xyz', 'MEDIUM');

        expect(result.effect).toBe('REQUIRE_APPROVAL');
        expect(result.reason).toContain('No matching policy');
        expect(result.matchedRule).toBeUndefined();
        expect(result.matchedPolicy).toBeUndefined();
    });

    it('wildcard actionType "*" matches any action', async () => {
        await createTestPolicy('wildcard-allow', [
            { actionType: '*', riskTiers: ['MEDIUM'], effect: 'ALLOW' },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'any_random_action', 'MEDIUM');

        expect(result.effect).toBe('ALLOW');
    });

    it('empty riskTiers array matches all tiers', async () => {
        await createTestPolicy('all-tiers-deny', [
            { actionType: 'shutdown', riskTiers: [], effect: 'DENY' },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'shutdown', 'LOW');
        expect(result.effect).toBe('DENY');

        const result2 = await policyEvaluator.evaluate(testAgentId, 'shutdown', 'CRITICAL');
        expect(result2.effect).toBe('DENY');
    });

    it('conditions match — rule matches when context has same values', async () => {
        await createTestPolicy('conditional-require', [
            {
                actionType: 'send_email',
                riskTiers: ['HIGH'],
                effect: 'REQUIRE_APPROVAL',
                conditions: { recipientType: 'external' },
            },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'send_email', 'HIGH', {
            recipientType: 'external',
        });

        expect(result.effect).toBe('REQUIRE_APPROVAL');
    });

    it('conditions mismatch — rule is skipped when context does not match', async () => {
        await createTestPolicy('conditional-skip', [
            {
                actionType: 'send_email',
                riskTiers: ['HIGH'],
                effect: 'DENY',
                conditions: { recipientType: 'external' },
            },
        ]);

        const result = await policyEvaluator.evaluate(testAgentId, 'send_email', 'HIGH', {
            recipientType: 'internal',
        });

        expect(result.effect).not.toBe('DENY');
    });

    it('inactive policy is skipped during evaluation', async () => {
        const policy = await createTestPolicy('inactive-deny', [
            { actionType: '*', riskTiers: [], effect: 'DENY' },
        ]);
        await prisma.policy.update({
            where: { id: policy.id },
            data: { isActive: false },
        });

        const result = await policyEvaluator.evaluate(testAgentId, 'any_action', 'HIGH');

        expect(result.effect).not.toBe('DENY');
    });

    it('agent-specific policy is evaluated before global', async () => {
        await createTestPolicy('global-allow', [
            { actionType: 'deploy', riskTiers: [], effect: 'ALLOW' },
        ]);
        await createTestPolicy(
            'agent-deny',
            [{ actionType: 'deploy', riskTiers: [], effect: 'DENY' }],
            testAgentId,
        );

        const result = await policyEvaluator.evaluate(testAgentId, 'deploy', 'HIGH');

        expect(result.effect).toBe('DENY');
    });

    it('throws error for non-existent agent', async () => {
        await expect(
            policyEvaluator.evaluate('00000000-0000-0000-0000-000000000000', 'any', 'LOW'),
        ).rejects.toThrow('Agent not found');
    });
});
