import type { FastifyInstance } from 'fastify';
import type { AgentStatus } from '@agentos/types';
import {
    CreateAgentSchema,
    UpdateAgentSchema,
    UpdateAgentStatusSchema,
    AgentListQuerySchema,
    AgentIdParamsSchema,
} from './agents.schema.js';
import {
    NotFoundError,
    ValidationError,
    InvalidTransitionError,
    AuthorizationError,
    ConflictError,
} from '../../errors/index.js';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { validateStatusTransition } from './agents.service.js';

export default async function agentsRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { agentService } = fastify.services;

    fastify.post(
        '/',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = CreateAgentSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: parsed.error.issues,
                });
            }

            const agent = await agentService.createAgent(parsed.data);

            fastify.sse.broadcast({
                type: 'agent.registered',
                payload: {
                    agentId: agent.id,
                    name: agent.name,
                    riskTier: agent.riskTier,
                },
            });

            return reply.status(201).send({
                id: agent.id,
                name: agent.name,
                status: agent.status,
                riskTier: agent.riskTier,
                createdAt: agent.createdAt,
            });
        },
    );

    fastify.get(
        '/',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = AgentListQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: parsed.error.issues,
                });
            }

            const result = await agentService.listAgents(parsed.data);
            return reply.status(200).send(result);
        },
    );

    fastify.get(
        '/:id',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: paramsParsed.error.issues,
                });
            }

            const detail = await agentService.getAgentById(paramsParsed.data.id);
            if (!detail) {
                throw new NotFoundError('Agent', paramsParsed.data.id);
            }

            return reply.status(200).send(detail);
        },
    );

    fastify.patch(
        '/:id',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: paramsParsed.error.issues,
                });
            }

            const bodyParsed = UpdateAgentSchema.safeParse(request.body);
            if (!bodyParsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: bodyParsed.error.issues,
                });
            }

            const updated = await agentService.updateAgent(
                paramsParsed.data.id,
                bodyParsed.data,
            );
            if (!updated) {
                throw new NotFoundError('Agent', paramsParsed.data.id);
            }

            return reply.status(200).send(updated);
        },
    );

    fastify.patch(
        '/:id/status',
        { preHandler: [requireRole(['admin', 'approver'])] },
        async (request, reply) => {
            const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: paramsParsed.error.issues,
                });
            }

            const bodyParsed = UpdateAgentStatusSchema.safeParse(request.body);
            if (!bodyParsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: bodyParsed.error.issues,
                });
            }

            const agent = await agentService.getAgentById(paramsParsed.data.id);
            if (!agent) {
                throw new NotFoundError('Agent', paramsParsed.data.id);
            }

            const transition = validateStatusTransition(
                agent.status,
                bodyParsed.data.status,
            );
            if (!transition.valid) {
                throw new InvalidTransitionError(
                    agent.status,
                    bodyParsed.data.status,
                    transition.message,
                );
            }

            const adminOnlyStatuses: AgentStatus[] = ['SUSPENDED', 'DEPRECATED'];
            if (
                adminOnlyStatuses.includes(bodyParsed.data.status) &&
                request.user.role !== 'admin'
            ) {
                throw new AuthorizationError('admin');
            }

            const result = await agentService.updateAgentStatus(
                paramsParsed.data.id,
                bodyParsed.data.status,
                request.user.id,
            );
            if (!result) {
                throw new NotFoundError('Agent', paramsParsed.data.id);
            }

            fastify.sse.broadcast({
                type: 'agent.status_changed',
                payload: {
                    agentId: result.agent.id,
                    oldStatus: result.oldStatus,
                    newStatus: result.agent.status,
                    changedBy: request.user.id,
                },
            });

            return reply.status(200).send({
                id: result.agent.id,
                status: result.agent.status,
                approvedBy: result.agent.approvedBy,
                updatedAt: result.agent.updatedAt,
            });
        },
    );

    fastify.delete(
        '/:id',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', {
                    issues: paramsParsed.error.issues,
                });
            }

            const agent = await agentService.getAgentById(paramsParsed.data.id);
            if (!agent) {
                throw new NotFoundError('Agent', paramsParsed.data.id);
            }

            if (agent.status === 'ACTIVE') {
                throw new ConflictError(
                    'Cannot deprecate an ACTIVE agent. Suspend it first.',
                );
            }

            if (agent.status === 'DEPRECATED') {
                throw new ConflictError('Agent is already deprecated.');
            }

            await agentService.updateAgentStatus(
                paramsParsed.data.id,
                'DEPRECATED' as AgentStatus,
                request.user.id,
            );

            return reply.status(200).send({
                id: agent.id,
                status: 'DEPRECATED',
            });
        },
    );
}
