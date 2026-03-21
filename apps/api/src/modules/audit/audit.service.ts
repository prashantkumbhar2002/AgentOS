import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { AuditEventInput, AuditQuery } from '@agentos/types';

export async function createLog(
  prisma: PrismaClient,
  data: AuditEventInput,
  costUsd: number,
) {
  const log = await prisma.auditLog.create({
    data: {
      agentId: data.agentId,
      traceId: data.traceId,
      event: data.event,
      model: data.model ?? null,
      toolName: data.toolName ?? null,
      inputs: data.inputs ?? Prisma.JsonNull,
      outputs: data.outputs ?? Prisma.JsonNull,
      inputTokens: data.inputTokens ?? null,
      outputTokens: data.outputTokens ?? null,
      costUsd,
      latencyMs: data.latencyMs ?? null,
      success: data.success ?? true,
      errorMsg: data.errorMsg ?? null,
      metadata: data.metadata ?? Prisma.JsonNull,
    },
  });

  prisma.agent
    .update({
      where: { id: data.agentId },
      data: { lastActiveAt: new Date() },
    })
    .catch(() => {});

  return log;
}

export async function queryLogs(
  prisma: PrismaClient,
  query: AuditQuery,
) {
  const { agentId, traceId, event, success, fromDate, toDate, page, limit } = query;

  const where: Prisma.AuditLogWhereInput = {};
  if (agentId) where.agentId = agentId;
  if (traceId) where.traceId = traceId;
  if (event) where.event = event;
  if (success !== undefined) where.success = success;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = fromDate;
    if (toDate) where.createdAt.lte = toDate;
  }

  const [data, total, costAgg] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.aggregate({
      where,
      _sum: { costUsd: true },
    }),
  ]);

  return {
    data,
    total,
    page,
    totalCostUsd: costAgg._sum.costUsd ?? 0,
  };
}

export async function getTrace(
  prisma: PrismaClient,
  traceId: string,
) {
  const events = await prisma.auditLog.findMany({
    where: { traceId },
    orderBy: { createdAt: 'asc' },
  });

  if (events.length === 0) return null;

  const agent = await prisma.agent.findUnique({
    where: { id: events[0]!.agentId },
    select: { name: true },
  });

  const totalCost = events.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
  const totalLatencyMs = events.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0);
  const success = events.every((e) => e.success);

  return {
    traceId,
    agentId: events[0]!.agentId,
    agentName: agent?.name ?? 'Unknown',
    events,
    totalCost: parseFloat(totalCost.toFixed(6)),
    totalLatencyMs,
    startedAt: events[0]!.createdAt,
    completedAt: events[events.length - 1]!.createdAt,
    success,
  };
}

export async function getAgentStats(
  prisma: PrismaClient,
  agentId: string,
) {
  const [totalCalls, errorCount, costAgg, latencyAgg] = await Promise.all([
    prisma.auditLog.count({ where: { agentId } }),
    prisma.auditLog.count({ where: { agentId, success: false } }),
    prisma.auditLog.aggregate({
      where: { agentId },
      _sum: { costUsd: true },
    }),
    prisma.auditLog.aggregate({
      where: { agentId },
      _avg: { latencyMs: true },
    }),
  ]);

  const distinctTraces = await prisma.auditLog.groupBy({
    by: ['traceId'],
    where: { agentId },
  });
  const totalRuns = distinctTraces.length;

  const toolGroups = await prisma.auditLog.groupBy({
    by: ['toolName'],
    where: { agentId, toolName: { not: null } },
    _count: { toolName: true },
    orderBy: { _count: { toolName: 'desc' } },
    take: 10,
  });

  const topTools = toolGroups.map((g) => ({
    name: g.toolName!,
    count: g._count.toolName,
  }));

  const errorRate = totalCalls > 0 ? errorCount / totalCalls : 0;
  const successRate = totalCalls > 0 ? (totalCalls - errorCount) / totalCalls : 1;

  return {
    totalRuns,
    totalCalls,
    totalCostUsd: costAgg._sum.costUsd ?? 0,
    avgLatencyMs: latencyAgg._avg.latencyMs ?? 0,
    errorRate: parseFloat(errorRate.toFixed(6)),
    successRate: parseFloat(successRate.toFixed(6)),
    topTools,
  };
}

const CSV_HEADERS = 'id,agentId,agentName,traceId,event,model,toolName,inputTokens,outputTokens,costUsd,latencyMs,success,createdAt';

function escapeCsvField(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportCsv(
  prisma: PrismaClient,
  query: AuditQuery,
) {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.agentId) where.agentId = query.agentId;
  if (query.traceId) where.traceId = query.traceId;
  if (query.event) where.event = query.event;
  if (query.success !== undefined) where.success = query.success;
  if (query.fromDate || query.toDate) {
    where.createdAt = {};
    if (query.fromDate) where.createdAt.gte = query.fromDate;
    if (query.toDate) where.createdAt.lte = query.toDate;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { agent: { select: { name: true } } },
  });

  const rows = logs.map((log) =>
    [
      log.id,
      log.agentId,
      escapeCsvField(log.agent.name),
      log.traceId,
      log.event,
      log.model ?? '',
      log.toolName ?? '',
      log.inputTokens ?? '',
      log.outputTokens ?? '',
      log.costUsd ?? '',
      log.latencyMs ?? '',
      log.success,
      log.createdAt.toISOString(),
    ].join(','),
  );

  return [CSV_HEADERS, ...rows].join('\n');
}
