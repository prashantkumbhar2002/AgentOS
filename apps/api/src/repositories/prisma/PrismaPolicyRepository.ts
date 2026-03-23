import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { CreatePolicyInput, UpdatePolicyInput, PolicyListQuery } from '@agentos/types';
import type { IPolicyRepository } from '../interfaces/IPolicyRepository.js';
import type { PolicyDetail, PolicyWithRules, PaginatedResult } from '../../types/dto.js';

export class PrismaPolicyRepository implements IPolicyRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(data: CreatePolicyInput): Promise<PolicyDetail> {
        const policy = await this.prisma.policy.create({
            data: {
                name: data.name,
                description: data.description,
                rules: {
                    create: data.rules.map((r) => ({
                        actionType: r.actionType,
                        riskTiers: r.riskTiers,
                        effect: r.effect,
                        conditions: r.conditions
                            ? (r.conditions as Prisma.InputJsonValue)
                            : Prisma.JsonNull,
                    })),
                },
            },
            include: { rules: true },
        });
        return this.toDetail(policy);
    }

    async findById(id: string): Promise<PolicyDetail | null> {
        const policy = await this.prisma.policy.findUnique({
            where: { id },
            include: {
                rules: true,
                agents: {
                    include: {
                        agent: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!policy) return null;

        return {
            ...this.toDetail(policy),
            agents: policy.agents.map((a) => ({
                agentId: a.agent.id,
                agentName: a.agent.name,
            })),
        };
    }

    async findMany(filter: PolicyListQuery): Promise<PaginatedResult<PolicyDetail>> {
        const { isActive, page, limit } = filter;

        const where: Record<string, unknown> = {};
        if (isActive !== undefined) where['isActive'] = isActive;

        const [data, total] = await Promise.all([
            this.prisma.policy.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { rules: true },
            }),
            this.prisma.policy.count({ where }),
        ]);

        return {
            data: data.map((p) => this.toDetail(p)),
            total,
            page,
            limit,
        };
    }

    async update(id: string, data: UpdatePolicyInput): Promise<PolicyDetail | null> {
        const existing = await this.prisma.policy.findUnique({ where: { id } });
        if (!existing) return null;

        const policy = await this.prisma.policy.update({
            where: { id },
            data,
            include: { rules: true },
        });
        return this.toDetail(policy);
    }

    async delete(id: string): Promise<void> {
        await this.prisma.policyRule.deleteMany({ where: { policyId: id } });
        await this.prisma.policy.delete({ where: { id } });
    }

    async findByName(name: string): Promise<PolicyDetail | null> {
        const policy = await this.prisma.policy.findUnique({
            where: { name },
            include: { rules: true },
        });
        if (!policy) return null;
        return this.toDetail(policy);
    }

    async getAssignedAgentCount(id: string): Promise<number> {
        const policy = await this.prisma.policy.findUnique({
            where: { id },
            include: { _count: { select: { agents: true } } },
        });
        return policy?._count.agents ?? 0;
    }

    async assignToAgent(policyId: string, agentId: string): Promise<void> {
        await this.prisma.agentPolicy.create({ data: { agentId, policyId } });
    }

    async unassignFromAgent(policyId: string, agentId: string): Promise<void> {
        await this.prisma.agentPolicy.delete({
            where: { agentId_policyId: { agentId, policyId } },
        });
    }

    async findAssignment(policyId: string, agentId: string): Promise<boolean> {
        const existing = await this.prisma.agentPolicy.findUnique({
            where: { agentId_policyId: { agentId, policyId } },
        });
        return !!existing;
    }

    async getAgentPoliciesWithRules(agentId: string): Promise<PolicyWithRules[]> {
        const policies = await this.prisma.policy.findMany({
            where: { agents: { some: { agentId } } },
            include: { rules: true },
        });
        return policies.map((p) => this.toWithRules(p));
    }

    async getGlobalPoliciesWithRules(): Promise<PolicyWithRules[]> {
        const policies = await this.prisma.policy.findMany({
            where: { agents: { none: {} } },
            include: { rules: true },
        });
        return policies.map((p) => this.toWithRules(p));
    }

    private toDetail(policy: any): PolicyDetail {
        return {
            id: policy.id,
            name: policy.name,
            description: policy.description,
            isActive: policy.isActive,
            createdAt: policy.createdAt,
            rules: (policy.rules ?? []).map((r: any) => ({
                id: r.id,
                actionType: r.actionType,
                riskTiers: r.riskTiers,
                effect: r.effect,
                conditions: r.conditions,
            })),
        };
    }

    private toWithRules(policy: any): PolicyWithRules {
        return {
            id: policy.id,
            name: policy.name,
            isActive: policy.isActive,
            rules: (policy.rules ?? []).map((r: any) => ({
                id: r.id,
                actionType: r.actionType,
                riskTiers: r.riskTiers,
                effect: r.effect,
                conditions: r.conditions,
            })),
        };
    }
}
