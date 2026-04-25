import type { CreateAgentInput, UpdateAgentInput, AgentListQuery } from '@agentos/types';
import type { AgentDetail, AgentSummary, PaginatedResult } from '../../types/dto.js';

export interface AgentApiPrincipal {
    id: string;
    name: string;
    status: string;
}

/** Slim agent record for hot-path validation (audit ingest). */
export interface AgentBatchInfo {
    id: string;
    status: string;
    budgetUsd: number | null;
}

export interface IAgentRepository {
    findById(id: string): Promise<AgentDetail | null>;
    findMany(filter: AgentListQuery): Promise<PaginatedResult<AgentSummary>>;
    findByName(name: string): Promise<AgentDetail | null>;
    create(data: CreateAgentInput): Promise<AgentDetail>;
    update(id: string, data: UpdateAgentInput): Promise<AgentDetail | null>;
    updateStatus(id: string, status: string, approvedBy?: string): Promise<AgentDetail | null>;
    exists(id: string): Promise<boolean>;
    updateLastActiveAt(id: string): Promise<void>;
    findNameById(id: string): Promise<string | null>;
    findByApiKeyHash(hash: string): Promise<AgentApiPrincipal | null>;
    setApiKey(id: string, hash: string, hint: string): Promise<void>;
    /**
     * Single-query batch lookup of agent existence, status, and budget. Used
     * by the audit ingest hot path to avoid N round-trips per flush.
     */
    findInfoByIds(ids: string[]): Promise<AgentBatchInfo[]>;
}
