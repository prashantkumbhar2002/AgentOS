import type {
    CostSummary,
    CostTimeline,
    UsageStats,
    AgentLeaderboard,
    ModelUsage,
} from '@agentos/types';
import type { IAnalyticsRepository } from '../../repositories/interfaces/IAnalyticsRepository.js';
import type { DateFilter } from '../../types/dto.js';
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

function buildDateFilter(fromDate?: string, toDate?: string): DateFilter | undefined {
    if (!fromDate && !toDate) return undefined;
    const filter: DateFilter = {};
    if (fromDate) filter.gte = new Date(fromDate);
    if (toDate) filter.lte = new Date(toDate);
    return filter;
}

export class AnalyticsService {
    constructor(
        private readonly analyticsRepo: IAnalyticsRepository,
    ) { }

    async getCostSummary(fromDate?: string, toDate?: string): Promise<CostSummary> {
        validateDateRange(fromDate, toDate);

        const now = new Date();
        const todayStart = startOfDay(now);
        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        const fourteenDaysAgo = new Date(todayStart);
        fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);
        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

        const aggregates = await this.analyticsRepo.getCostAggregates([
            { key: 'today', gte: todayStart },
            { key: 'last7d', gte: sevenDaysAgo },
            { key: 'last30d', gte: thirtyDaysAgo },
            { key: 'total' },
            { key: 'prev7d', gte: fourteenDaysAgo, lt: sevenDaysAgo },
        ]);

        const byKey = new Map(aggregates.map((a) => [a.rangeKey, a.totalUsd]));
        const todayUsd = byKey.get('today') ?? 0;
        const last7dUsd = byKey.get('last7d') ?? 0;
        const last30dUsd = byKey.get('last30d') ?? 0;
        const totalUsd = byKey.get('total') ?? 0;
        const prev7dUsd = byKey.get('prev7d') ?? 0;

        const changeVs7dAgo = prev7dUsd === 0 ? 0 : ((last7dUsd - prev7dUsd) / prev7dUsd) * 100;

        return { todayUsd, last7dUsd, last30dUsd, totalUsd, changeVs7dAgo };
    }

    async getCostTimeline(days: number, agentId?: string): Promise<CostTimeline> {
        const dates = generateDateRange(days);
        const startDate = new Date(dates[0]!);
        startDate.setUTCHours(0, 0, 0, 0);

        const entries = await this.analyticsRepo.getCostByAgentByDay(startDate);

        const filteredEntries = agentId
            ? entries.filter((e) => e.agentId === agentId)
            : entries;

        const agentIds = new Set(filteredEntries.map((e) => e.agentId));

        if (agentIds.size === 0) {
            return { dates, series: [] };
        }

        const costMap = new Map<string, number>();
        const agentNameMap = new Map<string, string>();

        for (const entry of filteredEntries) {
            const key = `${entry.agentId}:${entry.date}`;
            costMap.set(key, (costMap.get(key) ?? 0) + entry.costUsd);
            agentNameMap.set(entry.agentId, entry.agentName);
        }

        const series = [...agentIds].map((aid) => ({
            agentId: aid,
            agentName: agentNameMap.get(aid) ?? 'Unknown',
            dailyCosts: dates.map((d) => costMap.get(`${aid}:${d}`) ?? 0),
        }));

        return { dates, series };
    }

    async getUsageStats(fromDate?: string, toDate?: string): Promise<UsageStats> {
        validateDateRange(fromDate, toDate);

        const dateFilter = buildDateFilter(fromDate, toDate);

        const [usage, approvals] = await Promise.all([
            this.analyticsRepo.getUsageCounts(dateFilter),
            this.analyticsRepo.getApprovalCountsByStatus(dateFilter),
        ]);

        const avgRunCostUsd = usage.totalRuns > 0 ? usage.totalCostUsd / usage.totalRuns : 0;

        return {
            totalRuns: usage.totalRuns,
            totalLlmCalls: usage.totalLlmCalls,
            totalToolCalls: usage.totalToolCalls,
            avgRunCostUsd,
            totalApprovals: approvals.approved + approvals.denied + approvals.expired + approvals.autoApproved + approvals.pending,
            autoApproved: approvals.autoApproved,
            approved: approvals.approved,
            denied: approvals.denied,
            expired: approvals.expired,
        };
    }

    async getAgentLeaderboard(
        sortBy: 'cost' | 'runs' | 'errorRate',
        limit: number,
    ): Promise<AgentLeaderboard> {
        const metrics = await this.analyticsRepo.getAgentMetrics();

        if (metrics.length === 0) {
            return { agents: [] };
        }

        const entries = metrics.map((m) => {
            const errorRate = m.totalEvents > 0 ? m.errorCount / m.totalEvents : 0;
            const approvalDenyRate = m.totalApprovals > 0 ? m.deniedCount / m.totalApprovals : 0;

            return {
                agentId: m.agentId,
                agentName: m.agentName,
                ownerTeam: m.ownerTeam,
                totalCostUsd: m.totalCostUsd,
                totalRuns: m.totalRuns,
                errorRate,
                avgLatencyMs: Math.round(m.avgLatencyMs),
                healthScore: calculateHealthScore(errorRate, approvalDenyRate, m.avgLatencyMs),
            };
        });

        const sortKey = sortBy === 'cost' ? 'totalCostUsd' : sortBy === 'runs' ? 'totalRuns' : 'errorRate';
        entries.sort((a, b) => b[sortKey] - a[sortKey]);

        return { agents: entries.slice(0, limit) };
    }

    async getModelUsage(): Promise<ModelUsage> {
        const metrics = await this.analyticsRepo.getModelMetrics();

        const models = metrics
            .map((m) => ({
                model: m.model,
                callCount: m.callCount,
                totalInputTokens: m.totalInputTokens,
                totalOutputTokens: m.totalOutputTokens,
                totalCostUsd: m.totalCostUsd,
            }))
            .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

        return { models };
    }
}
