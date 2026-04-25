import { z } from 'zod';

export const AuditEventTypeSchema = z.enum([
  'llm_call',
  'tool_call',
  'approval_requested',
  'approval_resolved',
  'action_blocked',
  'action_taken',
  // Emitted by SDK `withSpan(fn)` when `fn` rejects, so the dashboard can
  // visually tag the span as failed without inspecting child events.
  'span_failed',
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventSchema = z.object({
  agentId: z.string().uuid(),
  traceId: z.string().uuid(),
  spanId: z.string().uuid().optional(),
  parentSpanId: z.string().uuid().optional(),
  event: AuditEventTypeSchema,
  model: z.string().optional(),
  toolName: z.string().optional(),
  inputs: z.unknown().optional(),
  outputs: z.unknown().optional(),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  latencyMs: z.number().int().min(0).optional(),
  success: z.boolean().default(true),
  errorMsg: z.string().optional(),
  metadata: z.unknown().optional(),
});
export type AuditEventInput = z.infer<typeof AuditEventSchema>;

export const AuditBatchSchema = z.object({
  events: z.array(AuditEventSchema).min(1).max(100),
});
export type AuditBatchInput = z.infer<typeof AuditBatchSchema>;

// NOTE: do NOT use `z.coerce.boolean()` for query params — it calls `Boolean(value)`
// internally, and `Boolean("false") === true` (any non-empty string is truthy).
// That silently inverts `?success=false` filters. Use an explicit string mapper instead.
const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

export const AuditQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  traceId: z.string().uuid().optional(),
  event: AuditEventTypeSchema.optional(),
  success: queryBool.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  export: z.string().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  traceId: z.string().uuid(),
  spanId: z.string().nullable(),
  parentSpanId: z.string().nullable(),
  event: z.string(),
  model: z.string().nullable(),
  toolName: z.string().nullable(),
  inputs: z.unknown().nullable(),
  outputs: z.unknown().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  costUsd: z.number().nullable(),
  latencyMs: z.number().int().nullable(),
  success: z.boolean(),
  errorMsg: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.coerce.date(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const TraceIdParamsSchema = z.object({
  traceId: z.string().uuid(),
});
export type TraceIdParams = z.infer<typeof TraceIdParamsSchema>;

export const TopToolSchema = z.object({
  name: z.string(),
  count: z.number().int(),
});

export const AgentStatsResponseSchema = z.object({
  totalRuns: z.number().int(),
  totalCalls: z.number().int(),
  totalCostUsd: z.number(),
  avgLatencyMs: z.number(),
  errorRate: z.number(),
  successRate: z.number(),
  topTools: z.array(TopToolSchema),
});
export type AgentStatsResponse = z.infer<typeof AgentStatsResponseSchema>;
