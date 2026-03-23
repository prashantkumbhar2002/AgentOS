import { randomUUID } from 'node:crypto';
import type { CreatePolicyInput, UpdatePolicyInput, PolicyListQuery } from '@agentos/types';
import type { IPolicyRepository } from '../interfaces/IPolicyRepository.js';
import type { PolicyDetail, PolicyWithRules, PaginatedResult } from '../../types/dto.js';

export class MockPolicyRepository implements IPolicyRepository {
    readonly store = new Map<string, PolicyDetail>();
    readonly assignments = new Set<string>();

    async create(data: CreatePolicyInput): Promise<PolicyDetail> {
        const policy: PolicyDetail = {
            id: randomUUID(),
            name: data.name,
            description: data.description,
            isActive: true,
            createdAt: new Date(),
            rules: data.rules.map((r) => ({
                id: randomUUID(),
                actionType: r.actionType,
                riskTiers: r.riskTiers as string[],
                effect: r.effect,
                conditions: r.conditions ?? null,
            })),
        };
        this.store.set(policy.id, policy);
        return policy;
    }

    async findById(id: string): Promise<PolicyDetail | null> {
        return this.store.get(id) ?? null;
    }

    async findMany(filter: PolicyListQuery): Promise<PaginatedResult<PolicyDetail>> {
        let policies = [...this.store.values()];
        if (filter.isActive !== undefined) policies = policies.filter((p) => p.isActive === filter.isActive);

        const total = policies.length;
        const start = (filter.page - 1) * filter.limit;
        const page = policies.slice(start, start + filter.limit);

        return { data: page, total, page: filter.page, limit: filter.limit };
    }

    async update(id: string, data: UpdatePolicyInput): Promise<PolicyDetail | null> {
        const existing = this.store.get(id);
        if (!existing) return null;

        const updated: PolicyDetail = {
            ...existing,
            ...(data.name ? { name: data.name } : {}),
            ...(data.description ? { description: data.description } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        };
        this.store.set(id, updated);
        return updated;
    }

    async delete(id: string): Promise<void> {
        this.store.delete(id);
    }

    async findByName(name: string): Promise<PolicyDetail | null> {
        for (const policy of this.store.values()) {
            if (policy.name === name) return policy;
        }
        return null;
    }

    async getAssignedAgentCount(id: string): Promise<number> {
        let count = 0;
        for (const key of this.assignments) {
            if (key.endsWith(`:${id}`)) count++;
        }
        return count;
    }

    async assignToAgent(policyId: string, agentId: string): Promise<void> {
        this.assignments.add(`${agentId}:${policyId}`);
    }

    async unassignFromAgent(policyId: string, agentId: string): Promise<void> {
        this.assignments.delete(`${agentId}:${policyId}`);
    }

    async findAssignment(policyId: string, agentId: string): Promise<boolean> {
        return this.assignments.has(`${agentId}:${policyId}`);
    }

    async getAgentPoliciesWithRules(agentId: string): Promise<PolicyWithRules[]> {
        const result: PolicyWithRules[] = [];
        for (const key of this.assignments) {
            if (key.startsWith(`${agentId}:`)) {
                const policyId = key.split(':')[1]!;
                const policy = this.store.get(policyId);
                if (policy) {
                    result.push({ id: policy.id, name: policy.name, isActive: policy.isActive, rules: policy.rules });
                }
            }
        }
        return result;
    }

    async getGlobalPoliciesWithRules(): Promise<PolicyWithRules[]> {
        const assignedPolicyIds = new Set<string>();
        for (const key of this.assignments) {
            assignedPolicyIds.add(key.split(':')[1]!);
        }

        const result: PolicyWithRules[] = [];
        for (const policy of this.store.values()) {
            if (!assignedPolicyIds.has(policy.id)) {
                result.push({ id: policy.id, name: policy.name, isActive: policy.isActive, rules: policy.rules });
            }
        }
        return result;
    }

    seed(overrides: Partial<PolicyDetail> = {}): PolicyDetail {
        const policy: PolicyDetail = {
            id: randomUUID(),
            name: 'Test Policy',
            description: 'Test',
            isActive: true,
            createdAt: new Date(),
            rules: [],
            ...overrides,
        };
        this.store.set(policy.id, policy);
        return policy;
    }
}
