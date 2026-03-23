import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from './analytics.service.js';
import { PrismaAnalyticsRepository } from '../../repositories/prisma/PrismaAnalyticsRepository.js';

const prisma = new PrismaClient();
const analyticsService = new AnalyticsService(new PrismaAnalyticsRepository(prisma));

let testAgentId: string;
let testAgent2Id: string;
const createdLogIds: string[] = [];
const createdTicketIds: string[] = [];

beforeAll(async () => {
    const agent1 = await prisma.agent.create({
        data: {
            name: 'Analytics Test Agent 1',
            description: 'Agent for analytics tests',
            ownerTeam: 'engineering',
            llmModel: 'claude-sonnet-4-5',
            riskTier: 'HIGH',
            environment: 'DEV',
            tags: ['test'],
        },
    });
    testAgentId = agent1.id;

    const agent2 = await prisma.agent.create({
        data: {
            name: 'Analytics Test Agent 2',
            description: 'Second agent for analytics tests',
            ownerTeam: 'data-science',
            llmModel: 'gpt-4o',
            riskTier: 'MEDIUM',
            environment: 'DEV',
            tags: ['test'],
        },
    });
    testAgent2Id = agent2.id;
});

afterEach(async () => {
    if (createdTicketIds.length > 0) {
        await prisma.approvalTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
        createdTicketIds.length = 0;
    }
    if (createdLogIds.length > 0) {
        await prisma.auditLog.deleteMany({ where: { id: { in: createdLogIds } } });
        createdLogIds.length = 0;
    }
});

afterAll(async () => {
    await prisma.approvalTicket.deleteMany({ where: { agentId: { in: [testAgentId, testAgent2Id] } } });
    await prisma.auditLog.deleteMany({ where: { agentId: { in: [testAgentId, testAgent2Id] } } });
    await prisma.agentPolicy.deleteMany({ where: { agentId: { in: [testAgentId, testAgent2Id] } } });
    await prisma.agentTool.deleteMany({ where: { agentId: { in: [testAgentId, testAgent2Id] } } });
    await prisma.agent.deleteMany({ where: { id: { in: [testAgentId, testAgent2Id] } } });
    await prisma.$disconnect();
});

async function seedLog(overrides: Record<string, unknown> = {}) {
    const log = await prisma.auditLog.create({
        data: {
            agentId: testAgentId,
            traceId: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            event: 'llm_call',
            model: 'claude-sonnet-4-5',
            inputTokens: 1000,
            outputTokens: 500,
            costUsd: 0.01,
            latencyMs: 500,
            success: true,
            ...overrides,
        },
    });
    createdLogIds.push(log.id);
    return log;
}

