import type { AuditEventInput, AuditQuery } from '@agentos/types';
import type { IAuditRepository } from '../../repositories/interfaces/IAuditRepository.js';
import type { IAgentRepository } from '../../repositories/interfaces/IAgentRepository.js';
import type {
    AuditLogEntry,
    AuditQueryResult,
    AuditAgentStats,
    TraceDetail,
} from '../../types/dto.js';

const CSV_HEADERS = 'id,agentId,agentName,traceId,event,model,toolName,inputTokens,outputTokens,costUsd,latencyMs,success,createdAt';

function escapeCsvField(value: unknown): string {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export class AuditService {
    constructor(
        private readonly auditRepo: IAuditRepository,
        private readonly agentRepo: IAgentRepository,
    ) { }

    async createLog(data: AuditEventInput, costUsd: number): Promise<AuditLogEntry> {
        const log = await this.auditRepo.create({
            agentId: data.agentId,
            traceId: data.traceId,
            event: data.event,
            model: data.model,
            toolName: data.toolName,
            inputs: data.inputs,
            outputs: data.outputs,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            costUsd,
            latencyMs: data.latencyMs,
            success: data.success,
            errorMsg: data.errorMsg,
            metadata: data.metadata,
        });

        this.agentRepo.updateLastActiveAt(data.agentId);

        return log;
    }

    async queryLogs(query: AuditQuery): Promise<AuditQueryResult> {
        return this.auditRepo.findMany(query);
    }

    async getTrace(traceId: string): Promise<TraceDetail | null> {
        const events = await this.auditRepo.findByTraceId(traceId);
        if (events.length === 0) return null;

        const agentName = await this.agentRepo.findNameById(events[0]!.agentId);

        const totalCost = events.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
        const totalLatencyMs = events.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0);
        const success = events.every((e) => e.success);

        return {
            traceId,
            agentId: events[0]!.agentId,
            agentName: agentName ?? 'Unknown',
            events,
            totalCost: parseFloat(totalCost.toFixed(6)),
            totalLatencyMs,
            startedAt: events[0]!.createdAt,
            completedAt: events[events.length - 1]!.createdAt,
            success,
        };
    }

    async getAgentStats(agentId: string): Promise<AuditAgentStats> {
        return this.auditRepo.getAgentStats(agentId);
    }

    async exportCsv(query: AuditQuery): Promise<string> {
        const logs = await this.auditRepo.exportRows(query);

        const rows = logs.map((log) =>
            [
                log.id,
                log.agentId,
                escapeCsvField(log.agentName),
                log.traceId,
                log.event,
                log.model ?? '',
                log.toolName ?? '',
                log.inputTokens ?? '',
                log.outputTokens ?? '',
                log.costUsd ?? '',
                log.latencyMs ?? '',
                log.success,
                log.createdAt.toISOString(),
            ].join(','),
        );

        return [CSV_HEADERS, ...rows].join('\n');
    }
}
