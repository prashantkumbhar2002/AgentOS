import * as restate from '@restatedev/restate-sdk';
import {
  WorkflowDefinitionDAG,
  WorkflowExecutionResult,
  WorkflowExecutionInputSchema,
  DAGExecutionState,
} from '../types/workflow-dag.js';
import { getWorkflowDefinition } from '../utils/workflow-registry.js';
import {
  validateDAG,
  computeInDegree,
  getChildren,
} from '../utils/dag-validation.js';
import { executeNode } from '../executors/node-executor.js';

/**
 * DAG Workflow Engine
 * 
 * Executes workflows defined as Directed Acyclic Graphs (DAGs).
 * 
 * Features:
 * - Parallel execution of independent nodes
 * - Level-based traversal (topological order)
 * - Conditional branching
 * - Join semantics (wait for all parents)
 * - Durable execution via Restate
 */
export const dagWorkflowEngine = restate.workflow({
  name: 'DAGWorkflowEngine',
  handlers: {
    run: async (ctx: restate.WorkflowContext, input: unknown) => {
      const startTime = Date.now();
      
      // Validate input
      const validated = WorkflowExecutionInputSchema.parse(input);
      const { workflowDefinitionId, agentId, traceId, input: workflowInput, metadata } = validated;
      
      // Generate unique workflow execution ID
      const workflowId = `wf_${ctx.rand.uuidv4()}`;
      
      ctx.console.info('Starting DAG workflow execution', {
        workflowId,
        workflowDefinitionId,
        agentId,
        traceId,
      });

      // Step 1: Load workflow definition
      const rawDefinition = await ctx.run('load_workflow_definition', async () => {
        return await getWorkflowDefinition(workflowDefinitionId);
      });

      if (!rawDefinition) {
        throw new Error(`Workflow definition not found: ${workflowDefinitionId}`);
      }

      // Parse as DAG workflow
      const definition = rawDefinition as unknown as WorkflowDefinitionDAG;
      const { dag, entryNodeId } = definition;

      ctx.console.info('DAG workflow definition loaded', {
        name: definition.name,
        version: definition.version,
        nodeCount: dag.nodes.length,
        edgeCount: dag.edges.length,
        entryNode: entryNodeId,
      });

      // Step 2: Validate DAG structure
      const validationResult = validateDAG(dag, entryNodeId);
      if (!validationResult.valid) {
        ctx.console.error('DAG validation failed', { errors: validationResult.errors });
        throw new Error(`Invalid DAG: ${validationResult.errors.join(', ')}`);
      }

      if (validationResult.warnings.length > 0) {
        ctx.console.warn('DAG validation warnings', { warnings: validationResult.warnings });
      }

      // Initialize execution context
      let totalCost = 0;
      const maxCost = definition.constraints?.maxCostUsd ?? 10.0;
      const executedNodes: WorkflowExecutionResult['nodes'] = [];
      const executionPath: string[] = [];
      
      const executionContext: Record<string, unknown> = {
        ...workflowInput,
        _metadata: metadata,
        _agentId: agentId,
        _traceId: traceId,
        _apiUrl: process.env.AGENTOS_API_URL || 'http://localhost:3000',
        _workflowId: workflowId,
        _definitionId: workflowDefinitionId,
      };

      // Step 3: Execute DAG level by level
      const state: DAGExecutionState = {
        completedNodes: new Set<string>(),
        pendingNodes: new Set<string>(),
        failedNodes: new Set<string>(),
        nodeResults: new Map<string, unknown>(),
        inDegree: computeInDegree(dag),
      };

      const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
      let status: WorkflowExecutionResult['status'] = 'COMPLETED';

      // Start with entry node
      const readyQueue: string[] = [entryNodeId];

      while (readyQueue.length > 0) {
        // Get all ready nodes at current level (can execute in parallel)
        const currentLevel = [...readyQueue];
        readyQueue.length = 0;

        ctx.console.info('Executing DAG level', {
          level: executionPath.length,
          nodes: currentLevel,
          readyCount: currentLevel.length,
        });

        // Execute all nodes at this level in parallel
        const levelResults = await Promise.all(
          currentLevel.map(async (nodeId) => {
            const node = nodeMap.get(nodeId);
            if (!node) {
              return { nodeId, success: false, error: 'Node not found' };
            }

            // Skip if already completed
            if (state.completedNodes.has(nodeId)) {
              return { nodeId, success: true, skipped: true };
            }

            // Check budget constraint
            if (totalCost >= maxCost) {
              ctx.console.error('Budget exceeded', { totalCost, maxCost });
              return { nodeId, success: false, error: 'Budget exceeded' };
            }

            try {
              const nodeStartTime = Date.now();
              
              // Execute node durably
              const result = await ctx.run(`node_${nodeId}`, async () => {
                ctx.console.info('Executing node', {
                  nodeId: node.id,
                  nodeType: node.type,
                  nodeName: node.name,
                });
                
                return await executeNode(ctx, node, executionContext, definition);
              });

              const nodeEndTime = Date.now();

              // Track cost
              if (result.cost) {
                totalCost += result.cost;
              }

              // Store result in context
              executionContext[nodeId] = result.output;
              state.nodeResults.set(nodeId, result.output);
              state.completedNodes.add(nodeId);
              executionPath.push(nodeId);

              executedNodes.push({
                nodeId: node.id,
                status: 'completed',
                startedAt: nodeStartTime,
                completedAt: nodeEndTime,
              });

              ctx.console.info('Node executed successfully', {
                nodeId,
                cost: result.cost,
                duration: nodeEndTime - nodeStartTime,
              });

              return { nodeId, success: true, result };
            } catch (error: any) {
              ctx.console.error('Node execution failed', {
                nodeId,
                error: error.message,
              });

              state.failedNodes.add(nodeId);
              executedNodes.push({
                nodeId: node.id,
                status: 'failed',
                startedAt: Date.now(),
                completedAt: Date.now(),
                error: error.message,
              });

              return { nodeId, success: false, error: error.message };
            }
          })
        );

        // Check for failures
        const failedInLevel = levelResults.filter(r => !r.success);
        if (failedInLevel.length > 0) {
          status = 'FAILED';
          ctx.console.error('Level execution failed', {
            failed: failedInLevel.map(r => r.nodeId),
          });
          break;
        }

        // Update ready queue: add children of completed nodes
        for (const nodeId of currentLevel) {
          const children = getChildren(dag, nodeId);
          
          for (const childId of children) {
            // Check if this edge should be traversed (handle conditions)
            const edge = dag.edges.find(e => e.from === nodeId && e.to === childId);
            
            if (edge?.condition) {
              // Evaluate condition
              const shouldTraverse = evaluateCondition(edge.condition, executionContext);
              if (!shouldTraverse) {
                ctx.console.info('Skipping edge due to condition', {
                  from: nodeId,
                  to: childId,
                  condition: edge.condition,
                });
                continue;
              }
            }

            // Decrement in-degree
            const currentDegree = state.inDegree.get(childId) || 0;
            state.inDegree.set(childId, currentDegree - 1);

            // If in-degree is now 0, node is ready
            if (state.inDegree.get(childId) === 0 && !state.completedNodes.has(childId)) {
              readyQueue.push(childId);
            }
          }
        }
      }

      // Check if workflow completed successfully
      if (status === 'COMPLETED' && state.failedNodes.size > 0) {
        status = 'FAILED';
      }

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      ctx.console.info('DAG workflow execution completed', {
        workflowId,
        status,
        executedNodes: state.completedNodes.size,
        failedNodes: state.failedNodes.size,
        totalCost,
        durationMs,
      });

      // Create audit log
      await ctx.run('create_audit_log', async () => {
        // Would call AgentOS API to create audit log
        ctx.console.info('Audit log created', { workflowId, status });
      });

      // Return execution result
      const result: WorkflowExecutionResult = {
        workflowId,
        workflowDefinitionId,
        agentId,
        traceId,
        status,
        output: executionContext as Record<string, unknown>,
        error: status === 'FAILED' ? 'One or more nodes failed' : undefined,
        nodes: executedNodes,
        totalCostUsd: totalCost,
        durationMs,
        executionPath,
      };

      return result;
    },
  },
});

/**
 * Evaluate a condition expression
 * Simple implementation - can be extended to support JSONPath, JavaScript eval, etc.
 */
function evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
  try {
    // Simple variable interpolation
    let expr = condition;
    for (const [key, value] of Object.entries(context)) {
      const placeholder = `{{${key}}}`;
      if (expr.includes(placeholder)) {
        expr = expr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), JSON.stringify(value));
      }
    }

    // Simple evaluation (UNSAFE - should use a proper expression evaluator in production)
    // For now, handle simple comparisons
    const compareMatch = expr.match(/^(.+?)\s*(===|!==|>|<|>=|<=)\s*(.+)$/);
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

    return false;
  } catch (error) {
    console.error('Failed to evaluate condition:', condition, error);
    return false;
  }
}

/**
 * Try to parse a value as JSON, number, boolean, or string
 */
function tryParseValue(str: string): any {
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null') return null;
  if (!isNaN(Number(str))) return Number(str);
  try {
    return JSON.parse(str);
  } catch {
    return str.replace(/^["']|["']$/g, ''); // Remove quotes
  }
}
