import type { PrismaClient, Prisma } from '@prisma/client';
import type { CreateAgentInput, UpdateAgentInput, AgentListQuery } from '@agentos/types';
import type { IAgentRepository } from '../interfaces/IAgentRepository.js';
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

        const data: AgentSummary[] = await Promise.all(
            agents.map(async (agent) => {
                const costAgg = await this.prisma.auditLog.aggregate({
                    where: { agentId: agent.id, createdAt: { gte: sevenDaysAgo } },
                    _sum: { costUsd: true },
                });

                return {
                    id: agent.id,
                    name: agent.name,
                    status: agent.status,
                    riskTier: agent.riskTier,
                    ownerTeam: agent.ownerTeam,
                    environment: agent.environment,
                    lastActiveAt: agent.lastActiveAt,
                    toolCount: agent._count.tools,
                    cost7dUsd: costAgg._sum.costUsd ?? 0,
                };
            }),
        );

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
        }).catch(() => { });
    }

    async findNameById(id: string): Promise<string | null> {
        const agent = await this.prisma.agent.findUnique({
            where: { id },
            select: { name: true },
        });
        return agent?.name ?? null;
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
            createdAt: agent.createdAt,
            updatedAt: agent.updatedAt,
            lastActiveAt: agent.lastActiveAt,
            tools: (agent.tools ?? []).map((t: any) => ({
                id: t.id,
                name: t.name,
                description: t.description,
            })),
        };
    }
}
