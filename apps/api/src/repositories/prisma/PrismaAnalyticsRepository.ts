import type { PrismaClient } from '@prisma/client';
import type { IAnalyticsRepository } from '../interfaces/IAnalyticsRepository.js';
import type {
    CostAggregate,
    DailyCostEntry,
    UsageCounts,
    ApprovalStatusCounts,
    AgentMetricRow,
    ModelMetricRow,
    DateFilter,
    DateRange,
} from '../../types/dto.js';

export class PrismaAnalyticsRepository implements IAnalyticsRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async getCostAggregates(ranges: DateRange[]): Promise<CostAggregate[]> {
        const results: CostAggregate[] = [];

        for (const range of ranges) {
            const where: Record<string, unknown> = {};
            if (range.gte || range.lt) {
                const createdAt: Record<string, Date> = {};
                if (range.gte) createdAt['gte'] = range.gte;
                if (range.lt) createdAt['lt'] = range.lt;
                where['createdAt'] = createdAt;
            }

            const agg = await this.prisma.auditLog.aggregate({
                _sum: { costUsd: true },
                where,
            });

            results.push({
                rangeKey: range.key,
                totalUsd: agg._sum.costUsd ?? 0,
            });
        }

        return results;
    }

    async getCostByAgentByDay(startDate: Date): Promise<DailyCostEntry[]> {
        const logs = await this.prisma.auditLog.findMany({
            where: { createdAt: { gte: startDate } },
            select: { agentId: true, costUsd: true, createdAt: true },
        });

        const agents = await this.prisma.agent.findMany({
            where: {
                id: {
                    in: [...new Set(logs.map((l) => l.agentId))],
                },
            },
            select: { id: true, name: true },
        });

        const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

        const costMap = new Map<string, number>();
        for (const log of logs) {
            const dateKey = log.createdAt.toISOString().split('T')[0]!;
            const key = `${log.agentId}:${dateKey}`;
            costMap.set(key, (costMap.get(key) ?? 0) + (log.costUsd ?? 0));
        }

        const entries: DailyCostEntry[] = [];
        for (const [key, costUsd] of costMap) {
            const [agentId, date] = key.split(':');
            entries.push({
                date: date!,
                agentId: agentId!,
                agentName: agentNameMap.get(agentId!) ?? 'Unknown',
                costUsd,
            });
        }

        return entries;
    }

    async getUsageCounts(dateFilter?: DateFilter): Promise<UsageCounts> {
        const where = dateFilter ? { createdAt: dateFilter } : {};

        const [distinctTraces, llmCount, toolCount, costAgg] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                distinct: ['traceId'],
                select: { traceId: true },
            }),
            this.prisma.auditLog.count({ where: { ...where, event: 'llm_call' } }),
            this.prisma.auditLog.count({ where: { ...where, event: 'tool_call' } }),
            this.prisma.auditLog.aggregate({ _sum: { costUsd: true }, where }),
        ]);

        return {
            totalRuns: distinctTraces.length,
            totalLlmCalls: llmCount,
            totalToolCalls: toolCount,
            totalCostUsd: costAgg._sum.costUsd ?? 0,
        };
    }

    async getApprovalCountsByStatus(dateFilter?: DateFilter): Promise<ApprovalStatusCounts> {
        const where = dateFilter ? { createdAt: dateFilter } : {};

        const groups = await this.prisma.approvalTicket.groupBy({
            by: ['status'],
            _count: true,
            where,
        });

        const counts: Record<string, number> = {};
        for (const g of groups) {
            counts[g.status] = g._count;
        }

        return {
            approved: counts['APPROVED'] ?? 0,
            denied: counts['DENIED'] ?? 0,
            expired: counts['EXPIRED'] ?? 0,
            autoApproved: counts['AUTO_APPROVED'] ?? 0,
            pending: counts['PENDING'] ?? 0,
        };
    }

    async getAgentMetrics(): Promise<AgentMetricRow[]> {
        const agentGroups = await this.prisma.auditLog.groupBy({
            by: ['agentId'],
            _sum: { costUsd: true },
            _avg: { latencyMs: true },
            _count: true,
        });

        if (agentGroups.length === 0) return [];

        const agentIds = agentGroups.map((g) => g.agentId);

        const [agents, errorCounts, approvalGroups, distinctTraceCounts] = await Promise.all([
            this.prisma.agent.findMany({
                where: { id: { in: agentIds } },
                select: { id: true, name: true, ownerTeam: true },
            }),
            this.prisma.auditLog.groupBy({
                by: ['agentId'],
                _count: true,
                where: { agentId: { in: agentIds }, success: false },
            }),
            this.prisma.approvalTicket.groupBy({
                by: ['agentId', 'status'],
                _count: true,
                where: { agentId: { in: agentIds } },
            }),
            this.prisma.auditLog.findMany({
                where: { agentId: { in: agentIds } },
                distinct: ['traceId', 'agentId'],
                select: { agentId: true, traceId: true },
            }),
        ]);

        const runsPerAgent = new Map<string, number>();
        for (const row of distinctTraceCounts) {
            runsPerAgent.set(row.agentId, (runsPerAgent.get(row.agentId) ?? 0) + 1);
        }

        const agentMap = new Map(agents.map((a) => [a.id, a]));
        const errorMap = new Map(errorCounts.map((e) => [e.agentId, e._count]));

        const approvalCountMap = new Map<string, number>();
        const approvalDenyMap = new Map<string, number>();
        for (const g of approvalGroups) {
            approvalCountMap.set(g.agentId, (approvalCountMap.get(g.agentId) ?? 0) + g._count);
            if (g.status === 'DENIED') {
                approvalDenyMap.set(g.agentId, g._count);
            }
        }

        return agentGroups.map((g) => {
            const agent = agentMap.get(g.agentId);
            return {
                agentId: g.agentId,
                agentName: agent?.name ?? 'Unknown',
                ownerTeam: agent?.ownerTeam ?? 'Unknown',
                totalCostUsd: g._sum.costUsd ?? 0,
                totalEvents: g._count,
                errorCount: errorMap.get(g.agentId) ?? 0,
                avgLatencyMs: g._avg.latencyMs ?? 0,
                totalRuns: runsPerAgent.get(g.agentId) ?? 0,
                totalApprovals: approvalCountMap.get(g.agentId) ?? 0,
                deniedCount: approvalDenyMap.get(g.agentId) ?? 0,
            };
        });
    }

    async getModelMetrics(): Promise<ModelMetricRow[]> {
        const groups = await this.prisma.auditLog.groupBy({
            by: ['model'],
            _sum: { costUsd: true, inputTokens: true, outputTokens: true },
            _count: true,
            where: { model: { not: null } },
        });

        return groups.map((g) => ({
            model: g.model!,
            callCount: g._count,
            totalInputTokens: g._sum.inputTokens ?? 0,
            totalOutputTokens: g._sum.outputTokens ?? 0,
            totalCostUsd: g._sum.costUsd ?? 0,
        }));
    }

    async getDistinctTraceCount(dateFilter?: DateFilter): Promise<number> {
        const where = dateFilter ? { createdAt: dateFilter } : {};
        const traces = await this.prisma.auditLog.findMany({
            where,
            distinct: ['traceId'],
            select: { traceId: true },
        });
        return traces.length;
    }
}
