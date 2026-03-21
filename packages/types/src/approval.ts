import { z } from 'zod';

export const ApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DENIED',
  'EXPIRED',
  'AUTO_APPROVED',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const CreateApprovalSchema = z.object({
  agentId: z.string().uuid(),
  actionType: z.string().min(1),
  payload: z.unknown(),
  riskScore: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});
export type CreateApprovalInput = z.infer<typeof CreateApprovalSchema>;

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'DENIED']),
  comment: z.string().optional(),
});
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalTicketSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  agentName: z.string(),
  actionType: z.string(),
  payload: z.unknown(),
  riskScore: z.number(),
  reasoning: z.string(),
  status: ApprovalStatusSchema,
  resolvedById: z.string().uuid().nullable(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date(),
  slackMsgTs: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type ApprovalTicket = z.infer<typeof ApprovalTicketSchema>;

export const ApprovalQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  agentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ApprovalQuery = z.infer<typeof ApprovalQuerySchema>;

export const ApprovalIdParamsSchema = z.object({
  id: z.string().uuid(),
});
export type ApprovalIdParams = z.infer<typeof ApprovalIdParamsSchema>;
