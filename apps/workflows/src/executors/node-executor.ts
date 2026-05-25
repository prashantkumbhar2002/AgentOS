import * as restate from '@restatedev/restate-sdk';
import {
  Node,
  WorkflowDefinitionDAG,
  LLMNodeConfig,
  APINodeConfig,
  ApprovalNodeConfig,
  ConditionNodeConfig,
  TransformNodeConfig,
} from '../types/workflow-dag.js';
import { callClaude } from '../utils/anthropic.js';
import { calculateCost } from '../utils/cost-calculator.js';

/**
 * Node Executor
 * 
 * Executes individual nodes in a DAG workflow.
 * Each node type has its own execution logic.
 */

export interface NodeExecutionResult {
  output: unknown;
  cost?: number;
}

/**
 * Execute a single node in the DAG
 */
export async function executeNode(
  ctx: restate.WorkflowContext,
  node: Node,
  context: Record<string, unknown>,
  _definition: WorkflowDefinitionDAG
): Promise<NodeExecutionResult> {
  switch (node.type) {
    case 'llm':
      return await executeLLMNode(ctx, node, context);
    case 'api':
      return await executeAPINode(ctx, node, context);
    case 'approval':
      return await executeApprovalNode(ctx, node, context);
    case 'condition':
      return await executeConditionNode(ctx, node, context);
    case 'transform':
      return await executeTransformNode(ctx, node, context);
    case 'parallel':
      return await executeParallelNode(ctx, node, context);
    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

/**
 * Execute LLM node (call Anthropic Claude or OpenAI)
 */
async function executeLLMNode(
  ctx: restate.WorkflowContext,
  node: Node,
  context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const config = node.config as LLMNodeConfig;

  // Interpolate prompts
  const system = config.systemPrompt ? interpolateString(config.systemPrompt, context) : undefined;
  const userPrompt = interpolateString(config.userPrompt, context);

  ctx.console.info('Calling LLM', {
    provider: config.provider,
    model: config.model,
  });

  if (config.provider === 'anthropic') {
    const response = await callClaude({
      model: config.model,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    const costResult = calculateCost({
      model: config.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cacheCreationInputTokens: response.usage.cacheCreationInputTokens,
      cacheReadInputTokens: response.usage.cacheReadInputTokens,
    });

    return {
      output: {
        content: response.content,
        usage: response.usage,
      },
      cost: costResult.costUsd,
    };
  }

  // OpenAI support can be added here
  throw new Error(`LLM provider not supported: ${config.provider}`);
}

/**
 * Execute API node (make HTTP request)
 */
async function executeAPINode(
  ctx: restate.WorkflowContext,
  node: Node,
  context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const config = node.config as APINodeConfig;

  // Interpolate URL and body
  const url = interpolateString(config.url, context);
  const body = config.body ? interpolateObject(config.body, context) : undefined;
  const headers = config.headers || {};

  ctx.console.info('Calling API', {
    method: config.method,
    url,
  });

  const response = await fetch(url, {
    method: config.method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    output: data,
    cost: 0, // API calls typically don't have token-based costs
  };
}

/**
 * Execute approval node (create approval ticket and wait)
 */
async function executeApprovalNode(
  ctx: restate.WorkflowContext,
  node: Node,
  context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const config = node.config as ApprovalNodeConfig;

  if (!config.requiresApproval) {
    // No approval needed, pass through
    return {
      output: { approved: true, reason: 'No approval required' },
      cost: 0,
    };
  }

  // Check risk threshold
  const riskScore = context.riskScore as number | undefined;
  if (riskScore !== undefined && config.riskThreshold !== undefined) {
    if (riskScore < config.riskThreshold) {
      ctx.console.info('Risk below threshold, auto-approving', {
        riskScore,
        threshold: config.riskThreshold,
      });
      return {
        output: { approved: true, reason: 'Risk below threshold' },
        cost: 0,
      };
    }
  }

  // Create approval ticket
  const ticketId = `approval_${ctx.rand.uuidv4()}`;
  
  ctx.console.info('Creating approval ticket', { ticketId });

  // TODO: Call AgentOS API to create approval ticket
  // For now, just simulate

  // Wait for approval using durable promise
  const promiseName = `approval_${ticketId}`;
  
  try {
    const approvalResult = await ctx.promise<{
      decision: 'approved' | 'denied' | 'expired';
      approvedBy?: string;
      approvedAt?: string;
      feedback?: string;
    }>(promiseName);

    ctx.console.info('Approval received', {
      decision: approvalResult.decision,
      approvedBy: approvalResult.approvedBy,
    });

    if (approvalResult.decision !== 'approved') {
      throw new Error(`Approval ${approvalResult.decision}: ${approvalResult.feedback || 'No reason provided'}`);
    }

    return {
      output: approvalResult,
      cost: 0,
    };
  } catch (error: any) {
    throw new Error(`Approval failed: ${error.message}`);
  }
}

/**
 * Execute condition node (evaluate expression)
 */
async function executeConditionNode(
  _ctx: restate.WorkflowContext,
  node: Node,
  context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const config = node.config as ConditionNodeConfig;

  // Evaluate the condition expression
  const result = evaluateExpression(config.expression, context);

  return {
    output: { result },
    cost: 0,
  };
}

/**
 * Execute transform node (transform data)
 */
async function executeTransformNode(
  _ctx: restate.WorkflowContext,
  node: Node,
  context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const config = node.config as TransformNodeConfig;

  try {
    // UNSAFE: eval in production should be replaced with a sandboxed evaluator
    // For now, create a function with the script
    const func = new Function('input', config.script);
    const output = func(context);

    return {
      output,
      cost: 0,
    };
  } catch (error: any) {
    throw new Error(`Transform failed: ${error.message}`);
  }
}

/**
 * Execute parallel node (no-op, handled by DAG engine)
 */
async function executeParallelNode(
  _ctx: restate.WorkflowContext,
  _node: Node,
  _context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  // Parallel nodes don't execute anything themselves
  // They're handled by the DAG engine's level-based execution
  return {
    output: { type: 'parallel' },
    cost: 0,
  };
}

/**
 * Interpolate variables in a string
 */
function interpolateString(template: string, context: Record<string, unknown>): string {
  let result = template;

  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    if (result.includes(placeholder)) {
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), strValue);
    }

    // Also support nested paths like {{node.property}}
    if (typeof value === 'object' && value !== null) {
      for (const [nestedKey, nestedValue] of Object.entries(value as any)) {
        const nestedPlaceholder = `{{${key}.${nestedKey}}}`;
        if (result.includes(nestedPlaceholder)) {
          const strValue = typeof nestedValue === 'object' ? JSON.stringify(nestedValue) : String(nestedValue);
          result = result.replace(new RegExp(`\\{\\{${key}\\.${nestedKey}\\}\\}`, 'g'), strValue);
        }
      }
    }
  }

  return result;
}

/**
 * Interpolate variables in an object
 */
function interpolateObject(obj: unknown, context: Record<string, unknown>): unknown {
  if (typeof obj === 'string') {
    return interpolateString(obj, context);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, context));
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, context);
    }
    return result;
  }

  return obj;
}

