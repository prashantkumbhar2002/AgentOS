import type { CreatePolicyInput, UpdatePolicyInput, PolicyListQuery } from '@agentos/types';
import type { PolicyDetail, PolicyWithRules, PaginatedResult } from '../../types/dto.js';

export interface IPolicyRepository {
    create(data: CreatePolicyInput): Promise<PolicyDetail>;
    findById(id: string): Promise<PolicyDetail | null>;
    findMany(filter: PolicyListQuery): Promise<PaginatedResult<PolicyDetail>>;
    update(id: string, data: UpdatePolicyInput): Promise<PolicyDetail | null>;
    delete(id: string): Promise<void>;
    findByName(name: string): Promise<PolicyDetail | null>;
    getAssignedAgentCount(id: string): Promise<number>;
    assignToAgent(policyId: string, agentId: string): Promise<void>;
    unassignFromAgent(policyId: string, agentId: string): Promise<void>;
    findAssignment(policyId: string, agentId: string): Promise<boolean>;
    getAgentPoliciesWithRules(agentId: string): Promise<PolicyWithRules[]>;
    getGlobalPoliciesWithRules(): Promise<PolicyWithRules[]>;
}
