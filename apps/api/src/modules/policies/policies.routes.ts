import type { FastifyInstance } from 'fastify';
import {
    CreatePolicySchema,
    UpdatePolicySchema,
    PolicyIdParamsSchema,
    PolicyListQuerySchema,
    PolicyAssignSchema,
    PolicyUnassignParamsSchema,
    PolicyEvaluationRequestSchema,
} from './policies.schema.js';
import { authenticate, requireRole } from '../../plugins/auth.js';

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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: parsed.error.issues,
                });
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
                    return reply.status(404).send({ error: message });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: parsed.error.issues,
                });
            }

            try {
                const policy = await policyService.createPolicy(parsed.data);
                return reply.status(201).send(policy);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Policy name already exists') {
                    return reply.status(400).send({ error: message });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: parsed.error.issues,
                });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: paramsParsed.error.issues,
                });
            }

            const policy = await policyService.getPolicyById(paramsParsed.data.id);
            if (!policy) {
                return reply.status(404).send({ error: 'Policy not found' });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: paramsParsed.error.issues,
                });
            }

            const bodyParsed = UpdatePolicySchema.safeParse(request.body);
            if (!bodyParsed.success) {
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: bodyParsed.error.issues,
                });
            }

            try {
                const updated = await policyService.updatePolicy(
                    paramsParsed.data.id,
                    bodyParsed.data,
                );
                if (!updated) {
                    return reply.status(404).send({ error: 'Policy not found' });
                }
                return reply.status(200).send(updated);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Policy name already exists') {
                    return reply.status(400).send({ error: message });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: paramsParsed.error.issues,
                });
            }

            try {
                const result = await policyService.deletePolicy(paramsParsed.data.id);
                if (!result) {
                    return reply.status(404).send({ error: 'Policy not found' });
                }
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message.startsWith('Cannot delete policy')) {
                    return reply.status(400).send({ error: message });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: paramsParsed.error.issues,
                });
            }

            const bodyParsed = PolicyAssignSchema.safeParse(request.body);
            if (!bodyParsed.success) {
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: bodyParsed.error.issues,
                });
            }

            try {
                const result = await policyService.assignToAgent(
                    paramsParsed.data.id,
                    bodyParsed.data.agentId,
                );
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'Policy not found' || message === 'Agent not found') {
                    return reply.status(404).send({ error: message });
                }
                if (message === 'Policy already assigned to this agent') {
                    return reply.status(400).send({ error: message });
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
                return reply.status(400).send({
                    error: 'Validation failed',
                    details: paramsParsed.error.issues,
                });
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
                    return reply.status(404).send({ error: message });
                }
                throw err;
            }
        },
    );
}