/**
 * Evaluate a simple expression
 */
function evaluateExpression(expression: string, context: Record<string, unknown>): boolean {
  try {
    // Interpolate variables
    const interpolated = interpolateString(expression, context);

    // Simple evaluation for common patterns
    const compareMatch = interpolated.match(/^(.+?)\s*(===|!==|>|<|>=|<=)\s*(.+)$/);
    if (compareMatch && compareMatch.length >= 4) {
      const left = compareMatch[1]?.trim();
      const op = compareMatch[2];
      const right = compareMatch[3]?.trim();
      
      if (!left || !right) return false;
      
      const leftVal = tryParseValue(left);
      const rightVal = tryParseValue(right);

      switch (op) {
        case '===': return leftVal === rightVal;
        case '!==': return leftVal !== rightVal;
        case '>': return (leftVal as number) > (rightVal as number);
        case '<': return (leftVal as number) < (rightVal as number);
        case '>=': return (leftVal as number) >= (rightVal as number);
        case '<=': return (leftVal as number) <= (rightVal as number);
      }
    }

    // If it's just a boolean value
    if (interpolated === 'true') return true;
    if (interpolated === 'false') return false;

    return false;
  } catch (error) {
    console.error('Failed to evaluate expression:', expression, error);
    return false;
  }
}

/**
 * Try to parse a value
 */
function tryParseValue(str: string): any {
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null') return null;
  if (!isNaN(Number(str))) return Number(str);
  try {
    return JSON.parse(str);
  } catch {
    return str.replace(/^["']|["']$/g, '');
  }
}
