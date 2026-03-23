import type { ApprovalQuery } from '@agentos/types';
import type { ApprovalTicketSummary, ApprovalTicketDetail, ApprovalListResult, ResolveTicketInput } from '../../types/dto.js';

export interface CreateApprovalInput {
    agentId: string;
    actionType: string;
    payload: unknown;
    riskScore: number;
    reasoning: string;
    expiresAt: Date;
    status?: string;
    resolvedById?: string;
    resolvedAt?: Date;
}

export interface IApprovalRepository {
    create(data: CreateApprovalInput): Promise<ApprovalTicketDetail>;
    createMany(data: CreateApprovalInput[]): Promise<number>;
    countByAgents(agentIds: string[]): Promise<number>;
    findById(id: string): Promise<ApprovalTicketDetail | null>;
    findMany(filter: ApprovalQuery): Promise<ApprovalListResult>;
    resolve(id: string, data: ResolveTicketInput): Promise<ApprovalTicketDetail>;
    findRawById(id: string): Promise<{ id: string; status: string; expiresAt: Date; reasoning: string } | null>;
    expireStale(before: Date): Promise<number>;
    updateSlackMsgTs(id: string, ts: string): Promise<void>;
    getPendingCount(): Promise<number>;
    getPendingByAgent(agentId: string): Promise<ApprovalTicketSummary[]>;
}
