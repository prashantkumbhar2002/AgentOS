import { z } from 'zod';
import { RiskTierSchema } from './agent.js';

export const PolicyEffectSchema = z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL']);
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;

export const PolicyRuleInputSchema = z.object({
  actionType: z.string().min(1),
  riskTiers: z.array(RiskTierSchema),
  effect: PolicyEffectSchema,
  conditions: z.record(z.unknown()).optional().nullable(),
});
export type PolicyRuleInput = z.infer<typeof PolicyRuleInputSchema>;

export const CreatePolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  rules: z.array(PolicyRuleInputSchema),
});
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>;

export const UpdatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePolicyInput = z.infer<typeof UpdatePolicySchema>;

export const PolicyIdParamsSchema = z.object({
  id: z.string().uuid(),
});
export type PolicyIdParams = z.infer<typeof PolicyIdParamsSchema>;

export const PolicyListQuerySchema = z.object({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PolicyListQuery = z.infer<typeof PolicyListQuerySchema>;

export const PolicyAssignSchema = z.object({
  agentId: z.string().uuid(),
});
export type PolicyAssignInput = z.infer<typeof PolicyAssignSchema>;

export const PolicyUnassignParamsSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
});
export type PolicyUnassignParams = z.infer<typeof PolicyUnassignParamsSchema>;

export const PolicyEvaluationRequestSchema = z.object({
  agentId: z.string().uuid(),
  actionType: z.string().min(1),
  riskTier: RiskTierSchema,
  context: z.record(z.unknown()).optional(),
});
export type PolicyEvaluationRequest = z.infer<typeof PolicyEvaluationRequestSchema>;

export const PolicyEvaluationResultSchema = z.object({
  effect: PolicyEffectSchema,
  matchedRule: z.unknown().optional(),
  matchedPolicy: z
    .object({ id: z.string(), name: z.string() })
    .optional(),
  reason: z.string(),
});
export type PolicyEvaluationResult = z.infer<typeof PolicyEvaluationResultSchema>;
