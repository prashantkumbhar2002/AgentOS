import type { FastifyInstance } from 'fastify';
import type { AgentStatus } from '@agentos/types';
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  UpdateAgentStatusSchema,
  AgentListQuerySchema,
  AgentIdParamsSchema,
} from './agents.schema.js';
import { authenticate, requireRole } from '../../plugins/auth.js';
import {
  createAgent,
  listAgents,
  getAgentById,
  updateAgent,
  updateAgentStatus,
  validateStatusTransition,
} from './agents.service.js';

export default async function agentsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // T2.08 — POST / (register agent)
  fastify.post(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = CreateAgentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const agent = await createAgent(fastify.prisma, parsed.data);

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

  // T2.09 — GET / (list agents with filters)
  fastify.get(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = AgentListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const result = await listAgents(fastify.prisma, parsed.data);
      return reply.status(200).send(result);
    },
  );

  // T2.10 — GET /:id (agent detail)
  fastify.get(
    '/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const detail = await getAgentById(fastify.prisma, paramsParsed.data.id);
      if (!detail) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      return reply.status(200).send(detail);
    },
  );

  // T2.11 — PATCH /:id (update metadata)
  fastify.patch(
    '/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const bodyParsed = UpdateAgentSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: bodyParsed.error.issues,
        });
      }

      const updated = await updateAgent(
        fastify.prisma,
        paramsParsed.data.id,
        bodyParsed.data,
      );
      if (!updated) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      return reply.status(200).send(updated);
    },
  );

  // T2.12 — PATCH /:id/status (change lifecycle status)
  fastify.patch(
    '/:id/status',
    { preHandler: [requireRole(['admin', 'approver'])] },
    async (request, reply) => {
      const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const bodyParsed = UpdateAgentStatusSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: bodyParsed.error.issues,
        });
      }

      const agent = await fastify.prisma.agent.findUnique({
        where: { id: paramsParsed.data.id },
      });
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      const transition = validateStatusTransition(
        agent.status,
        bodyParsed.data.status,
      );
      if (!transition.valid) {
        return reply.status(400).send({ error: transition.message });
      }

      const adminOnlyStatuses: AgentStatus[] = ['SUSPENDED', 'DEPRECATED'];
      if (
        adminOnlyStatuses.includes(bodyParsed.data.status) &&
        request.user.role !== 'admin'
      ) {
        return reply.status(403).send({
          error: 'Only admin can set SUSPENDED or DEPRECATED status',
        });
      }

      const result = await updateAgentStatus(
        fastify.prisma,
        paramsParsed.data.id,
        bodyParsed.data.status,
        request.user.id,
      );
      if (!result) {
        return reply.status(404).send({ error: 'Agent not found' });
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

  // T2.13 — DELETE /:id (soft delete)
  fastify.delete(
    '/:id',
    { preHandler: [requireRole('admin')] },
    async (request, reply) => {
      const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const agent = await fastify.prisma.agent.findUnique({
        where: { id: paramsParsed.data.id },
      });
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      if (agent.status === 'ACTIVE') {
        return reply.status(400).send({
          error: 'Cannot deprecate an ACTIVE agent. Suspend it first.',
        });
      }

      if (agent.status === 'DEPRECATED') {
        return reply.status(400).send({
          error: 'Agent is already deprecated.',
        });
      }

      await fastify.prisma.agent.update({
        where: { id: paramsParsed.data.id },
        data: { status: 'DEPRECATED' },
      });

      return reply.status(200).send({
        id: agent.id,
        status: 'DEPRECATED',
      });
    },
  );
}
