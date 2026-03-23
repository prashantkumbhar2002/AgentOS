import type { PrismaClient, Prisma } from '@prisma/client';
import type { AuditQuery } from '@agentos/types';
import type { IAuditRepository } from '../interfaces/IAuditRepository.js';
import type {
    AuditLogEntry,
    AuditLogWithAgent,
    AuditQueryResult,
    AuditAgentStats,
    CreateAuditLogInput,
} from '../../types/dto.js';

export class PrismaAuditRepository implements IAuditRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(data: CreateAuditLogInput): Promise<AuditLogEntry> {
        const log = await this.prisma.auditLog.create({
            data: {
                agentId: data.agentId,
                traceId: data.traceId,
                event: data.event,
                model: data.model ?? null,
                toolName: data.toolName ?? null,
                inputs: data.inputs ?? undefined,
                outputs: data.outputs ?? undefined,
                inputTokens: data.inputTokens ?? null,
                outputTokens: data.outputTokens ?? null,
                costUsd: data.costUsd,
                latencyMs: data.latencyMs ?? null,
                success: data.success ?? true,
                errorMsg: data.errorMsg ?? null,
                metadata: data.metadata ?? undefined,
            },
        });
        return this.toEntry(log);
    }

    async createMany(data: CreateAuditLogInput[]): Promise<number> {
        const result = await this.prisma.auditLog.createMany({
            data: data.map((d) => ({
                agentId: d.agentId,
                traceId: d.traceId,
                event: d.event,
                model: d.model ?? null,
                toolName: d.toolName ?? null,
                inputs: d.inputs ?? undefined,
                outputs: d.outputs ?? undefined,
                inputTokens: d.inputTokens ?? null,
                outputTokens: d.outputTokens ?? null,
                costUsd: d.costUsd,
                latencyMs: d.latencyMs ?? null,
                success: d.success ?? true,
                errorMsg: d.errorMsg ?? null,
                metadata: d.metadata ?? undefined,
                createdAt: (d as any).createdAt ?? new Date(),
            })),
        });
        return result.count;
    }

    async countByAgent(agentIds: string[]): Promise<number> {
        return this.prisma.auditLog.count({
            where: { agentId: { in: agentIds } },
        });
    }

    async findMany(filter: AuditQuery): Promise<AuditQueryResult> {
        const { agentId, traceId, event, success, fromDate, toDate, page, limit } = filter;

        const where: Prisma.AuditLogWhereInput = {};
        if (agentId) where.agentId = agentId;
        if (traceId) where.traceId = traceId;
        if (event) where.event = event;
        if (success !== undefined) where.success = success;
        if (fromDate || toDate) {
            where.createdAt = {};
            if (fromDate) where.createdAt.gte = fromDate;
            if (toDate) where.createdAt.lte = toDate;
        }

        const [data, total, costAgg] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.auditLog.count({ where }),
            this.prisma.auditLog.aggregate({
                where,
                _sum: { costUsd: true },
            }),
        ]);

        return {
            data: data.map((log) => this.toEntry(log)),
            total,
            page,
            limit,
            totalCostUsd: costAgg._sum.costUsd ?? 0,
        };
    }

    async findByTraceId(traceId: string): Promise<AuditLogEntry[]> {
        const events = await this.prisma.auditLog.findMany({
            where: { traceId },
            orderBy: { createdAt: 'asc' },
        });
        return events.map((e) => this.toEntry(e));
    }

    async getAgentStats(agentId: string): Promise<AuditAgentStats> {
        const [totalCalls, errorCount, costAgg, latencyAgg] = await Promise.all([
            this.prisma.auditLog.count({ where: { agentId } }),
            this.prisma.auditLog.count({ where: { agentId, success: false } }),
            this.prisma.auditLog.aggregate({
                where: { agentId },
                _sum: { costUsd: true },
            }),
            this.prisma.auditLog.aggregate({
                where: { agentId },
                _avg: { latencyMs: true },
            }),
        ]);

        const distinctTraces = await this.prisma.auditLog.groupBy({
            by: ['traceId'],
            where: { agentId },
        });
        const totalRuns = distinctTraces.length;

        const toolGroups = await this.prisma.auditLog.groupBy({
            by: ['toolName'],
            where: { agentId, toolName: { not: null } },
            _count: { toolName: true },
            orderBy: { _count: { toolName: 'desc' } },
            take: 10,
        });

        const topTools = toolGroups.map((g) => ({
            name: g.toolName!,
            count: g._count.toolName,
        }));

        const errorRate = totalCalls > 0 ? errorCount / totalCalls : 0;
        const successRate = totalCalls > 0 ? (totalCalls - errorCount) / totalCalls : 1;

        return {
            totalRuns,
            totalCalls,
            totalCostUsd: costAgg._sum.costUsd ?? 0,
            avgLatencyMs: latencyAgg._avg.latencyMs ?? 0,
            errorRate: parseFloat(errorRate.toFixed(6)),
            successRate: parseFloat(successRate.toFixed(6)),
            topTools,
        };
    }

    async exportRows(filter: AuditQuery): Promise<AuditLogWithAgent[]> {
        const where: Prisma.AuditLogWhereInput = {};
        if (filter.agentId) where.agentId = filter.agentId;
        if (filter.traceId) where.traceId = filter.traceId;
        if (filter.event) where.event = filter.event;
        if (filter.success !== undefined) where.success = filter.success;
        if (filter.fromDate || filter.toDate) {
            where.createdAt = {};
            if (filter.fromDate) where.createdAt.gte = filter.fromDate;
            if (filter.toDate) where.createdAt.lte = filter.toDate;
        }

        const logs = await this.prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { agent: { select: { name: true } } },
        });

        return logs.map((log) => ({
            ...this.toEntry(log),
            agentName: log.agent.name,
        }));
    }

    async getRecentByAgent(agentId: string, limit: number): Promise<AuditLogEntry[]> {
        const logs = await this.prisma.auditLog.findMany({
            where: { agentId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return logs.map((log) => this.toEntry(log));
    }

    async getAgentCost7d(agentId: string): Promise<number> {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const costAgg = await this.prisma.auditLog.aggregate({
            where: { agentId, createdAt: { gte: sevenDaysAgo } },
            _sum: { costUsd: true },
        });
        return costAgg._sum.costUsd ?? 0;
    }

    async getAgentErrorAndLatency(agentId: string): Promise<{
        totalRuns: number;
        errorCount: number;
        avgLatencyMs: number;
        costUsd7d: number;
    }> {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [totalRuns, errorCount, costAgg, latencyAgg] = await Promise.all([
            this.prisma.auditLog.count({ where: { agentId } }),
            this.prisma.auditLog.count({ where: { agentId, success: false } }),
            this.prisma.auditLog.aggregate({
                where: { agentId, createdAt: { gte: sevenDaysAgo } },
                _sum: { costUsd: true },
            }),
            this.prisma.auditLog.aggregate({
                where: { agentId },
                _avg: { latencyMs: true },
            }),
        ]);

        return {
            totalRuns,
            errorCount,
            avgLatencyMs: latencyAgg._avg.latencyMs ?? 0,
            costUsd7d: costAgg._sum.costUsd ?? 0,
        };
    }

    async getAgentApprovalDenyRate(agentId: string): Promise<{ denied: number; total: number }> {
        const [denied, total] = await Promise.all([
            this.prisma.approvalTicket.count({ where: { agentId, status: 'DENIED' } }),
            this.prisma.approvalTicket.count({ where: { agentId } }),
        ]);
        return { denied, total };
    }

    private toEntry(log: any): AuditLogEntry {
        return {
            id: log.id,
            agentId: log.agentId,
            traceId: log.traceId,
            event: log.event,
            model: log.model,
            toolName: log.toolName,
            inputs: log.inputs,
            outputs: log.outputs,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            costUsd: log.costUsd,
            latencyMs: log.latencyMs,
            success: log.success,
            errorMsg: log.errorMsg,
            metadata: log.metadata,
            createdAt: log.createdAt,
        };
    }
}
