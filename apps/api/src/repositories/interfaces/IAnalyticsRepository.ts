import type { CostAggregate, DailyCostEntry, UsageCounts, ApprovalStatusCounts, AgentMetricRow, ModelMetricRow, DateFilter, DateRange } from '../../types/dto.js';

export interface IAnalyticsRepository {
    getCostAggregates(ranges: DateRange[]): Promise<CostAggregate[]>;
    getCostByAgentByDay(startDate: Date): Promise<DailyCostEntry[]>;
    getUsageCounts(dateFilter?: DateFilter): Promise<UsageCounts>;
    getApprovalCountsByStatus(dateFilter?: DateFilter): Promise<ApprovalStatusCounts>;
    getAgentMetrics(): Promise<AgentMetricRow[]>;
    getModelMetrics(): Promise<ModelMetricRow[]>;
    getDistinctTraceCount(dateFilter?: DateFilter): Promise<number>;
}
