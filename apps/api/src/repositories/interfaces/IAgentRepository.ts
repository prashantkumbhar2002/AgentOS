import type { CreateAgentInput, UpdateAgentInput, AgentListQuery } from '@agentos/types';
import type { AgentDetail, AgentSummary, PaginatedResult } from '../../types/dto.js';

export interface IAgentRepository {
    findById(id: string): Promise<AgentDetail | null>;
    findMany(filter: AgentListQuery): Promise<PaginatedResult<AgentSummary>>;
    create(data: CreateAgentInput): Promise<AgentDetail>;
    update(id: string, data: UpdateAgentInput): Promise<AgentDetail | null>;
    updateStatus(id: string, status: string, approvedBy?: string): Promise<AgentDetail | null>;
    exists(id: string): Promise<boolean>;
    updateLastActiveAt(id: string): Promise<void>;
    findNameById(id: string): Promise<string | null>;
}
