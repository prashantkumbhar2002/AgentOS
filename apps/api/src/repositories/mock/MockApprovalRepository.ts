import { randomUUID } from 'node:crypto';
import type { ApprovalQuery } from '@agentos/types';
import type { IApprovalRepository } from '../interfaces/IApprovalRepository.js';
import type {
    ApprovalTicketSummary,
    ApprovalTicketDetail,
    ApprovalListResult,
    ResolveTicketInput,
} from '../../types/dto.js';

export class MockApprovalRepository implements IApprovalRepository {
    readonly store = new Map<string, ApprovalTicketDetail>();

    async create(data: {
        agentId: string;
        actionType: string;
        payload: unknown;
        riskScore: number;
        reasoning: string;
        expiresAt: Date;
    }): Promise<ApprovalTicketDetail> {
        const ticket: ApprovalTicketDetail = {
            id: randomUUID(),
            agentId: data.agentId,
            agentName: 'Test Agent',
            actionType: data.actionType,
            payload: data.payload,
            riskScore: data.riskScore,
            reasoning: data.reasoning,
            status: 'PENDING',
            resolvedById: null,
            resolvedByName: null,
            resolvedAt: null,
            expiresAt: data.expiresAt,
            slackMsgTs: null,
            createdAt: new Date(),
        };
        this.store.set(ticket.id, ticket);
        return ticket;
    }

    async findById(id: string): Promise<ApprovalTicketDetail | null> {
        return this.store.get(id) ?? null;
    }

    async findMany(filter: ApprovalQuery): Promise<ApprovalListResult> {
        let tickets = [...this.store.values()];
        if (filter.status) tickets = tickets.filter((t) => t.status === filter.status);
        if (filter.agentId) tickets = tickets.filter((t) => t.agentId === filter.agentId);

        const total = tickets.length;
        const start = (filter.page - 1) * filter.limit;
        const page = tickets.slice(start, start + filter.limit);
        const pendingCount = [...this.store.values()].filter((t) => t.status === 'PENDING').length;

        return { data: page, total, pendingCount, page: filter.page, limit: filter.limit };
    }

    async resolve(id: string, data: ResolveTicketInput): Promise<ApprovalTicketDetail> {
        const ticket = this.store.get(id);
        if (!ticket) throw new Error('Ticket not found');

        const updated: ApprovalTicketDetail = {
            ...ticket,
            status: data.status,
            resolvedById: data.resolvedById,
            resolvedByName: 'Resolver',
            resolvedAt: data.resolvedAt,
            reasoning: data.reasoning ?? ticket.reasoning,
        };
        this.store.set(id, updated);
        return updated;
    }

    async findRawById(id: string): Promise<{ id: string; status: string; expiresAt: Date; reasoning: string } | null> {
        const ticket = this.store.get(id);
        if (!ticket) return null;
        return { id: ticket.id, status: ticket.status, expiresAt: ticket.expiresAt, reasoning: ticket.reasoning };
    }

    async expireStale(before: Date): Promise<number> {
        let count = 0;
        for (const [id, ticket] of this.store) {
            if (ticket.status === 'PENDING' && ticket.expiresAt < before) {
                this.store.set(id, { ...ticket, status: 'EXPIRED' });
                count++;
            }
        }
        return count;
    }

    async updateSlackMsgTs(id: string, ts: string): Promise<void> {
        const ticket = this.store.get(id);
        if (ticket) {
            this.store.set(id, { ...ticket, slackMsgTs: ts });
        }
    }

    async getPendingCount(): Promise<number> {
        return [...this.store.values()].filter((t) => t.status === 'PENDING').length;
    }

    async getPendingByAgent(agentId: string): Promise<ApprovalTicketSummary[]> {
        return [...this.store.values()].filter(
            (t) => t.agentId === agentId && t.status === 'PENDING',
        );
    }
}
