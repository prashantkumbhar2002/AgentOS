import type { FastifyInstance } from 'fastify';
import {
  CreateApprovalSchema,
  ApprovalDecisionSchema,
  ApprovalQuerySchema,
  ApprovalIdParamsSchema,
} from './approvals.schema.js';
import { authenticate, requireRole } from '../../plugins/auth.js';
import {
  createTicket,
  getTicket,
  resolveTicket,
  listTickets,
} from './approvals.service.js';
import { evaluatePolicy } from '../policies/policies.evaluator.js';
import { getRiskLabel } from '../../utils/risk-label.js';

export default async function approvalRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // POST / — create approval ticket
  fastify.post(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = CreateApprovalSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const agent = await fastify.prisma.agent.findUnique({
        where: { id: parsed.data.agentId },
      });
      if (!agent) {
        return reply.status(400).send({ error: 'Agent not found' });
      }

      const { label: riskTier } = getRiskLabel(parsed.data.riskScore);
      const policy = await evaluatePolicy(
        fastify.prisma,
        parsed.data.agentId,
        parsed.data.actionType,
        riskTier,
      );

      if (policy.effect === 'ALLOW') {
        return reply.status(200).send({ status: 'AUTO_APPROVED' });
      }

      if (policy.effect === 'DENY') {
        return reply.status(403).send({
          error: 'Action blocked by policy',
          policyName: policy.matchedPolicy?.name ?? 'Unknown',
          reason: policy.reason,
        });
      }

      const ticket = await createTicket(fastify.prisma, parsed.data);

      if (fastify.notificationQueue) {
        await fastify.notificationQueue.add('slack-approval-notification', {
          ticketId: ticket.id,
        });
      }

      fastify.sse.broadcast({
        type: 'approval.requested',
        payload: {
          ticketId: ticket.id,
          agentId: ticket.agentId,
          actionType: ticket.actionType,
          riskScore: ticket.riskScore,
        },
      });

      return reply.status(201).send({
        ticketId: ticket.id,
        status: 'PENDING',
        expiresAt: ticket.expiresAt,
      });
    },
  );

  // GET / — list tickets with filters
  fastify.get(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = ApprovalQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const result = await listTickets(fastify.prisma, parsed.data);
      return reply.status(200).send(result);
    },
  );

  // GET /:id — poll single ticket
  fastify.get(
    '/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsParsed = ApprovalIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const ticket = await getTicket(fastify.prisma, paramsParsed.data.id);
      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      return reply.status(200).send(ticket);
    },
  );

  // PATCH /:id/decide — resolve ticket
  fastify.patch(
    '/:id/decide',
    { preHandler: [requireRole(['admin', 'approver'])] },
    async (request, reply) => {
      const paramsParsed = ApprovalIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const bodyParsed = ApprovalDecisionSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: bodyParsed.error.issues,
        });
      }

      try {
        const result = await resolveTicket(
          fastify.prisma,
          paramsParsed.data.id,
          request.user.id,
          bodyParsed.data.decision,
          bodyParsed.data.comment,
        );

        if (!result) {
          return reply.status(404).send({ error: 'Ticket not found' });
        }

        fastify.sse.broadcast({
          type: 'approval.resolved',
          payload: {
            ticketId: result.id,
            decision: result.status,
            resolvedBy: result.resolvedBy?.name,
            agentId: result.agentId,
          },
        });

        if (result.slackMsgTs && fastify.notificationQueue) {
          await fastify.notificationQueue.add('slack-approval-update', {
            ticketId: result.id,
            decision: result.status,
            resolverName: result.resolvedBy?.name ?? 'Unknown',
          });
        }

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          resolvedBy: result.resolvedBy
            ? { name: result.resolvedBy.name, email: result.resolvedBy.email }
            : null,
          resolvedAt: result.resolvedAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Ticket expired' || message === 'Ticket already resolved') {
          return reply.status(400).send({ error: message });
        }
        throw err;
      }
    },
  );
}
