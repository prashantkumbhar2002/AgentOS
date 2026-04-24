import type { FastifyInstance } from 'fastify';
import {
    AuditEventSchema,
    AuditBatchSchema,
    AuditQuerySchema,
    TraceIdParamsSchema,
    AgentIdParamsSchema,
} from './audit.schema.js';
import { authenticate } from '../../plugins/auth.js';
import { calculateCost } from '../../utils/cost-calculator.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../../errors/index.js';

export default async function auditRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { auditService, agentService } = fastify.services;

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
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const agentExists = await agentService.getAgentById(parsed.data.agentId);
            if (!agentExists) {
                throw new NotFoundError('Agent', parsed.data.agentId);
            }

            const costUsd = calculateCost(
                parsed.data.model ?? '',
                parsed.data.inputTokens ?? 0,
                parsed.data.outputTokens ?? 0,
            );

            const log = await auditService.createLog(parsed.data, costUsd);

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

    fastify.post(
        '/batch',
        {
            preHandler: [authenticate],
            config: {
                rateLimit: {
                    max: 200,
                    timeWindow: '1 minute',
                    keyGenerator: (request: { body: unknown }) => {
                        const body = request.body as Record<string, unknown> | undefined;
                        const events = body?.events as Array<Record<string, unknown>> | undefined;
                        return (events?.[0]?.agentId as string) ?? 'unknown';
                    },
                },
            },
        },
        async (request, reply) => {
            const parsed = AuditBatchSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const agentIds = [...new Set(parsed.data.events.map((e) => e.agentId))];
            for (const agentId of agentIds) {
                const agentExists = await agentService.getAgentById(agentId);
                if (!agentExists) {
                    throw new NotFoundError('Agent', agentId);
                }
            }

            let totalCostUsd = 0;
            const logsToCreate = parsed.data.events.map((event) => {
                const costUsd = calculateCost(
                    event.model ?? '',
                    event.inputTokens ?? 0,
                    event.outputTokens ?? 0,
                );
                totalCostUsd += costUsd;
                return { ...event, costUsd };
            });

            const count = await auditService.createBatch(logsToCreate);

            for (const log of logsToCreate) {
                fastify.sse.broadcast({
                    type: 'audit.log',
                    payload: {
                        agentId: log.agentId,
                        event: log.event,
                        traceId: log.traceId,
                        costUsd: log.costUsd,
                    },
                });
            }

            return reply.status(201).send({ count, totalCostUsd });
        },
    );

    fastify.get(
        '/logs',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = AuditQuerySchema.safeParse(request.query);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            if (parsed.data.export === 'csv') {
                const role = request.user.role;
                if (role !== 'admin' && role !== 'approver') {
                    throw new AuthorizationError('admin, approver');
                }

                const csv = await auditService.exportCsv(parsed.data);
                const date = new Date().toISOString().split('T')[0];

                return reply
                    .header('Content-Type', 'text/csv')
                    .header('Content-Disposition', `attachment; filename="audit-export-${date}.csv"`)
                    .send(csv);
            }

            const result = await auditService.queryLogs(parsed.data);
            return reply.status(200).send(result);
        },
    );

    fastify.get(
        '/traces/:traceId',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const paramsParsed = TraceIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const trace = await auditService.getTrace(paramsParsed.data.traceId);
            if (!trace) {
                throw new NotFoundError('Trace', paramsParsed.data.traceId);
            }

            return reply.status(200).send(trace);
        },
    );

    fastify.get(
        '/stats/:id',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const paramsParsed = AgentIdParamsSchema.safeParse(request.params);
            if (!paramsParsed.success) {
                throw new ValidationError('Validation failed', { issues: paramsParsed.error.issues });
            }

            const agentExists = await agentService.getAgentById(paramsParsed.data.id);
            if (!agentExists) {
                throw new NotFoundError('Agent', paramsParsed.data.id);
            }

            const stats = await auditService.getAgentStats(paramsParsed.data.id);
            return reply.status(200).send(stats);
        },
    );
}
