import type { FastifyInstance } from 'fastify';
import {
    CreateApprovalSchema,
    ApprovalDecisionSchema,
    ApprovalQuerySchema,
    ApprovalIdParamsSchema,
} from './approvals.schema.js';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { getRiskLabel } from '../../utils/risk-label.js';
import { NotFoundError, ValidationError, PolicyBlockedError, ConflictError } from '../../errors/index.js';

export default async function approvalRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { approvalService, policyEvaluator, agentService } = fastify.services;

    fastify.post(
        '/',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = CreateApprovalSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const agentExists = await agentService.getAgentById(parsed.data.agentId);
            if (!agentExists) {
                throw new NotFoundError('Agent', parsed.data.agentId);
            }

            const { label: riskTier } = getRiskLabel(parsed.data.riskScore);
            const policy = await policyEvaluator.evaluate(
                parsed.data.agentId,
                parsed.data.actionType,
                riskTier,
            );

            if (policy.effect === 'ALLOW') {
                return reply.status(200).send({ status: 'AUTO_APPROVED' });
            }

            if (policy.effect === 'DENY') {
                throw new PolicyBlockedError(parsed.data.actionType, policy.matchedPolicy?.name ?? 'Unknown');
            }

            const ticket = await approvalService.createTicket(parsed.data);

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

    fastify.get(
        '/',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = ApprovalQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const result = await approvalService.listTickets(parsed.data);
            return reply.status(200).send(result);
        },
    );

    fastify.get(
        '/:id',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const paramsParsed = ApprovalIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const ticket = await approvalService.getTicket(paramsParsed.data.id);
            if (!ticket) {
                throw new NotFoundError('Ticket', paramsParsed.data.id);
            }

            return reply.status(200).send(ticket);
        },
    );

    fastify.patch(
        '/:id/decide',
        { preHandler: [requireRole(['admin', 'approver'])] },
        async (request, reply) => {
            const paramsParsed = ApprovalIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const bodyParsed = ApprovalDecisionSchema.safeParse(request.body);
            if (!bodyParsed.success) {
                throw new ValidationError('Validation failed', { issues: bodyParsed.error.issues });
            }

            try {
                const result = await approvalService.resolveTicket(
                    paramsParsed.data.id,
                    request.user.id,
                    bodyParsed.data.decision,
                    bodyParsed.data.comment,
                );

                if (!result) {
                    throw new NotFoundError('Ticket', paramsParsed.data.id);
                }

                fastify.sse.broadcast({
                    type: 'approval.resolved',
                    payload: {
                        ticketId: result.id,
                        decision: result.status,
                        resolvedBy: result.resolvedByName,
                        agentId: result.agentId,
                    },
                });

                if (result.slackMsgTs && fastify.notificationQueue) {
                    await fastify.notificationQueue.add('slack-approval-update', {
                        ticketId: result.id,
                        decision: result.status,
                        resolverName: result.resolvedByName ?? 'Unknown',
                    });
                }

                return reply.status(200).send({
                    id: result.id,
                    status: result.status,
                    resolvedBy: result.resolvedByName
                        ? { name: result.resolvedByName, email: result.resolverEmail }
                        : null,
                    resolvedAt: result.resolvedAt,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Ticket expired' || message === 'Ticket already resolved') {
                    throw new ConflictError(message);
                }
                throw err;
            }
        },
    );
}
