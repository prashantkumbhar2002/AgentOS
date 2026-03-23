import type { CreateAgentInput, UpdateAgentInput, AgentListQuery, AgentStatus } from '@agentos/types';
import type { IAgentRepository } from '../../repositories/interfaces/IAgentRepository.js';
import type { IAuditRepository } from '../../repositories/interfaces/IAuditRepository.js';
import type { IApprovalRepository } from '../../repositories/interfaces/IApprovalRepository.js';
import type { IPolicyRepository } from '../../repositories/interfaces/IPolicyRepository.js';
import type { AgentDetail, AgentDetailView, AgentSummary, AgentStats, PaginatedResult } from '../../types/dto.js';
import { calculateHealthScore } from '../../utils/health-score.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['APPROVED', 'DEPRECATED'],
    PENDING_APPROVAL: ['APPROVED', 'DEPRECATED'],
    APPROVED: ['ACTIVE', 'DEPRECATED'],
    ACTIVE: ['SUSPENDED', 'DEPRECATED'],
    SUSPENDED: ['ACTIVE', 'DEPRECATED'],
    DEPRECATED: [],
};

export function validateStatusTransition(currentStatus: string, newStatus: string): { valid: boolean; message?: string } {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
        if (currentStatus === 'DEPRECATED') {
            return {
                valid: false,
                message: 'DEPRECATED is a terminal state. No further transitions are allowed.',
            };
        }
        const hint =
            currentStatus === 'DRAFT' && newStatus === 'ACTIVE'
                ? ' Agent must be APPROVED first.'
                : '';
        return {
            valid: false,
            message: `Invalid transition: ${currentStatus} → ${newStatus}.${hint}`,
        };
    }
    return { valid: true };
}

export class AgentService {
    constructor(
        private readonly agentRepo: IAgentRepository,
        private readonly auditRepo: IAuditRepository,
        private readonly approvalRepo: IApprovalRepository,
        private readonly policyRepo: IPolicyRepository,
    ) { }

    async createAgent(data: CreateAgentInput): Promise<AgentDetail> {
        return this.agentRepo.create(data);
    }

    async listAgents(query: AgentListQuery): Promise<PaginatedResult<AgentSummary>> {
        return this.agentRepo.findMany(query);
    }

    async getAgentById(id: string): Promise<AgentDetailView | null> {
        const agent = await this.agentRepo.findById(id);
        if (!agent) return null;

        const [stats, recentLogs, pendingApprovals, policies] = await Promise.all([
            this.computeAgentStats(id),
            this.auditRepo.getRecentByAgent(id, 10),
            this.approvalRepo.getPendingByAgent(id),
            this.policyRepo.getAgentPoliciesWithRules(id),
        ]);

        return {
            ...agent,
            stats,
            recentLogs,
            pendingApprovals,
            policies: policies.map((p) => ({
                id: p.id,
                name: p.name,
                description: '',
                isActive: p.isActive,
                createdAt: new Date(),
                rules: p.rules,
            })),
        };
    }

    async computeAgentStats(agentId: string): Promise<AgentStats> {
        const [metrics, approvalRates] = await Promise.all([
            this.auditRepo.getAgentErrorAndLatency(agentId),
            this.auditRepo.getAgentApprovalDenyRate(agentId),
        ]);

        const errorRate = metrics.totalRuns > 0 ? metrics.errorCount / metrics.totalRuns : 0;
        const approvalDenyRate = approvalRates.total > 0 ? approvalRates.denied / approvalRates.total : 0;

        const healthScore = calculateHealthScore(errorRate, approvalDenyRate, metrics.avgLatencyMs);

        return {
            totalRuns: metrics.totalRuns,
            totalCost7dUsd: metrics.costUsd7d,
            avgLatencyMs: metrics.avgLatencyMs,
            errorRate,
            healthScore,
        };
    }

    async updateAgent(id: string, data: UpdateAgentInput): Promise<AgentDetail | null> {
        return this.agentRepo.update(id, data);
    }

    async updateAgentStatus(
        id: string,
        newStatus: AgentStatus,
        userId: string,
    ): Promise<{ agent: AgentDetail; oldStatus: string } | null> {
        const existing = await this.agentRepo.findById(id);
        if (!existing) return null;

        const oldStatus = existing.status;
        const approvedBy = newStatus === 'APPROVED' ? userId : undefined;

        const agent = await this.agentRepo.updateStatus(id, newStatus, approvedBy);
        if (!agent) return null;

        return { agent, oldStatus };
    }
}
