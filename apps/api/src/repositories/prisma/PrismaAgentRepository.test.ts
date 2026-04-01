import { describe, it, expect, vi } from 'vitest';

function createMockPrisma() {
    const agents = [
        { id: 'a1', name: 'Agent1', status: 'ACTIVE', riskTier: 'LOW', ownerTeam: 'team', environment: 'PROD', lastActiveAt: null, _count: { tools: 2 } },
        { id: 'a2', name: 'Agent2', status: 'DRAFT', riskTier: 'HIGH', ownerTeam: 'team', environment: 'DEV', lastActiveAt: null, _count: { tools: 1 } },
        { id: 'a3', name: 'Agent3', status: 'ACTIVE', riskTier: 'MEDIUM', ownerTeam: 'team', environment: 'PROD', lastActiveAt: null, _count: { tools: 0 } },
    ];

    return {
        agent: {
            findMany: vi.fn().mockResolvedValue(agents),
            count: vi.fn().mockResolvedValue(3),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        auditLog: {
            groupBy: vi.fn().mockResolvedValue([
                { agentId: 'a1', _sum: { costUsd: 1.5 } },
                { agentId: 'a3', _sum: { costUsd: 0.75 } },
            ]),
            aggregate: vi.fn(),
        },
        agentTool: { deleteMany: vi.fn() },
    };
}

describe('PrismaAgentRepository.findMany — N+1 fix', () => {
    it('calls auditLog.groupBy once instead of N times for cost aggregation', async () => {
        const mockPrisma = createMockPrisma();

        const { PrismaAgentRepository } = await import('./PrismaAgentRepository.js');
        const repo = new PrismaAgentRepository(mockPrisma as any);

        const result = await repo.findMany({ page: 1, limit: 10 });

        expect(mockPrisma.auditLog.groupBy).toHaveBeenCalledTimes(1);
        expect(mockPrisma.auditLog.aggregate).not.toHaveBeenCalled();

        expect(result.data).toHaveLength(3);
        expect(result.data[0]!.cost7dUsd).toBe(1.5);
        expect(result.data[1]!.cost7dUsd).toBe(0);
        expect(result.data[2]!.cost7dUsd).toBe(0.75);
    });

    it('handles empty agent list without calling groupBy', async () => {
        const mockPrisma = createMockPrisma();
        mockPrisma.agent.findMany.mockResolvedValue([]);
        mockPrisma.agent.count.mockResolvedValue(0);

        const { PrismaAgentRepository } = await import('./PrismaAgentRepository.js');
        const repo = new PrismaAgentRepository(mockPrisma as any);

        const result = await repo.findMany({ page: 1, limit: 10 });

        expect(mockPrisma.auditLog.groupBy).not.toHaveBeenCalled();
        expect(result.data).toHaveLength(0);
    });

    it('defaults to 0 for agents missing from groupBy results', async () => {
        const mockPrisma = createMockPrisma();
        mockPrisma.auditLog.groupBy.mockResolvedValue([
            { agentId: 'a2', _sum: { costUsd: 3.0 } },
        ]);

        const { PrismaAgentRepository } = await import('./PrismaAgentRepository.js');
        const repo = new PrismaAgentRepository(mockPrisma as any);

        const result = await repo.findMany({ page: 1, limit: 10 });

        expect(result.data[0]!.cost7dUsd).toBe(0);
        expect(result.data[1]!.cost7dUsd).toBe(3.0);
        expect(result.data[2]!.cost7dUsd).toBe(0);
    });
});
