import * as restate from '@restatedev/restate-sdk';
import { WorkflowStep, WorkflowDefinition } from '../types/workflow-definition.js';
import { callClaude } from '../utils/anthropic.js';
import { calculateCost } from '../utils/cost-calculator.js';

/**
 * Step Executor
 * 
 * Executes individual workflow steps based on their type.
 * Each step type has its own execution logic.
 */

export async function executeStep(
  ctx: restate.WorkflowContext,
  step: WorkflowStep,
  context: Record<string, unknown>,
  definition: WorkflowDefinition
): Promise<{
  output: unknown;
  cost: number;
  status: 'completed' | 'pending_approval';
}> {
  ctx.console.info('Executing step', { stepId: step.id, stepType: step.type });

  switch (step.type) {
    case 'llm':
      return await executeLLMStep(ctx, step, context);
    
    case 'api':
      return await executeAPIStep(ctx, step, context);
    
    case 'approval':
      return await executeApprovalStep(ctx, step, context);
    
    case 'condition':
      // Condition steps don't execute anything, just evaluate
      return { output: null, cost: 0, status: 'completed' };
    
    case 'parallel':
      return await executeParallelStep(ctx, step, context, definition);
    
    case 'loop':
      return await executeLoopStep(ctx, step, context, definition);
    
    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

/**
 * Execute LLM step (Claude, GPT, etc.)
 */
async function executeLLMStep(
  ctx: restate.WorkflowContext,
  step: WorkflowStep,
  context: Record<string, unknown>
): Promise<{ output: unknown; cost: number; status: 'completed' }> {
  if (!step.llm) {
    throw new Error(`LLM config missing for step ${step.id}`);
  }

  const { provider, model, systemPrompt, userPrompt, maxTokens, temperature } = step.llm;

  // Interpolate variables in prompts
  const interpolatedUserPrompt = interpolateString(userPrompt, context);
  const interpolatedSystemPrompt = systemPrompt
    ? interpolateString(systemPrompt, context)
    : undefined;

  ctx.console.info('Calling LLM', { provider, model });

  if (provider === 'anthropic') {
    const response = await callClaude({
      model,
      system: interpolatedSystemPrompt,
      messages: [{ role: 'user', content: interpolatedUserPrompt }],
      maxTokens,
      temperature,
    });

    const cost = calculateCost({
      model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cacheCreationInputTokens: response.usage.cacheCreationInputTokens,
      cacheReadInputTokens: response.usage.cacheReadInputTokens,
    }).costUsd;

    return {
      output: {
        content: response.content,
        usage: response.usage,
      },
      cost,
      status: 'completed',
    };
  }

  // TODO: Add OpenAI support
  throw new Error(`Provider ${provider} not yet implemented`);
}

/**
 * Execute API call step
 */
async function executeAPIStep(
  ctx: restate.WorkflowContext,
  step: WorkflowStep,
  context: Record<string, unknown>
): Promise<{ output: unknown; cost: number; status: 'completed' }> {
  if (!step.api) {
    throw new Error(`API config missing for step ${step.id}`);
  }

  const { url, method, headers, body } = step.api;

  // Interpolate variables in URL and body
  const interpolatedUrl = interpolateString(url, context);
  const interpolatedBody = body ? interpolateObject(body, context) : undefined;

  ctx.console.info('Calling API', { method, url: interpolatedUrl });

  const response = await fetch(interpolatedUrl, {
    method,
    headers: headers ?? {},
    body: interpolatedBody ? JSON.stringify(interpolatedBody) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    output: data,
    cost: 0.0001, // Negligible cost for API calls
    status: 'completed',
  };
}

/**
 * Execute approval gate step
 */
async function executeApprovalStep(
  ctx: restate.WorkflowContext,
  step: WorkflowStep,
  context: Record<string, unknown>
): Promise<{ output: unknown; cost: number; status: 'completed' | 'pending_approval' }> {
  if (!step.approval) {
    throw new Error(`Approval config missing for step ${step.id}`);
  }

  const { requiresApproval, riskThreshold } = step.approval;

  // Check if approval is required based on risk threshold
  const riskScore = (context._riskScore as number) ?? 0;
  const needsApproval = requiresApproval || (riskThreshold !== undefined && riskScore > riskThreshold);

  if (!needsApproval) {
    ctx.console.info('Approval not required, auto-approving');
    return {
      output: { decision: 'approved', autoApproved: true },
      cost: 0,
      status: 'completed',
    };
  }

  ctx.console.info('Creating approval ticket');

  // Create approval ticket
  const ticketId = `ticket_${ctx.rand.uuidv4()}`;
  
  // TODO: Call AgentOS API to create approval ticket with step context
  
  ctx.console.info('Waiting for human approval', { ticketId });

  // Wait durably for approval using Restate promise
  const promiseName = `approval_${ticketId}`;
  
  // Note: Restate promise doesn't support timeout in the promise call itself
  // Timeout handling should be done via ticket expiration in the approval service
  const approvalResult = await ctx.promise<{
    decision: 'approved' | 'denied' | 'expired';
    approvedBy?: string;
    approvedAt?: string;
    feedback?: string;
  }>(promiseName);

  ctx.console.info('Approval received', approvalResult);

  if (approvalResult.decision === 'denied') {
    throw new Error(`Approval denied by ${approvalResult.approvedBy}`);
  }

  return {
    output: approvalResult,
    cost: 0,
    status: 'completed',
  };
}

/**
 * Execute parallel steps
 */
async function executeParallelStep(
  _ctx: restate.WorkflowContext,
  _step: WorkflowStep,
  _context: Record<string, unknown>,
  _definition: WorkflowDefinition
): Promise<{ output: unknown; cost: number; status: 'completed' }> {
  // TODO: Implement parallel execution
  // This would execute multiple steps concurrently
  return { output: null, cost: 0, status: 'completed' };
}

/**
 * Execute loop step
 */
async function executeLoopStep(
  _ctx: restate.WorkflowContext,
  _step: WorkflowStep,
  _context: Record<string, unknown>,
  _definition: WorkflowDefinition
): Promise<{ output: unknown; cost: number; status: 'completed' }> {
  // TODO: Implement loop execution
  // This would repeat steps based on a condition or array
  return { output: null, cost: 0, status: 'completed' };
}

/**
 * Interpolate variables in a string using {{variable}} syntax
 */
function interpolateString(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path);
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Interpolate variables in an object
 */
function interpolateObject(obj: unknown, context: Record<string, unknown>): unknown {
  if (typeof obj === 'string') {
    return interpolateString(obj, context);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateObject(item, context));
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
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: any, key) => current?.[key], obj);
}
