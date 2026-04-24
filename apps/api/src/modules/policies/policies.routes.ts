import type { FastifyInstance } from 'fastify';
import {
    CreatePolicySchema,
    UpdatePolicySchema,
    PolicyIdParamsSchema,
    PolicyListQuerySchema,
    PolicyAssignSchema,
    PolicyUnassignParamsSchema,
    PolicyEvaluationRequestSchema,
    PolicyCheckRequestSchema,
} from './policies.schema.js';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { getRiskLabel } from '../../utils/risk-label.js';
import { NotFoundError, ValidationError, ConflictError } from '../../errors/index.js';

export default async function policyRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { policyService, policyEvaluator } = fastify.services;

    fastify.post(
        '/evaluate',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = PolicyEvaluationRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            try {
                const result = await policyEvaluator.evaluate(
                    parsed.data.agentId,
                    parsed.data.actionType,
                    parsed.data.riskTier,
                    parsed.data.context ?? {},
                );
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Agent not found') {
                    throw new NotFoundError('Agent', parsed.data.agentId);
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/check',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = PolicyCheckRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const { label: riskTier } = getRiskLabel(parsed.data.riskScore);

            try {
                const result = await policyEvaluator.evaluate(
                    parsed.data.agentId,
                    parsed.data.actionType,
                    riskTier,
                    parsed.data.context ?? {},
                );
                return reply.status(200).send({
                    effect: result.effect,
                    reason: result.reason,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Agent not found') {
                    throw new NotFoundError('Agent', parsed.data.agentId);
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const parsed = CreatePolicySchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            try {
                const policy = await policyService.createPolicy(parsed.data);
                return reply.status(201).send(policy);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Policy name already exists') {
                    throw new ConflictError(message);
                }
                throw err;
            }
        },
    );

    fastify.get(
        '/',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = PolicyListQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const result = await policyService.listPolicies(parsed.data);
            return reply.status(200).send(result);
        },
    );

    fastify.get(
        '/:id',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const paramsParsed = PolicyIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const policy = await policyService.getPolicyById(paramsParsed.data.id);
            if (!policy) {
                throw new NotFoundError('Policy', paramsParsed.data.id);
            }

            return reply.status(200).send(policy);
        },
    );

    fastify.patch(
        '/:id',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const paramsParsed = PolicyIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const bodyParsed = UpdatePolicySchema.safeParse(request.body);
            if (!bodyParsed.success) {
                throw new ValidationError('Validation failed', { issues: bodyParsed.error.issues });
            }

            try {
                const updated = await policyService.updatePolicy(
                    paramsParsed.data.id,
                    bodyParsed.data,
                );
                if (!updated) {
                    throw new NotFoundError('Policy', paramsParsed.data.id);
                }
                return reply.status(200).send(updated);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Policy name already exists') {
                    throw new ConflictError(message);
                }
                throw err;
            }
        },
    );

    fastify.delete(
        '/:id',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const paramsParsed = PolicyIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            try {
                const result = await policyService.deletePolicy(paramsParsed.data.id);
                if (!result) {
                    throw new NotFoundError('Policy', paramsParsed.data.id);
                }
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message.startsWith('Cannot delete policy')) {
                    throw new ConflictError(message);
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/:id/assign',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const paramsParsed = PolicyIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const bodyParsed = PolicyAssignSchema.safeParse(request.body);
            if (!bodyParsed.success) {
                throw new ValidationError('Validation failed', { issues: bodyParsed.error.issues });
            }

            try {
                const result = await policyService.assignToAgent(
                    paramsParsed.data.id,
                    bodyParsed.data.agentId,
                );
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Policy not found') {
                    throw new NotFoundError('Policy', paramsParsed.data.id);
                }
                if (message === 'Agent not found') {
                    throw new NotFoundError('Agent', bodyParsed.data.agentId);
                }
                if (message === 'Policy already assigned to this agent') {
                    throw new ConflictError(message);
                }
                throw err;
            }
        },
    );

    fastify.delete(
        '/:id/assign/:agentId',
        { preHandler: [requireRole('admin')] },
        async (request, reply) => {
            const paramsParsed = PolicyUnassignParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            try {
                const result = await policyService.unassignFromAgent(
                    paramsParsed.data.id,
                    paramsParsed.data.agentId,
                );
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Assignment not found') {
                    throw new NotFoundError('Assignment', `${paramsParsed.data.id}:${paramsParsed.data.agentId}`);
                }
                throw err;
            }
        },
    );
}
