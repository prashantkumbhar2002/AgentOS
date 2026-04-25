import type { FastifyInstance } from 'fastify';
import {
    AuditEventSchema,
    AuditBatchSchema,
    AuditQuerySchema,
    TraceIdParamsSchema,
    AgentIdParamsSchema,
} from './audit.schema.js';
import { authenticate, authenticateAgentOrUser, assertAgentScope } from '../../plugins/auth.js';
import { calculateCost } from '../../utils/cost-calculator.js';
import {
    NotFoundError,
    ValidationError,
    AuthorizationError,
    BudgetExceededError,
} from '../../errors/index.js';

/** Rolling window for server-side budget enforcement (last N days). */
const BUDGET_WINDOW_DAYS = 30;
const BUDGET_WINDOW_MS = BUDGET_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export default async function auditRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { auditService, agentService, agentRepo, auditRepo } = fastify.services;
    const agentOrUser = authenticateAgentOrUser(fastify);

    /**
     * Reject the request if any agent's rolling spend (existing + this batch's
     * contribution) exceeds its configured `budgetUsd`. Throws on the first
     * violation; spend is broadcast over SSE so dashboards can react.
     */
    async function enforceBudgets(
        contributions: Map<string, number>,
        agentInfos: Map<string, { status: string; budgetUsd: number | null }>,
    ): Promise<void> {
        const agentsWithBudget: string[] = [];
        for (const [id, info] of agentInfos) {
            if (info.budgetUsd != null && info.budgetUsd > 0) {
                agentsWithBudget.push(id);
            }
        }
        if (agentsWithBudget.length === 0) return;

        const since = new Date(Date.now() - BUDGET_WINDOW_MS);
        const priorSpend = await auditRepo.getSpendByAgentsSince(agentsWithBudget, since);

        for (const id of agentsWithBudget) {
            const info = agentInfos.get(id)!;
            const budget = info.budgetUsd!;
            const prior = priorSpend.get(id) ?? 0;
            const incoming = contributions.get(id) ?? 0;
            const projected = prior + incoming;

            if (projected > budget) {
                fastify.sse.broadcast({
                    type: 'agent.budget_exceeded',
                    payload: {
                        agentId: id,
                        currentUsd: prior,
                        projectedUsd: projected,
                        budgetUsd: budget,
                        windowDays: BUDGET_WINDOW_DAYS,
                    },
                });
                throw new BudgetExceededError(id, projected, budget, BUDGET_WINDOW_DAYS);
            }
        }
    }

    fastify.post(
        '/log',
        {
            preHandler: [agentOrUser],
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

            assertAgentScope(request, parsed.data.agentId);

            const [info] = await agentRepo.findInfoByIds([parsed.data.agentId]);
            if (!info) {
                throw new NotFoundError('Agent', parsed.data.agentId);
            }

            const costUsd = calculateCost(
                parsed.data.model ?? '',
                parsed.data.inputTokens ?? 0,
                parsed.data.outputTokens ?? 0,
            );

            await enforceBudgets(
                new Map([[parsed.data.agentId, costUsd]]),
                new Map([[info.id, { status: info.status, budgetUsd: info.budgetUsd }]]),
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
            preHandler: [agentOrUser],
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
                assertAgentScope(request, agentId);
            }

            // PERF: single round-trip replaces the previous N `getAgentById` calls.
            const infos = await agentRepo.findInfoByIds(agentIds);
            const infoById = new Map(infos.map((i) => [i.id, i]));
            for (const agentId of agentIds) {
                if (!infoById.has(agentId)) {
                    throw new NotFoundError('Agent', agentId);
                }
            }

            let totalCostUsd = 0;
            const contributions = new Map<string, number>();
            const logsToCreate = parsed.data.events.map((event) => {
                const costUsd = calculateCost(
                    event.model ?? '',
                    event.inputTokens ?? 0,
                    event.outputTokens ?? 0,
                );
                totalCostUsd += costUsd;
                contributions.set(event.agentId, (contributions.get(event.agentId) ?? 0) + costUsd);
                return { ...event, costUsd };
            });

            await enforceBudgets(
                contributions,
                new Map(infos.map((i) => [i.id, { status: i.status, budgetUsd: i.budgetUsd }])),
            );

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