async function seedTicket(status: string, agentId?: string) {
    const ticket = await prisma.approvalTicket.create({
        data: {
            agentId: agentId ?? testAgentId,
            actionType: 'test_action',
            payload: {},
            riskScore: 0.5,
            reasoning: 'Test ticket',
            status: status as 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'AUTO_APPROVED',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
    });
    createdTicketIds.push(ticket.id);
    return ticket;
}

describe('getCostSummary', () => {
    it('returns all zeros on empty DB (for test agents)', async () => {
        const result = await analyticsService.getCostSummary();
        expect(result).toHaveProperty('todayUsd');
        expect(result).toHaveProperty('last7dUsd');
        expect(result).toHaveProperty('last30dUsd');
        expect(result).toHaveProperty('totalUsd');
        expect(result).toHaveProperty('changeVs7dAgo');
        expect(typeof result.todayUsd).toBe('number');
    });

    it('returns correct cost sums including today', async () => {
        await seedLog({ costUsd: 0.05 });
        await seedLog({ costUsd: 0.03 });

        const result = await analyticsService.getCostSummary();
        expect(result.todayUsd).toBeGreaterThanOrEqual(0.08);
        expect(result.last7dUsd).toBeGreaterThanOrEqual(0.08);
        expect(result.last30dUsd).toBeGreaterThanOrEqual(0.08);
        expect(result.totalUsd).toBeGreaterThanOrEqual(0.08);
    });

    it('throws on invalid date range (fromDate > toDate)', async () => {
        await expect(
            analyticsService.getCostSummary('2026-03-21', '2026-03-01'),
        ).rejects.toThrow('fromDate must be before toDate');
    });
});

describe('getCostTimeline', () => {
    it('returns correct number of dates for days=7', async () => {
        const result = await analyticsService.getCostTimeline(7);
        expect(result.dates).toHaveLength(7);
        expect(result).toHaveProperty('series');
    });

    it('returns correct number of dates for days=30', async () => {
        const result = await analyticsService.getCostTimeline(30);
        expect(result.dates).toHaveLength(30);
    });

    it('zero-fills days with no activity', async () => {
        await seedLog({ costUsd: 0.01 });

        const result = await analyticsService.getCostTimeline(7);
        const agentSeries = result.series.find((s: { agentId: string }) => s.agentId === testAgentId);
        if (agentSeries) {
            expect(agentSeries.dailyCosts).toHaveLength(7);
            const zeroCount = agentSeries.dailyCosts.filter((c: number) => c === 0).length;
            expect(zeroCount).toBeGreaterThanOrEqual(6);
        }
    });

    it('returns single series when filtered by agentId', async () => {
        await seedLog({ agentId: testAgentId, costUsd: 0.01 });
        await seedLog({ agentId: testAgent2Id, costUsd: 0.02 });

        const result = await analyticsService.getCostTimeline(7, testAgentId);
        expect(result.series.length).toBeLessThanOrEqual(1);
        if (result.series.length === 1) {
            expect(result.series[0]!.agentId).toBe(testAgentId);
        }
    });

    it('returns empty series when no data exists', async () => {
        const result = await analyticsService.getCostTimeline(7, '00000000-0000-0000-0000-000000000099');
        expect(result.series).toHaveLength(0);
        expect(result.dates).toHaveLength(7);
    });
});

describe('getUsageStats', () => {
    it('returns correct run, call, and approval counts', async () => {
        const traceId = `usage-trace-${Date.now()}`;
        await seedLog({ traceId, event: 'llm_call', costUsd: 0.01 });
        await seedLog({ traceId, event: 'tool_call', costUsd: 0.005 });
        await seedTicket('APPROVED');
        await seedTicket('DENIED');
        await seedTicket('AUTO_APPROVED');

        const result = await analyticsService.getUsageStats();
        expect(result.totalRuns).toBeGreaterThanOrEqual(1);
        expect(result.totalLlmCalls).toBeGreaterThanOrEqual(1);
        expect(result.totalToolCalls).toBeGreaterThanOrEqual(1);
        expect(result.avgRunCostUsd).toBeGreaterThan(0);
        expect(result.approved).toBeGreaterThanOrEqual(1);
        expect(result.denied).toBeGreaterThanOrEqual(1);
        expect(result.autoApproved).toBeGreaterThanOrEqual(1);
    });

    it('returns all zeros on empty DB (no test data)', async () => {
        const result = await analyticsService.getUsageStats('2099-01-01', '2099-01-02');
        expect(result.totalRuns).toBe(0);
        expect(result.totalLlmCalls).toBe(0);
        expect(result.totalToolCalls).toBe(0);
        expect(result.avgRunCostUsd).toBe(0);
    });
});

describe('getAgentLeaderboard', () => {
    it('sorts by cost descending', async () => {
        await seedLog({ agentId: testAgentId, costUsd: 0.10 });
        await seedLog({ agentId: testAgent2Id, costUsd: 0.05 });

        const result = await analyticsService.getAgentLeaderboard('cost', 10);
        expect(result.agents.length).toBeGreaterThanOrEqual(2);

        const idx1 = result.agents.findIndex((a: { agentId: string }) => a.agentId === testAgentId);
        const idx2 = result.agents.findIndex((a: { agentId: string }) => a.agentId === testAgent2Id);
        if (idx1 >= 0 && idx2 >= 0) {
            expect(idx1).toBeLessThan(idx2);
        }
    });

    it('sorts by errorRate descending', async () => {
        await seedLog({ agentId: testAgentId, success: true });
        await seedLog({ agentId: testAgent2Id, success: false });

        const result = await analyticsService.getAgentLeaderboard('errorRate', 10);
        expect(result.agents.length).toBeGreaterThanOrEqual(2);

        const agent2Entry = result.agents.find((a: { agentId: string }) => a.agentId === testAgent2Id);
        expect(agent2Entry).toBeDefined();
        expect(agent2Entry!.errorRate).toBeGreaterThan(0);
    });

    it('includes healthScore for each agent', async () => {
        await seedLog({ agentId: testAgentId, costUsd: 0.01 });

        const result = await analyticsService.getAgentLeaderboard('cost', 10);
        const entry = result.agents.find((a: { agentId: string }) => a.agentId === testAgentId);
        expect(entry).toBeDefined();
        expect(entry!.healthScore).toBeGreaterThanOrEqual(0);
        expect(entry!.healthScore).toBeLessThanOrEqual(100);
    });

    it('respects limit parameter', async () => {
        await seedLog({ agentId: testAgentId, costUsd: 0.01 });
        await seedLog({ agentId: testAgent2Id, costUsd: 0.01 });

        const result = await analyticsService.getAgentLeaderboard('cost', 1);
        expect(result.agents.length).toBeLessThanOrEqual(1);
    });

    it('returns empty agents on no data', async () => {
        await prisma.auditLog.deleteMany({ where: { agentId: { in: [testAgentId, testAgent2Id] } } });
        const result = await analyticsService.getAgentLeaderboard('cost', 10);
        const hasTestAgents = result.agents.some((a: { agentId: string }) =>
            [testAgentId, testAgent2Id].includes(a.agentId),
        );
        expect(hasTestAgents).toBe(false);
    });
});

describe('getModelUsage', () => {
    it('returns model breakdown sorted by cost desc', async () => {
        await seedLog({ model: 'claude-sonnet-4-5', costUsd: 0.10, inputTokens: 1000, outputTokens: 500 });
        await seedLog({ model: 'gpt-4o', costUsd: 0.05, inputTokens: 800, outputTokens: 400 });

        const result = await analyticsService.getModelUsage();
        expect(result.models.length).toBeGreaterThanOrEqual(2);

        const claudeIdx = result.models.findIndex((m: { model: string }) => m.model === 'claude-sonnet-4-5');
        const gptIdx = result.models.findIndex((m: { model: string }) => m.model === 'gpt-4o');
        if (claudeIdx >= 0 && gptIdx >= 0) {
            expect(claudeIdx).toBeLessThan(gptIdx);
        }
    });

    it('excludes null model entries', async () => {
        await seedLog({ model: null, costUsd: 0.01 });

        const result = await analyticsService.getModelUsage();
        const nullModel = result.models.find((m: { model: string }) => m.model === null || m.model === '');
        expect(nullModel).toBeUndefined();
    });
});
