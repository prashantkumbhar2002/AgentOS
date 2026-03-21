import type { PrismaClient } from '@prisma/client';
import type { CreateApprovalInput, ApprovalQuery } from '@agentos/types';

export type PolicyEffect = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export interface PolicyEvaluation {
  effect: PolicyEffect;
  policyName?: string;
}

/**
 * Stub — always returns REQUIRE_APPROVAL.
 * Replace with real policy engine after EPIC 5.
 */
export async function evaluatePolicy(
  _prisma: PrismaClient,
  _agentId: string,
  _actionType: string,
  _riskScore: number,
): Promise<PolicyEvaluation> {
  return { effect: 'REQUIRE_APPROVAL' };
}

const EXPIRATION_MINUTES = 30;

export async function createTicket(
  prisma: PrismaClient,
  data: CreateApprovalInput,
) {
  const expiresAt = new Date(Date.now() + EXPIRATION_MINUTES * 60 * 1000);

  return prisma.approvalTicket.create({
    data: {
      agentId: data.agentId,
      actionType: data.actionType,
      payload: data.payload ?? {},
      riskScore: data.riskScore,
      reasoning: data.reasoning,
      expiresAt,
    },
    include: {
      agent: { select: { name: true } },
    },
  });
}

export async function getTicket(prisma: PrismaClient, ticketId: string) {
  const ticket = await prisma.approvalTicket.findUnique({
    where: { id: ticketId },
    include: {
      agent: { select: { name: true } },
      resolvedBy: { select: { name: true } },
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
  };
}

export async function resolveTicket(
  prisma: PrismaClient,
  ticketId: string,
  userId: string,
  decision: 'APPROVED' | 'DENIED',
  comment?: string,
) {
  const ticket = await prisma.approvalTicket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) return null;

  if (ticket.status !== 'PENDING') {
    throw new Error('Ticket already resolved');
  }

  if (ticket.expiresAt < new Date()) {
    throw new Error('Ticket expired');
  }

  const updated = await prisma.approvalTicket.update({
    where: { id: ticketId, status: 'PENDING' },
    data: {
      status: decision,
      resolvedById: userId,
      resolvedAt: new Date(),
      ...(comment ? { reasoning: `${ticket.reasoning}\n\nDecision comment: ${comment}` } : {}),
    },
    include: {
      agent: { select: { name: true } },
      resolvedBy: { select: { name: true, email: true } },
    },
  });

  return updated;
}

export async function listTickets(prisma: PrismaClient, query: ApprovalQuery) {
  const { status, agentId, page, limit } = query;

  const where: Record<string, unknown> = {};
  if (status) where['status'] = status;
  if (agentId) where['agentId'] = agentId;

  const [data, total, pendingCount] = await Promise.all([
    prisma.approvalTicket.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { expiresAt: 'asc' },
      include: {
        agent: { select: { name: true } },
        resolvedBy: { select: { name: true } },
      },
    }),
    prisma.approvalTicket.count({ where }),
    prisma.approvalTicket.count({ where: { status: 'PENDING' } }),
  ]);

  const mapped = data.map((t) => ({
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

export async function expirePendingTickets(prisma: PrismaClient) {
  const result = await prisma.approvalTicket.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  return result.count;
}
