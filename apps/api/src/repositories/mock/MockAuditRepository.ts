import { randomUUID } from 'node:crypto';
import type { AuditQuery } from '@agentos/types';
import type { IAuditRepository } from '../interfaces/IAuditRepository.js';
import type {
    AuditLogEntry,
    AuditLogWithAgent,
    AuditQueryResult,
    AuditAgentStats,
    CreateAuditLogInput,
} from '../../types/dto.js';

export class MockAuditRepository implements IAuditRepository {
    readonly store: AuditLogEntry[] = [];

    async create(data: CreateAuditLogInput): Promise<AuditLogEntry> {
        const entry: AuditLogEntry = {
            id: randomUUID(),
            agentId: data.agentId,
            traceId: data.traceId,
            spanId: data.spanId ?? null,
            parentSpanId: data.parentSpanId ?? null,
            event: data.event,
            model: data.model ?? null,
            toolName: data.toolName ?? null,
            inputs: data.inputs ?? null,
            outputs: data.outputs ?? null,
            inputTokens: data.inputTokens ?? null,
            outputTokens: data.outputTokens ?? null,
            costUsd: data.costUsd,
            latencyMs: data.latencyMs ?? null,
            success: data.success ?? true,
            errorMsg: data.errorMsg ?? null,
            metadata: data.metadata ?? null,
            createdAt: new Date(),
        };
        this.store.push(entry);
        return entry;
    }

    async createMany(data: CreateAuditLogInput[]): Promise<number> {
        for (const d of data) {
            await this.create(d);
        }
        return data.length;
    }

    async countByAgent(agentIds: string[]): Promise<number> {
        return this.store.filter((e) => agentIds.includes(e.agentId)).length;
    }

    async findMany(filter: AuditQuery): Promise<AuditQueryResult> {
        let filtered = [...this.store];
        if (filter.agentId) filtered = filtered.filter((e) => e.agentId === filter.agentId);
        if (filter.traceId) filtered = filtered.filter((e) => e.traceId === filter.traceId);
        if (filter.event) filtered = filtered.filter((e) => e.event === filter.event);
        if (filter.success !== undefined) filtered = filtered.filter((e) => e.success === filter.success);

        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const total = filtered.length;
        const start = (filter.page - 1) * filter.limit;
        const page = filtered.slice(start, start + filter.limit);
        const totalCostUsd = filtered.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);

        return { data: page, total, page: filter.page, limit: filter.limit, totalCostUsd };
    }

    async findByTraceId(traceId: string): Promise<AuditLogEntry[]> {
        return this.store
            .filter((e) => e.traceId === traceId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    async getAgentStats(agentId: string): Promise<AuditAgentStats> {
        const agentLogs = this.store.filter((e) => e.agentId === agentId);
        const totalCalls = agentLogs.length;
        const errorCount = agentLogs.filter((e) => !e.success).length;
        const distinctTraces = new Set(agentLogs.map((e) => e.traceId));
        const errorRate = totalCalls > 0 ? errorCount / totalCalls : 0;

        return {
            totalRuns: distinctTraces.size,
            totalCalls,
            totalCostUsd: agentLogs.reduce((s, e) => s + (e.costUsd ?? 0), 0),
            avgLatencyMs: totalCalls > 0 ? agentLogs.reduce((s, e) => s + (e.latencyMs ?? 0), 0) / totalCalls : 0,
            errorRate,
            successRate: 1 - errorRate,
            topTools: [],
        };
    }

    async exportRows(_filter: AuditQuery): Promise<AuditLogWithAgent[]> {
        return this.store.map((e) => ({ ...e, agentName: 'Test' }));
    }

    async getRecentByAgent(agentId: string, limit: number): Promise<AuditLogEntry[]> {
        return this.store
            .filter((e) => e.agentId === agentId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit);
    }

    async getAgentCost7d(agentId: string): Promise<number> {
        return this.store
            .filter((e) => e.agentId === agentId)
            .reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
    }

    async getAgentErrorAndLatency(agentId: string): Promise<{
        totalRuns: number; errorCount: number; avgLatencyMs: number; costUsd7d: number;
    }> {
        const logs = this.store.filter((e) => e.agentId === agentId);
        return {
            totalRuns: logs.length,
            errorCount: logs.filter((e) => !e.success).length,
            avgLatencyMs: logs.length > 0 ? logs.reduce((s, e) => s + (e.latencyMs ?? 0), 0) / logs.length : 0,
            costUsd7d: logs.reduce((s, e) => s + (e.costUsd ?? 0), 0),
        };
    }

    async getAgentApprovalDenyRate(_agentId: string): Promise<{ denied: number; total: number }> {
        return { denied: 0, total: 0 };
    }

    async getSpendByAgentsSince(agentIds: string[], since: Date): Promise<Map<string, number>> {
        const ids = new Set(agentIds);
        const out = new Map<string, number>();
        for (const e of this.store) {
            if (!ids.has(e.agentId)) continue;
            if (e.createdAt < since) continue;
            out.set(e.agentId, (out.get(e.agentId) ?? 0) + (e.costUsd ?? 0));
        }
        return out;
    }
}
