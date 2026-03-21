import type { PrismaClient } from '@prisma/client';
import type {
  CostSummary,
  CostTimeline,
  UsageStats,
  AgentLeaderboard,
  ModelUsage,
} from '@agentos/types';
import { calculateHealthScore } from '../../utils/health-score.js';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

function validateDateRange(fromDate?: string, toDate?: string): void {
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new Error('fromDate must be before toDate');
  }
}

function buildDateFilter(fromDate?: string, toDate?: string): Record<string, unknown> | undefined {
  if (!fromDate && !toDate) return undefined;
  const filter: Record<string, unknown> = {};
  if (fromDate) filter['gte'] = new Date(fromDate);
  if (toDate) filter['lte'] = new Date(toDate);
  return filter;
}

export async function getCostSummary(
  prisma: PrismaClient,
  fromDate?: string,
  toDate?: string,
): Promise<CostSummary> {
  validateDateRange(fromDate, toDate);

  const now = new Date();
  const todayStart = startOfDay(now);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const fourteenDaysAgo = new Date(todayStart);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const dateFilter = buildDateFilter(fromDate, toDate);
  const baseWhere = dateFilter ? { createdAt: dateFilter } : {};

  const [todayAgg, last7dAgg, last30dAgg, totalAgg, prev7dAgg] = await Promise.all([
    prisma.auditLog.aggregate({
      _sum: { costUsd: true },
      where: { ...baseWhere, createdAt: { ...dateFilter, gte: todayStart } },
    }),
    prisma.auditLog.aggregate({
      _sum: { costUsd: true },
      where: { ...baseWhere, createdAt: { ...dateFilter, gte: sevenDaysAgo } },
    }),
    prisma.auditLog.aggregate({
      _sum: { costUsd: true },
      where: { ...baseWhere, createdAt: { ...dateFilter, gte: thirtyDaysAgo } },
    }),
    prisma.auditLog.aggregate({
      _sum: { costUsd: true },
      where: baseWhere,
    }),
    prisma.auditLog.aggregate({
      _sum: { costUsd: true },
      where: {
        createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
    }),
  ]);

  const todayUsd = todayAgg._sum.costUsd ?? 0;
  const last7dUsd = last7dAgg._sum.costUsd ?? 0;
  const last30dUsd = last30dAgg._sum.costUsd ?? 0;
  const totalUsd = totalAgg._sum.costUsd ?? 0;
  const prev7dUsd = prev7dAgg._sum.costUsd ?? 0;

  const changeVs7dAgo = prev7dUsd === 0 ? 0 : ((last7dUsd - prev7dUsd) / prev7dUsd) * 100;

  return { todayUsd, last7dUsd, last30dUsd, totalUsd, changeVs7dAgo };
}

export async function getCostTimeline(
  prisma: PrismaClient,
  days: number,
  agentId?: string,
): Promise<CostTimeline> {
  const dates = generateDateRange(days);
  const startDate = new Date(dates[0]!);
  startDate.setUTCHours(0, 0, 0, 0);

  const where: Record<string, unknown> = {
    createdAt: { gte: startDate },
  };
  if (agentId) where['agentId'] = agentId;

  const logs = await prisma.auditLog.findMany({
    where,
    select: { agentId: true, costUsd: true, createdAt: true },
  });

  const agentIds = new Set<string>();
  const costMap = new Map<string, number>();

  for (const log of logs) {
    agentIds.add(log.agentId);
    const dateKey = `${log.agentId}:${formatDate(log.createdAt)}`;
    costMap.set(dateKey, (costMap.get(dateKey) ?? 0) + (log.costUsd ?? 0));
  }

  if (agentIds.size === 0) {
    return { dates, series: [] };
  }

  const agents = await prisma.agent.findMany({
    where: { id: { in: [...agentIds] } },
    select: { id: true, name: true },
  });

  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  const series = [...agentIds].map((aid) => ({
    agentId: aid,
    agentName: agentNameMap.get(aid) ?? 'Unknown',
    dailyCosts: dates.map((d) => costMap.get(`${aid}:${d}`) ?? 0),
  }));

  return { dates, series };
}

export async function getUsageStats(
  prisma: PrismaClient,
  fromDate?: string,
  toDate?: string,
): Promise<UsageStats> {
  validateDateRange(fromDate, toDate);

  const dateFilter = buildDateFilter(fromDate, toDate);
  const auditWhere = dateFilter ? { createdAt: dateFilter } : {};
  const approvalWhere = dateFilter ? { createdAt: dateFilter } : {};

  const [
    distinctTraces,
    llmCount,
    toolCount,
    costAgg,
    approvalGroups,
  ] = await Promise.all([
    prisma.auditLog.findMany({
      where: auditWhere,
      distinct: ['traceId'],
      select: { traceId: true },
    }),
    prisma.auditLog.count({ where: { ...auditWhere, event: 'llm_call' } }),
    prisma.auditLog.count({ where: { ...auditWhere, event: 'tool_call' } }),
    prisma.auditLog.aggregate({ _sum: { costUsd: true }, where: auditWhere }),
    prisma.approvalTicket.groupBy({
      by: ['status'],
      _count: true,
      where: approvalWhere,
    }),
  ]);

  const totalRuns = distinctTraces.length;
  const totalCost = costAgg._sum.costUsd ?? 0;
  const avgRunCostUsd = totalRuns > 0 ? totalCost / totalRuns : 0;

  const statusCounts: Record<string, number> = {};
  for (const g of approvalGroups) {
    statusCounts[g.status] = g._count;
  }

  return {
    totalRuns,
    totalLlmCalls: llmCount,
    totalToolCalls: toolCount,
    avgRunCostUsd,
    totalApprovals: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    autoApproved: statusCounts['AUTO_APPROVED'] ?? 0,
    approved: statusCounts['APPROVED'] ?? 0,
    denied: statusCounts['DENIED'] ?? 0,
    expired: statusCounts['EXPIRED'] ?? 0,
  };
}

export async function getAgentLeaderboard(
  prisma: PrismaClient,
  sortBy: 'cost' | 'runs' | 'errorRate',
  limit: number,
): Promise<AgentLeaderboard> {
  const agentGroups = await prisma.auditLog.groupBy({
    by: ['agentId'],
    _sum: { costUsd: true },
    _avg: { latencyMs: true },
    _count: true,
  });

  if (agentGroups.length === 0) {
    return { agents: [] };
  }

  const agentIds = agentGroups.map((g) => g.agentId);

  const [agents, errorCounts, approvalGroups] = await Promise.all([
    prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, ownerTeam: true },
    }),
    prisma.auditLog.groupBy({
      by: ['agentId'],
      _count: true,
      where: { agentId: { in: agentIds }, success: false },
    }),
    prisma.approvalTicket.groupBy({
      by: ['agentId', 'status'],
      _count: true,
      where: { agentId: { in: agentIds } },
    }),
  ]);

  const distinctTraceCounts = await prisma.auditLog.findMany({
    where: { agentId: { in: agentIds } },
    distinct: ['traceId', 'agentId'],
    select: { agentId: true, traceId: true },
  });

  const runsPerAgent = new Map<string, number>();
  for (const row of distinctTraceCounts) {
    runsPerAgent.set(row.agentId, (runsPerAgent.get(row.agentId) ?? 0) + 1);
  }

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const errorMap = new Map(errorCounts.map((e) => [e.agentId, e._count]));

  const approvalDenyRateMap = new Map<string, number>();
  const approvalCountMap = new Map<string, number>();
  for (const g of approvalGroups) {
    const current = approvalCountMap.get(g.agentId) ?? 0;
    approvalCountMap.set(g.agentId, current + g._count);
    if (g.status === 'DENIED') {
      approvalDenyRateMap.set(g.agentId, g._count);
    }
  }

  const entries = agentGroups.map((g) => {
    const agent = agentMap.get(g.agentId);
    const totalEvents = g._count;
    const errorCount = errorMap.get(g.agentId) ?? 0;
    const errorRate = totalEvents > 0 ? errorCount / totalEvents : 0;
    const avgLatencyMs = g._avg.latencyMs ?? 0;
    const totalApprovals = approvalCountMap.get(g.agentId) ?? 0;
    const deniedCount = approvalDenyRateMap.get(g.agentId) ?? 0;
    const approvalDenyRate = totalApprovals > 0 ? deniedCount / totalApprovals : 0;

    return {
      agentId: g.agentId,
      agentName: agent?.name ?? 'Unknown',
      ownerTeam: agent?.ownerTeam ?? 'Unknown',
      totalCostUsd: g._sum.costUsd ?? 0,
      totalRuns: runsPerAgent.get(g.agentId) ?? 0,
      errorRate,
      avgLatencyMs: Math.round(avgLatencyMs),
      healthScore: calculateHealthScore(errorRate, approvalDenyRate, avgLatencyMs),
    };
  });

  const sortKey = sortBy === 'cost' ? 'totalCostUsd' : sortBy === 'runs' ? 'totalRuns' : 'errorRate';
  entries.sort((a, b) => b[sortKey] - a[sortKey]);

  return { agents: entries.slice(0, limit) };
}

export async function getModelUsage(prisma: PrismaClient): Promise<ModelUsage> {
  const groups = await prisma.auditLog.groupBy({
    by: ['model'],
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    _count: true,
    where: { model: { not: null } },
  });

  const models = groups
    .map((g) => ({
      model: g.model!,
      callCount: g._count,
      totalInputTokens: g._sum.inputTokens ?? 0,
      totalOutputTokens: g._sum.outputTokens ?? 0,
      totalCostUsd: g._sum.costUsd ?? 0,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  return { models };
}
