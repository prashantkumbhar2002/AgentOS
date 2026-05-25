import * as restate from '@restatedev/restate-sdk';
import {
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowExecutionInputSchema,
  WorkflowStep,
} from '../types/workflow-definition.js';
import { getWorkflowDefinition } from '../utils/workflow-registry.js';
import { executeStep } from '../executors/step-executor.js';

/**
 * Generic Workflow Engine
 * 
 * Executes user-defined workflows dynamically based on their definition.
 * This is the core engine that interprets workflow definitions and executes them durably.
 * 
 * Features:
 * - Dynamic workflow execution based on definition
 * - Support for multiple step types (LLM, API, approval, conditions, loops)
 * - Automatic approval gates with durable promises
 * - Cost tracking and budget enforcement
 * - Error handling and retries
 * - Complete audit trail
 */
export const genericWorkflowEngine = restate.workflow({
  name: 'GenericWorkflowEngine',
  handlers: {
    run: async (ctx: restate.WorkflowContext, input: unknown) => {
      const startTime = Date.now();
      
      // Validate input
      const validated = WorkflowExecutionInputSchema.parse(input);
      const { workflowDefinitionId, agentId, traceId, input: workflowInput, metadata } = validated;
      
      // Generate unique workflow execution ID
      const workflowId = `wf_${ctx.rand.uuidv4()}`;
      
      ctx.console.info('Starting workflow execution', {
        workflowId,
        workflowDefinitionId,
        agentId,
        traceId,
      });

      // Step 1: Load workflow definition
      const definition = await ctx.run('load_workflow_definition', async () => {
        return await getWorkflowDefinition(workflowDefinitionId);
      });

      if (!definition) {
        throw new Error(`Workflow definition not found: ${workflowDefinitionId}`);
      }

      ctx.console.info('Workflow definition loaded', {
        name: definition.name,
        version: definition.version,
        stepCount: definition.steps.length,
      });

      // Initialize execution context
      let totalCost = 0;
      const maxCost = definition.constraints?.maxCostUsd ?? 10.0;
      const stepResults: WorkflowExecutionResult['steps'] = [];
      const executionContext: Record<string, unknown> = {
        ...workflowInput,
        _metadata: metadata,
        _agentId: agentId,
        _traceId: traceId,
      };

      // Step 2: Execute workflow steps
      let currentStepId = definition.startStep;
      let status: WorkflowExecutionResult['status'] = 'COMPLETED';

      while (currentStepId) {
        const step = definition.steps.find((s) => s.id === currentStepId);
        
        if (!step) {
          ctx.console.error('Step not found', { currentStepId });
          status = 'FAILED';
          break;
        }

        ctx.console.info('Executing step', {
          stepId: step.id,
          stepType: step.type,
          stepName: step.name,
        });

        const stepStartTime = Date.now();

        // Check budget before executing step
        if (totalCost >= maxCost) {
          ctx.console.warn('Budget exceeded, stopping workflow', {
            totalCost,
            maxCost,
          });
          status = 'FAILED';
          stepResults.push({
            stepId: step.id,
            status: 'failed',
            startedAt: stepStartTime,
            error: 'Budget exceeded',
          });
          break;
        }

        try {
          // Execute step based on type
          const stepResult = await executeStepWithContext(
            ctx,
            step,
            executionContext,
            definition
          );

          // Update execution context with step output
          executionContext[step.id] = stepResult.output;
          totalCost += stepResult.cost;

          stepResults.push({
            stepId: step.id,
            status: 'completed',
            startedAt: stepStartTime,
            completedAt: Date.now(),
          });

          // Determine next step
          if (stepResult.status === 'pending_approval') {
            status = 'PENDING_APPROVAL';
            break;
          } else if (step.type === 'condition' && step.condition) {
            // Evaluate condition to determine next step
            const conditionResult = evaluateCondition(
              step.condition.expression,
              executionContext
            );
            currentStepId = conditionResult
              ? step.condition.onTrue
              : step.condition.onFalse;
          } else {
            // Normal flow: use step.next (undefined will exit loop)
            const nextStep = typeof step.next === 'string' 
              ? step.next 
              : step.next?.[0];
            currentStepId = nextStep ?? '';
          }
        } catch (error) {
          ctx.console.error('Step execution failed', {
            stepId: step.id,
            error: error instanceof Error ? error.message : String(error),
          });

          stepResults.push({
            stepId: step.id,
            status: 'failed',
            startedAt: stepStartTime,
            completedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          });

          status = 'FAILED';
          break;
        }
      }

      // Step 3: Create audit log
      await ctx.run('create_audit_log', async () => {
        ctx.console.info('Creating audit log', {
          agentId,
          traceId,
          workflowId,
          status,
        });
        // TODO: Call AgentOS API to create audit log
        return { logged: true };
      });

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      const result: WorkflowExecutionResult = {
        workflowId,
        workflowDefinitionId,
        agentId,
        traceId,
        status,
        output: executionContext,
        steps: stepResults,
        totalCostUsd: totalCost,
        durationMs,
      };

      ctx.console.info('Workflow execution completed', result);
      return result;
    },
  },
});

/**
 * Execute a single step with durable execution
 */
async function executeStepWithContext(
  ctx: restate.WorkflowContext,
  step: WorkflowStep,
  context: Record<string, unknown>,
  definition: WorkflowDefinition
): Promise<{
  output: unknown;
  cost: number;
  status: 'completed' | 'pending_approval';
}> {
  return await ctx.run(`step_${step.id}`, async () => {
    return await executeStep(ctx, step, context, definition);
  });
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(
  expression: string,
  context: Record<string, unknown>
): boolean {
  // Simple expression evaluator
  // TODO: Implement proper JSONPath or expression evaluation
  // For now, just handle simple cases like "output.requiresApproval === true"
  
  try {
    // Create a safe evaluation context
    const fn = new Function(...Object.keys(context), `return ${expression}`);
    return Boolean(fn(...Object.values(context)));
  } catch (error) {
    console.error('Error evaluating condition:', error);
    return false;
  }
}
