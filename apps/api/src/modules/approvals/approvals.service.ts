import type { CreateApprovalInput, ApprovalQuery } from '@agentos/types';
import type { IApprovalRepository } from '../../repositories/interfaces/IApprovalRepository.js';
import type {
    ApprovalTicketDetail,
    ApprovalListResult,
} from '../../types/dto.js';

const EXPIRATION_MINUTES = 30;

export class ApprovalService {
    constructor(
        private readonly approvalRepo: IApprovalRepository,
    ) { }

    async createTicket(data: CreateApprovalInput): Promise<ApprovalTicketDetail> {
        const expiresAt = new Date(Date.now() + EXPIRATION_MINUTES * 60 * 1000);

        return this.approvalRepo.create({
            agentId: data.agentId,
            actionType: data.actionType,
            payload: data.payload ?? {},
            riskScore: data.riskScore,
            reasoning: data.reasoning,
            expiresAt,
        });
    }

    async getTicket(ticketId: string): Promise<ApprovalTicketDetail | null> {
        return this.approvalRepo.findById(ticketId);
    }

    async resolveTicket(
        ticketId: string,
        userId: string,
        decision: 'APPROVED' | 'DENIED',
        comment?: string,
    ): Promise<ApprovalTicketDetail | null> {
        const ticket = await this.approvalRepo.findRawById(ticketId);
        if (!ticket) return null;

        if (ticket.status !== 'PENDING') {
            throw new Error('Ticket already resolved');
        }

        if (ticket.expiresAt < new Date()) {
            throw new Error('Ticket expired');
        }

        const reasoning = comment
            ? `${ticket.reasoning}\n\nDecision comment: ${comment}`
            : undefined;

        return this.approvalRepo.resolve(ticketId, {
            status: decision,
            resolvedById: userId,
            resolvedAt: new Date(),
            reasoning,
        });
    }

    async listTickets(query: ApprovalQuery): Promise<ApprovalListResult> {
        return this.approvalRepo.findMany(query);
    }

    async expirePendingTickets(): Promise<number> {
        return this.approvalRepo.expireStale(new Date());
    }
}
