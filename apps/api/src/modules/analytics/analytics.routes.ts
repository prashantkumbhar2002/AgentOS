import type { FastifyInstance } from 'fastify';
import {
  DateRangeQuerySchema,
  CostTimelineQuerySchema,
  AgentLeaderboardQuerySchema,
} from './analytics.schema.js';
import { authenticate } from '../../plugins/auth.js';
import {
  getCostSummary,
  getCostTimeline,
  getUsageStats,
  getAgentLeaderboard,
  getModelUsage,
} from './analytics.service.js';

export default async function analyticsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    '/costs/timeline',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = CostTimelineQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const result = await getCostTimeline(
        fastify.prisma,
        parsed.data.days,
        parsed.data.agentId,
      );
      return reply.status(200).send(result);
    },
  );

  fastify.get(
    '/costs',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = DateRangeQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      try {
        const result = await getCostSummary(
          fastify.prisma,
          parsed.data.fromDate,
          parsed.data.toDate,
        );
        return reply.status(200).send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'fromDate must be before toDate') {
          return reply.status(400).send({ error: message });
        }
        throw err;
      }
    },
  );

  fastify.get(
    '/usage',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = DateRangeQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      try {
        const result = await getUsageStats(
          fastify.prisma,
          parsed.data.fromDate,
          parsed.data.toDate,
        );
        return reply.status(200).send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'fromDate must be before toDate') {
          return reply.status(400).send({ error: message });
        }
        throw err;
      }
    },
  );

  fastify.get(
    '/agents',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = AgentLeaderboardQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const result = await getAgentLeaderboard(
        fastify.prisma,
        parsed.data.sortBy,
        parsed.data.limit,
      );
      return reply.status(200).send(result);
    },
  );

  fastify.get(
    '/models',
    { preHandler: [authenticate] },
    async (_request, reply) => {
      const result = await getModelUsage(fastify.prisma);
      return reply.status(200).send(result);
    },
  );
}
