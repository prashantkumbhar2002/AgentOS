import { z } from 'zod';

export const RiskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const EnvironmentSchema = z.enum(['DEV', 'STAGING', 'PROD']);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const AgentStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'DEPRECATED',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});
export type AgentTool = z.infer<typeof AgentToolSchema>;

export const CreateAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  ownerTeam: z.string().min(1),
  llmModel: z.string().min(1),
  riskTier: RiskTierSchema,
  environment: EnvironmentSchema,
  tools: z.array(AgentToolSchema).min(0),
  tags: z.array(z.string()).optional(),
});
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  ownerTeam: z.string().min(1).optional(),
  llmModel: z.string().min(1).optional(),
  riskTier: RiskTierSchema.optional(),
  environment: EnvironmentSchema.optional(),
  tools: z.array(AgentToolSchema).optional(),
  tags: z.array(z.string()).optional(),
  // Rolling 30-day USD spend limit. Server rejects audit logs when exceeded.
  // Pass null to clear the budget.
  budgetUsd: z.number().nonnegative().nullable().optional(),
});
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

export const UpdateAgentStatusSchema = z.object({
  status: AgentStatusSchema,
  comment: z.string().optional(),
});
export type UpdateAgentStatusInput = z.infer<typeof UpdateAgentStatusSchema>;

export const AgentListQuerySchema = z.object({
  status: AgentStatusSchema.optional(),
  riskTier: RiskTierSchema.optional(),
  environment: EnvironmentSchema.optional(),
  ownerTeam: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AgentListQuery = z.infer<typeof AgentListQuerySchema>;

export const AgentIdParamsSchema = z.object({
  id: z.string().uuid(),
});
export type AgentIdParams = z.infer<typeof AgentIdParamsSchema>;

export const AgentSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: AgentStatusSchema,
  riskTier: RiskTierSchema,
  ownerTeam: z.string(),
  environment: EnvironmentSchema,
  lastActiveAt: z.coerce.date().nullable(),
  toolCount: z.number().int(),
  cost7dUsd: z.number(),
});
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

export const AgentStatsSchema = z.object({
  totalRuns: z.number().int(),
  totalCost7dUsd: z.number(),
  avgLatencyMs: z.number(),
  errorRate: z.number(),
  healthScore: z.number().int().min(0).max(100),
});
export type AgentStats = z.infer<typeof AgentStatsSchema>;

export const AgentDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  ownerTeam: z.string(),
  llmModel: z.string(),
  riskTier: RiskTierSchema,
  environment: EnvironmentSchema,
  status: AgentStatusSchema,
  approvedBy: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  lastActiveAt: z.coerce.date().nullable(),
  tools: z.array(AgentToolSchema.extend({ id: z.string().uuid() })),
  stats: AgentStatsSchema,
  recentLogs: z.array(z.unknown()),
  pendingApprovals: z.array(z.unknown()),
  policies: z.array(z.unknown()),
});
export type AgentDetail = z.infer<typeof AgentDetailSchema>;
