import type { FastifyInstance } from 'fastify';
import {
  AuditEventSchema,
  AuditQuerySchema,
  TraceIdParamsSchema,
  AgentIdParamsSchema,
} from './audit.schema.js';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { calculateCost } from '../../utils/cost-calculator.js';
import {
  createLog,
  queryLogs,
  getTrace,
  getAgentStats,
  exportCsv,
} from './audit.service.js';

export default async function auditRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // T3.06 — POST / (ingest audit log)
  fastify.post(
    '/log',
    {
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 1000,
          timeWindow: '1 minute',
          keyGenerator: (request: { body: unknown }) => {
            const body = request.body as Record<string, unknown> | undefined;
            return (body?.agentId as string) ?? 'unknown';
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = AuditEventSchema.safeParse(request.body);
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

      const costUsd = calculateCost(
        parsed.data.model ?? '',
        parsed.data.inputTokens ?? 0,
        parsed.data.outputTokens ?? 0,
      );

      const log = await createLog(fastify.prisma, parsed.data, costUsd);

      fastify.sse.broadcast({
        type: 'audit.log',
        payload: {
          agentId: log.agentId,
          event: log.event,
          traceId: log.traceId,
          costUsd: log.costUsd,
        },
      });

      return reply.status(201).send({
        id: log.id,
        traceId: log.traceId,
        costUsd: log.costUsd,
      });
    },
  );

  // T3.07 — GET /logs (query with filters + CSV export)
  fastify.get(
    '/logs',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parsed = AuditQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      if (parsed.data.export === 'csv') {
        const role = request.user.role;
        if (role !== 'admin' && role !== 'approver') {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const csv = await exportCsv(fastify.prisma, parsed.data);
        const date = new Date().toISOString().split('T')[0];

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="audit-export-${date}.csv"`)
          .send(csv);
      }

      const result = await queryLogs(fastify.prisma, parsed.data);
      return reply.status(200).send(result);
    },
  );

  // T3.07 — GET /traces/:traceId (trace view)
  fastify.get(
    '/traces/:traceId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paramsParsed = TraceIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: paramsParsed.error.issues,
        });
      }

      const trace = await getTrace(fastify.prisma, paramsParsed.data.traceId);
      if (!trace) {
        return reply.status(404).send({ error: 'Trace not found' });
      }

      return reply.status(200).send(trace);
    },
  );

  // T3.08 — GET /stats/:agentId (agent statistics)
  fastify.get(
    '/stats/:id',
    { preHandler: [authenticate] },
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

      const stats = await getAgentStats(fastify.prisma, paramsParsed.data.id);
      return reply.status(200).send(stats);
    },
  );
}
