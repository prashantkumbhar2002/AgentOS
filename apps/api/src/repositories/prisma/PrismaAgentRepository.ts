import type { PrismaClient, Prisma } from '@prisma/client';
import type { CreateAgentInput, UpdateAgentInput, AgentListQuery } from '@agentos/types';
import type { IAgentRepository, AgentApiPrincipal, AgentBatchInfo } from '../interfaces/IAgentRepository.js';
import type { AgentDetail, AgentSummary, PaginatedResult } from '../../types/dto.js';

export class PrismaAgentRepository implements IAgentRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findById(id: string): Promise<AgentDetail | null> {
        const agent = await this.prisma.agent.findUnique({
            where: { id },
            include: { tools: true },
        });
        if (!agent) return null;
        return this.toDetail(agent);
    }

    async findMany(filter: AgentListQuery): Promise<PaginatedResult<AgentSummary>> {
        const { status, riskTier, environment, ownerTeam, search, page, limit } = filter;

        const where: Prisma.AgentWhereInput = {};
        if (status) where.status = status;
        if (riskTier) where.riskTier = riskTier;
        if (environment) where.environment = environment;
        if (ownerTeam) where.ownerTeam = ownerTeam;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [agents, total] = await Promise.all([
            this.prisma.agent.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { tools: true } } },
            }),
            this.prisma.agent.count({ where }),
        ]);

        // PERF: single batched query replaces N+1
        const agentIds = agents.map((a) => a.id);
        const costsByAgent = agentIds.length > 0
            ? await this.prisma.auditLog.groupBy({
                by: ['agentId'],
                where: { agentId: { in: agentIds }, createdAt: { gte: sevenDaysAgo } },
                _sum: { costUsd: true },
            })
            : [];
        const costsMap = new Map(costsByAgent.map((c) => [c.agentId, c._sum.costUsd ?? 0]));

        const data: AgentSummary[] = agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            riskTier: agent.riskTier,
            ownerTeam: agent.ownerTeam,
            environment: agent.environment,
            lastActiveAt: agent.lastActiveAt,
            toolCount: agent._count.tools,
            cost7dUsd: costsMap.get(agent.id) ?? 0,
        }));

        return { data, total, page, limit };
    }

    async findByName(name: string): Promise<AgentDetail | null> {
        const agent = await this.prisma.agent.findFirst({
            where: { name },
            include: { tools: true },
        });
        if (!agent) return null;
        return this.toDetail(agent);
    }

    async create(data: CreateAgentInput): Promise<AgentDetail> {
        const agent = await this.prisma.agent.create({
            data: {
                name: data.name,
                description: data.description,
                ownerTeam: data.ownerTeam,
                llmModel: data.llmModel,
                riskTier: data.riskTier,
                environment: data.environment,
                tags: data.tags ?? [],
                tools: {
                    create: data.tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                    })),
                },
            },
            include: { tools: true },
        });
        return this.toDetail(agent);
    }

    async update(id: string, data: UpdateAgentInput): Promise<AgentDetail | null> {
        const existing = await this.prisma.agent.findUnique({ where: { id } });
        if (!existing) return null;

        const updateData: Prisma.AgentUpdateInput = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.ownerTeam !== undefined) updateData.ownerTeam = data.ownerTeam;
        if (data.llmModel !== undefined) updateData.llmModel = data.llmModel;
        if (data.riskTier !== undefined) updateData.riskTier = data.riskTier;
        if (data.environment !== undefined) updateData.environment = data.environment;
        if (data.tags !== undefined) updateData.tags = data.tags;
        if (data.budgetUsd !== undefined) updateData.budgetUsd = data.budgetUsd;

        if (data.tools !== undefined) {
            await this.prisma.agentTool.deleteMany({ where: { agentId: id } });
            updateData.tools = {
                create: data.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                })),
            };
        }

        const agent = await this.prisma.agent.update({
            where: { id },
            data: updateData,
            include: { tools: true },
        });
        return this.toDetail(agent);
    }

    async updateStatus(id: string, status: string, approvedBy?: string): Promise<AgentDetail | null> {
        const existing = await this.prisma.agent.findUnique({ where: { id } });
        if (!existing) return null;

        const updateData: Prisma.AgentUpdateInput = { status: status as any };
        if (approvedBy) updateData.approvedBy = approvedBy;

        const agent = await this.prisma.agent.update({
            where: { id },
            data: updateData,
            include: { tools: true },
        });
        return this.toDetail(agent);
    }

    async exists(id: string): Promise<boolean> {
        const count = await this.prisma.agent.count({ where: { id } });
        return count > 0;
    }

    async updateLastActiveAt(id: string): Promise<void> {
        await this.prisma.agent.update({
            where: { id },
            data: { lastActiveAt: new Date() },
        }).catch((err: unknown) => {
            console.warn('[PrismaAgentRepository] Failed to update lastActiveAt:', err instanceof Error ? err.message : err);
        });
    }

    async findNameById(id: string): Promise<string | null> {
        const agent = await this.prisma.agent.findUnique({
            where: { id },
            select: { name: true },
        });
        return agent?.name ?? null;
    }

    async findByApiKeyHash(hash: string): Promise<AgentApiPrincipal | null> {
        const agent = await this.prisma.agent.findUnique({
            where: { apiKeyHash: hash },
            select: { id: true, name: true, status: true },
        });
        return agent ? { id: agent.id, name: agent.name, status: agent.status } : null;
    }

    async setApiKey(id: string, hash: string, hint: string): Promise<void> {
        await this.prisma.agent.update({
            where: { id },
            data: { apiKeyHash: hash, apiKeyHint: hint },
        });
    }

    async findInfoByIds(ids: string[]): Promise<AgentBatchInfo[]> {
        if (ids.length === 0) return [];
        const rows = await this.prisma.agent.findMany({
            where: { id: { in: ids } },
            select: { id: true, status: true, budgetUsd: true },
        });
        return rows.map((r) => ({
            id: r.id,
            status: r.status,
            budgetUsd: r.budgetUsd ?? null,
        }));
    }

    private toDetail(agent: any): AgentDetail {
        return {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            ownerTeam: agent.ownerTeam,
            llmModel: agent.llmModel,
            riskTier: agent.riskTier,
            environment: agent.environment,
            status: agent.status,
            approvedBy: agent.approvedBy,
            tags: agent.tags,
            budgetUsd: agent.budgetUsd ?? null,
            createdAt: agent.createdAt,
            updatedAt: agent.updatedAt,
            lastActiveAt: agent.lastActiveAt,
            tools: (agent.tools ?? []).map((t: any) => ({
                id: t.id,
                name: t.name,
                description: t.description,
            })),
            apiKeyHint: agent.apiKeyHint ?? null,
            hasApiKey: Boolean(agent.apiKeyHash),
        };
    }
}
