import { z } from 'zod';

/**
 * DAG-Based Workflow Definition
 * 
 * Represents workflows as Directed Acyclic Graphs (DAGs) for:
 * - Better parallelism
 * - Visual editing
 * - Complex flow control
 * - Industry-standard approach
 */

// ============================================================================
// Node Configurations (Type-Specific)
// ============================================================================

export const LLMNodeConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
});

export const APINodeConfigSchema = z.object({
  url: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

export const ApprovalNodeConfigSchema = z.object({
  requiresApproval: z.boolean(),
  riskThreshold: z.number().optional(),
  approvers: z.array(z.string()).optional(),
  timeoutMs: z.number().optional(),
});

export const ConditionNodeConfigSchema = z.object({
  expression: z.string(), // JSONPath or JavaScript expression
});

export const TransformNodeConfigSchema = z.object({
  script: z.string(), // JavaScript code to transform data
});

export const ParallelNodeConfigSchema = z.object({
  strategy: z.enum(['all', 'any', 'majority']).default('all'), // Join strategy
});

// ============================================================================
// Node Definition
// ============================================================================

export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(['llm', 'api', 'approval', 'condition', 'transform', 'parallel']),
  name: z.string(),
  description: z.string().optional(),
  
  // Type-specific config (only one should be present based on type)
  config: z.union([
    LLMNodeConfigSchema,
    APINodeConfigSchema,
    ApprovalNodeConfigSchema,
    ConditionNodeConfigSchema,
    TransformNodeConfigSchema,
    ParallelNodeConfigSchema,
  ]),
  
  // Error handling
  retry: z.object({
    maxAttempts: z.number().default(3),
    backoffMs: z.number().default(1000),
  }).optional(),
  
  // UI Layout (for visual editor)
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
});

export type Node = z.infer<typeof NodeSchema>;
export type LLMNodeConfig = z.infer<typeof LLMNodeConfigSchema>;
export type APINodeConfig = z.infer<typeof APINodeConfigSchema>;
export type ApprovalNodeConfig = z.infer<typeof ApprovalNodeConfigSchema>;
export type ConditionNodeConfig = z.infer<typeof ConditionNodeConfigSchema>;
export type TransformNodeConfig = z.infer<typeof TransformNodeConfigSchema>;
export type ParallelNodeConfig = z.infer<typeof ParallelNodeConfigSchema>;

// ============================================================================
// Edge Definition
// ============================================================================

export const EdgeSchema = z.object({
  id: z.string(),
  from: z.string(), // Source node ID
  to: z.string(),   // Target node ID
  condition: z.string().optional(), // Optional condition for traversal
  label: z.string().optional(), // Optional label (for UI, e.g., "High Risk", "Low Risk")
});

export type Edge = z.infer<typeof EdgeSchema>;

// ============================================================================
// DAG Definition
// ============================================================================

export const WorkflowDAGSchema = z.object({
  nodes: z.array(NodeSchema).min(1),
  edges: z.array(EdgeSchema),
});

export type WorkflowDAG = z.infer<typeof WorkflowDAGSchema>;

// ============================================================================
// Complete Workflow Definition (DAG-Based)
// ============================================================================

export const WorkflowDefinitionDAGSchema = z.object({
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
  
  // DAG structure
  dag: WorkflowDAGSchema,
  
  // Entry point node ID
  entryNodeId: z.string(),
  
  // Input/output schema (JSON Schema format)
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  
  // Budget constraints
  constraints: z.object({
    maxCostUsd: z.number().optional(),
    maxDurationMs: z.number().optional(),
    maxRetries: z.number().optional(),
  }).optional(),
});

export type WorkflowDefinitionDAG = z.infer<typeof WorkflowDefinitionDAGSchema>;

// ============================================================================
// Workflow Execution Input (unchanged)
// ============================================================================

export const WorkflowExecutionInputSchema = z.object({
  workflowDefinitionId: z.string(),
  agentId: z.string(),
  traceId: z.string(),
  input: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkflowExecutionInput = z.infer<typeof WorkflowExecutionInputSchema>;

// ============================================================================
// Workflow Execution Result (updated for DAG)
// ============================================================================

export interface WorkflowExecutionResult {
  workflowId: string;
  workflowDefinitionId: string;
  agentId: string;
  traceId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING_APPROVAL';
  output: Record<string, unknown>;
  error?: string;
  nodes: {
    nodeId: string;
    status: 'completed' | 'failed' | 'skipped' | 'pending';
    startedAt: number;
    completedAt?: number;
    error?: string;
  }[];
  totalCostUsd: number;
  durationMs: number;
  executionPath: string[]; // Ordered list of executed node IDs (for debugging)
}

// ============================================================================
// DAG Execution State (internal)
// ============================================================================

export interface DAGExecutionState {
  completedNodes: Set<string>;
  pendingNodes: Set<string>;
  failedNodes: Set<string>;
  nodeResults: Map<string, unknown>;
  inDegree: Map<string, number>;
}
