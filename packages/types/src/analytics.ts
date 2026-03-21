import { z } from 'zod';

// --- Query Schemas ---

export const DateRangeQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;

export const CostTimelineQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('30').transform(Number),
  agentId: z.string().uuid().optional(),
});
export type CostTimelineQuery = z.infer<typeof CostTimelineQuerySchema>;

export const AgentLeaderboardQuerySchema = z.object({
  sortBy: z.enum(['cost', 'runs', 'errorRate']).default('cost'),
  limit: z.coerce.number().min(1).max(100).default(10),
});
export type AgentLeaderboardQuery = z.infer<typeof AgentLeaderboardQuerySchema>;

// --- Response Schemas ---

export const CostSummarySchema = z.object({
  todayUsd: z.number(),
  last7dUsd: z.number(),
  last30dUsd: z.number(),
  totalUsd: z.number(),
  changeVs7dAgo: z.number(),
});
export type CostSummary = z.infer<typeof CostSummarySchema>;

export const CostTimelineSeriesSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string(),
  dailyCosts: z.array(z.number()),
});

export const CostTimelineSchema = z.object({
  dates: z.array(z.string()),
  series: z.array(CostTimelineSeriesSchema),
});
export type CostTimeline = z.infer<typeof CostTimelineSchema>;

export const UsageStatsSchema = z.object({
  totalRuns: z.number(),
  totalLlmCalls: z.number(),
  totalToolCalls: z.number(),
  avgRunCostUsd: z.number(),
  totalApprovals: z.number(),
  autoApproved: z.number(),
  approved: z.number(),
  denied: z.number(),
  expired: z.number(),
});
export type UsageStats = z.infer<typeof UsageStatsSchema>;

export const AgentLeaderboardEntrySchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string(),
  ownerTeam: z.string(),
  totalCostUsd: z.number(),
  totalRuns: z.number(),
  errorRate: z.number(),
  avgLatencyMs: z.number(),
  healthScore: z.number(),
});

export const AgentLeaderboardSchema = z.object({
  agents: z.array(AgentLeaderboardEntrySchema),
});
export type AgentLeaderboard = z.infer<typeof AgentLeaderboardSchema>;

export const ModelUsageEntrySchema = z.object({
  model: z.string(),
  callCount: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
});

export const ModelUsageSchema = z.object({
  models: z.array(ModelUsageEntrySchema),
});
export type ModelUsage = z.infer<typeof ModelUsageSchema>;
