import type { CreatePolicyInput, UpdatePolicyInput, PolicyListQuery } from '@agentos/types';
import type { IPolicyRepository } from '../../repositories/interfaces/IPolicyRepository.js';
import type { IAgentRepository } from '../../repositories/interfaces/IAgentRepository.js';
import type { PolicyDetail, PaginatedResult } from '../../types/dto.js';

export class PolicyService {
    constructor(
        private readonly policyRepo: IPolicyRepository,
        private readonly agentRepo: IAgentRepository,
    ) { }

    async createPolicy(data: CreatePolicyInput): Promise<PolicyDetail> {
        const existing = await this.policyRepo.findByName(data.name);
        if (existing) {
            throw new Error('Policy name already exists');
        }
        return this.policyRepo.create(data);
    }

    async listPolicies(query: PolicyListQuery): Promise<PaginatedResult<PolicyDetail>> {
        return this.policyRepo.findMany(query);
    }

    async getPolicyById(id: string): Promise<PolicyDetail | null> {
        return this.policyRepo.findById(id);
    }

    async updatePolicy(id: string, data: UpdatePolicyInput): Promise<PolicyDetail | null> {
        const existing = await this.policyRepo.findById(id);
        if (!existing) return null;

        if (data.name && data.name !== existing.name) {
            const nameConflict = await this.policyRepo.findByName(data.name);
            if (nameConflict) {
                throw new Error('Policy name already exists');
            }
        }

        return this.policyRepo.update(id, data);
    }

    async deletePolicy(id: string): Promise<{ id: string; deleted: boolean } | null> {
        const existing = await this.policyRepo.findById(id);
        if (!existing) return null;

        const assignedCount = await this.policyRepo.getAssignedAgentCount(id);
        if (assignedCount > 0) {
            throw new Error(
                `Cannot delete policy assigned to ${assignedCount} agents. Unassign first.`,
            );
        }

        await this.policyRepo.delete(id);
        return { id, deleted: true };
    }

    async assignToAgent(
        policyId: string,
        agentId: string,
    ): Promise<{ policyId: string; agentId: string; assigned: boolean }> {
        const policyExists = await this.policyRepo.findById(policyId);
        if (!policyExists) throw new Error('Policy not found');

        const agentExists = await this.agentRepo.exists(agentId);
        if (!agentExists) throw new Error('Agent not found');

        const alreadyAssigned = await this.policyRepo.findAssignment(policyId, agentId);
        if (alreadyAssigned) throw new Error('Policy already assigned to this agent');

        await this.policyRepo.assignToAgent(policyId, agentId);
        return { policyId, agentId, assigned: true };
    }

    async unassignFromAgent(
        policyId: string,
        agentId: string,
    ): Promise<{ policyId: string; agentId: string; unassigned: boolean }> {
        const exists = await this.policyRepo.findAssignment(policyId, agentId);
        if (!exists) throw new Error('Assignment not found');

        await this.policyRepo.unassignFromAgent(policyId, agentId);
        return { policyId, agentId, unassigned: true };
    }
}
