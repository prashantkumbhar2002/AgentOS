import type { PrismaClient } from '@prisma/client';
import type { ApprovalQuery } from '@agentos/types';
import type { IApprovalRepository, CreateApprovalInput } from '../interfaces/IApprovalRepository.js';
import type {
    ApprovalTicketSummary,
    ApprovalTicketDetail,
    ApprovalListResult,
    ResolveTicketInput,
} from '../../types/dto.js';

export class PrismaApprovalRepository implements IApprovalRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(data: CreateApprovalInput): Promise<ApprovalTicketDetail> {
        const ticket = await this.prisma.approvalTicket.create({
            data: {
                agentId: data.agentId,
                actionType: data.actionType,
                payload: data.payload ?? {},
                riskScore: data.riskScore,
                reasoning: data.reasoning,
                expiresAt: data.expiresAt,
            },
            include: {
                agent: { select: { name: true } },
            },
        });

        return {
            id: ticket.id,
            agentId: ticket.agentId,
            agentName: ticket.agent.name,
            actionType: ticket.actionType,
            payload: ticket.payload,
            riskScore: ticket.riskScore,
            reasoning: ticket.reasoning,
            status: ticket.status,
            resolvedById: ticket.resolvedById,
            resolvedByName: null,
            resolvedAt: ticket.resolvedAt,
            expiresAt: ticket.expiresAt,
            slackMsgTs: ticket.slackMsgTs,
            createdAt: ticket.createdAt,
        };
    }

    async createMany(data: CreateApprovalInput[]): Promise<number> {
        const result = await this.prisma.approvalTicket.createMany({
            data: data.map((d) => ({
                agentId: d.agentId,
                actionType: d.actionType,
                payload: d.payload ?? {},
                riskScore: d.riskScore,
                reasoning: d.reasoning,
                expiresAt: d.expiresAt,
                ...(d.status ? { status: d.status as any } : {}),
                ...(d.resolvedById ? { resolvedById: d.resolvedById } : {}),
                ...(d.resolvedAt ? { resolvedAt: d.resolvedAt } : {}),
            })),
        });
        return result.count;
    }

    async countByAgents(agentIds: string[]): Promise<number> {
        return this.prisma.approvalTicket.count({
            where: { agentId: { in: agentIds } },
        });
    }

    async findById(id: string): Promise<ApprovalTicketDetail | null> {
        const ticket = await this.prisma.approvalTicket.findUnique({
            where: { id },
            include: {
                agent: { select: { name: true } },
                resolvedBy: { select: { name: true, email: true } },
            },
        });

        if (!ticket) return null;

        return {
            id: ticket.id,
            agentId: ticket.agentId,
            agentName: ticket.agent.name,
            actionType: ticket.actionType,
            payload: ticket.payload,
            riskScore: ticket.riskScore,
            reasoning: ticket.reasoning,
            status: ticket.status,
            resolvedById: ticket.resolvedById,
            resolvedByName: ticket.resolvedBy?.name ?? null,
            resolvedAt: ticket.resolvedAt,
            expiresAt: ticket.expiresAt,
            slackMsgTs: ticket.slackMsgTs,
            createdAt: ticket.createdAt,
            resolverEmail: ticket.resolvedBy?.email,
        };
    }

    async findMany(filter: ApprovalQuery): Promise<ApprovalListResult> {
        const { status, agentId, page, limit } = filter;

        const where: Record<string, unknown> = {};
        if (status) where['status'] = status;
        if (agentId) where['agentId'] = agentId;

        const [data, total, pendingCount] = await Promise.all([
            this.prisma.approvalTicket.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { expiresAt: 'asc' },
                include: {
                    agent: { select: { name: true } },
                    resolvedBy: { select: { name: true } },
                },
            }),
            this.prisma.approvalTicket.count({ where }),
            this.prisma.approvalTicket.count({ where: { status: 'PENDING' } }),
        ]);

        const mapped: ApprovalTicketSummary[] = data.map((t) => ({
            id: t.id,
            agentId: t.agentId,
            agentName: t.agent.name,
            actionType: t.actionType,
            payload: t.payload,
            riskScore: t.riskScore,
            reasoning: t.reasoning,
            status: t.status,
            resolvedById: t.resolvedById,
            resolvedByName: t.resolvedBy?.name ?? null,
            resolvedAt: t.resolvedAt,
            expiresAt: t.expiresAt,
            slackMsgTs: t.slackMsgTs,
            createdAt: t.createdAt,
        }));

        return { data: mapped, total, pendingCount, page, limit };
    }

    async resolve(id: string, data: ResolveTicketInput): Promise<ApprovalTicketDetail> {
        const updated = await this.prisma.approvalTicket.update({
            where: { id, status: 'PENDING' },
            data: {
                status: data.status,
                resolvedById: data.resolvedById,
                resolvedAt: data.resolvedAt,
                ...(data.reasoning ? { reasoning: data.reasoning } : {}),
            },
            include: {
                agent: { select: { name: true } },
                resolvedBy: { select: { name: true, email: true } },
            },
        });

        return {
            id: updated.id,
            agentId: updated.agentId,
            agentName: updated.agent.name,
            actionType: updated.actionType,
            payload: updated.payload,
            riskScore: updated.riskScore,
            reasoning: updated.reasoning,
            status: updated.status,
            resolvedById: updated.resolvedById,
            resolvedByName: updated.resolvedBy?.name ?? null,
            resolvedAt: updated.resolvedAt,
            expiresAt: updated.expiresAt,
            slackMsgTs: updated.slackMsgTs,
            createdAt: updated.createdAt,
            resolverEmail: updated.resolvedBy?.email,
        };
    }

    async findRawById(id: string): Promise<{ id: string; status: string; expiresAt: Date; reasoning: string } | null> {
        const ticket = await this.prisma.approvalTicket.findUnique({
            where: { id },
            select: { id: true, status: true, expiresAt: true, reasoning: true },
        });
        return ticket;
    }

    async expireStale(before: Date): Promise<number> {
        const result = await this.prisma.approvalTicket.updateMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: before },
            },
            data: { status: 'EXPIRED' },
        });
        return result.count;
    }

    async updateSlackMsgTs(id: string, ts: string): Promise<void> {
        await this.prisma.approvalTicket.update({
            where: { id },
            data: { slackMsgTs: ts },
        });
    }

    async getPendingCount(): Promise<number> {
        return this.prisma.approvalTicket.count({ where: { status: 'PENDING' } });
    }

    async getPendingByAgent(agentId: string): Promise<ApprovalTicketSummary[]> {
        const tickets = await this.prisma.approvalTicket.findMany({
            where: { agentId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            include: {
                agent: { select: { name: true } },
                resolvedBy: { select: { name: true } },
            },
        });

        return tickets.map((t) => ({
            id: t.id,
            agentId: t.agentId,
            agentName: t.agent.name,
            actionType: t.actionType,
            payload: t.payload,
            riskScore: t.riskScore,
            reasoning: t.reasoning,
            status: t.status,
            resolvedById: t.resolvedById,
            resolvedByName: t.resolvedBy?.name ?? null,
            resolvedAt: t.resolvedAt,
            expiresAt: t.expiresAt,
            slackMsgTs: t.slackMsgTs,
            createdAt: t.createdAt,
        }));
    }
}
