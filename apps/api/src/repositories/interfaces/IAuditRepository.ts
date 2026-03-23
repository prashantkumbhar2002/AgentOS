import type { AuditQuery } from '@agentos/types';
import type { AuditLogEntry, AuditLogWithAgent, AuditQueryResult, AuditAgentStats, CreateAuditLogInput } from '../../types/dto.js';

export interface IAuditRepository {
    create(data: CreateAuditLogInput): Promise<AuditLogEntry>;
    findMany(filter: AuditQuery): Promise<AuditQueryResult>;
    findByTraceId(traceId: string): Promise<AuditLogEntry[]>;
    getAgentStats(agentId: string): Promise<AuditAgentStats>;
    exportRows(filter: AuditQuery): Promise<AuditLogWithAgent[]>;
    getRecentByAgent(agentId: string, limit: number): Promise<AuditLogEntry[]>;
    getAgentCost7d(agentId: string): Promise<number>;
    getAgentErrorAndLatency(agentId: string): Promise<{ totalRuns: number; errorCount: number; avgLatencyMs: number; costUsd7d: number }>;
    getAgentApprovalDenyRate(agentId: string): Promise<{ denied: number; total: number }>;
}
