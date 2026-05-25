import { z } from 'zod';

/**
 * Generic Workflow Step Definition
 * 
 * Represents a single step in a workflow that can be:
 * - LLM call
 * - API call
 * - Approval gate
 * - Conditional branch
 * - Parallel execution
 */
export const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(['llm', 'api', 'approval', 'condition', 'parallel', 'loop']),
  name: z.string(),
  description: z.string().optional(),
  
  // LLM step config
  llm: z.object({
    provider: z.enum(['anthropic', 'openai']),
    model: z.string(),
    systemPrompt: z.string().optional(),
    userPrompt: z.string(),
    maxTokens: z.number().optional(),
    temperature: z.number().optional(),
  }).optional(),
  
  // API step config
  api: z.object({
    url: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  }).optional(),
  
  // Approval gate config
  approval: z.object({
    requiresApproval: z.boolean(),
    riskThreshold: z.number().optional(),
    approvers: z.array(z.string()).optional(),
    timeoutMs: z.number().optional(),
  }).optional(),
  
  // Condition config (if-then-else)
  condition: z.object({
    expression: z.string(), // JSONPath or simple expression
    onTrue: z.string(), // next step ID
    onFalse: z.string(), // next step ID
  }).optional(),
  
  // Error handling
  retry: z.object({
    maxAttempts: z.number().default(3),
    backoffMs: z.number().default(1000),
  }).optional(),
  
  // Next step(s)
  next: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Generic Workflow Definition
 * 
 * Defines a complete workflow that can be executed by the engine
 */
export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  
  // Workflow metadata
  metadata: z.object({
    agentId: z.string(),
    createdBy: z.string(),
    createdAt: z.string(),
    tags: z.array(z.string()).optional(),
  }),
  
  // Input/output schema (JSON Schema format)
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  
  // Budget constraints
  constraints: z.object({
    maxCostUsd: z.number().optional(),
    maxDurationMs: z.number().optional(),
    maxRetries: z.number().optional(),
  }).optional(),
  
  // Workflow steps
  steps: z.array(WorkflowStepSchema),
  
  // Starting step
  startStep: z.string(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * Workflow Execution Input
 */
export const WorkflowExecutionInputSchema = z.object({
  workflowDefinitionId: z.string(),
  agentId: z.string(),
  traceId: z.string(),
  input: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkflowExecutionInput = z.infer<typeof WorkflowExecutionInputSchema>;

/**
 * Workflow Execution Result
 */
export interface WorkflowExecutionResult {
  workflowId: string;
  workflowDefinitionId: string;
  agentId: string;
  traceId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING_APPROVAL';
  output: Record<string, unknown>;
  error?: string;
  steps: {
    stepId: string;
    status: 'completed' | 'failed' | 'skipped' | 'pending';
    startedAt: number;
    completedAt?: number;
    error?: string;
  }[];
  totalCostUsd: number;
  durationMs: number;
}
