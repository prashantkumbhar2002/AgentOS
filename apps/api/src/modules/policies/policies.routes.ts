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
import {
  createPolicy,
  listPolicies,
  getPolicyById,
  updatePolicy,
  deletePolicy,
  assignToAgent,
  unassignFromAgent,
} from './policies.service.js';
import { evaluatePolicy } from './policies.evaluator.js';

export default async function policyRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // POST /evaluate — must be registered BEFORE /:id to avoid route conflict
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
        const result = await evaluatePolicy(
          fastify.prisma,
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

  // POST / — create policy
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
        const policy = await createPolicy(fastify.prisma, parsed.data);
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

  // GET / — list policies
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

      const result = await listPolicies(fastify.prisma, parsed.data);
      return reply.status(200).send(result);
    },
  );

  // GET /:id — get single policy
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

      const policy = await getPolicyById(fastify.prisma, paramsParsed.data.id);
      if (!policy) {
        return reply.status(404).send({ error: 'Policy not found' });
      }

      return reply.status(200).send(policy);
    },
  );

  // PATCH /:id — update policy
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
        const updated = await updatePolicy(
          fastify.prisma,
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

  // DELETE /:id — delete policy
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
        const result = await deletePolicy(fastify.prisma, paramsParsed.data.id);
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

  // POST /:id/assign — assign policy to agent
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
        const result = await assignToAgent(
          fastify.prisma,
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

  // DELETE /:id/assign/:agentId — unassign policy from agent
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
        const result = await unassignFromAgent(
          fastify.prisma,
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
