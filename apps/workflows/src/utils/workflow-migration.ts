import { WorkflowDefinition, WorkflowStep } from '../types/workflow-definition.js';
import {
  WorkflowDefinitionDAG,
  Node,
  Edge,
  LLMNodeConfig,
  APINodeConfig,
  ApprovalNodeConfig,
  ConditionNodeConfig,
} from '../types/workflow-dag.js';

/**
 * Migration Utilities
 * 
 * Convert legacy sequential workflows to DAG format.
 */

/**
 * Convert a legacy workflow definition to DAG format
 */
export function convertSequentialToDAG(legacy: WorkflowDefinition): WorkflowDefinitionDAG {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Convert each step to a node
  for (const step of legacy.steps) {
    const node = convertStepToNode(step);
    nodes.push(node);

    // Create edges based on 'next' property
    if (step.next) {
      const nextSteps = Array.isArray(step.next) ? step.next : [step.next];
      
      for (const nextStepId of nextSteps) {
        // Check if this is a conditional edge
        if (step.condition) {
          // Create two conditional edges
          edges.push({
            id: `edge_${step.id}_to_${step.condition.onTrue}`,
            from: step.id,
            to: step.condition.onTrue,
            condition: step.condition.expression,
            label: 'True',
          });
          
          edges.push({
            id: `edge_${step.id}_to_${step.condition.onFalse}`,
            from: step.id,
            to: step.condition.onFalse,
            condition: `!(${step.condition.expression})`,
            label: 'False',
          });
        } else {
          edges.push({
            id: `edge_${step.id}_to_${nextStepId}`,
            from: step.id,
            to: nextStepId,
          });
        }
      }
    }
  }

  // Auto-layout: position nodes in a column
  nodes.forEach((node, index) => {
    node.position = {
      x: 200,
      y: 100 + index * 120,
    };
  });

  return {
    id: legacy.id,
    name: legacy.name,
    description: legacy.description,
    version: legacy.version,
    metadata: legacy.metadata,
    dag: {
      nodes,
      edges,
    },
    entryNodeId: legacy.startStep,
    inputSchema: legacy.inputSchema,
    outputSchema: legacy.outputSchema,
    constraints: legacy.constraints,
  };
}

/**
 * Convert a workflow step to a DAG node
 */
function convertStepToNode(step: WorkflowStep): Node {
  let config: any;

  switch (step.type) {
    case 'llm':
      if (!step.llm) throw new Error(`LLM step ${step.id} missing llm config`);
      config = {
        provider: step.llm.provider,
        model: step.llm.model,
        systemPrompt: step.llm.systemPrompt,
        userPrompt: step.llm.userPrompt,
        maxTokens: step.llm.maxTokens,
        temperature: step.llm.temperature,
      } as LLMNodeConfig;
      break;

    case 'api':
      if (!step.api) throw new Error(`API step ${step.id} missing api config`);
      config = {
        url: step.api.url,
        method: step.api.method,
        headers: step.api.headers,
        body: step.api.body,
      } as APINodeConfig;
      break;

    case 'approval':
      if (!step.approval) throw new Error(`Approval step ${step.id} missing approval config`);
      config = {
        requiresApproval: step.approval.requiresApproval,
        riskThreshold: step.approval.riskThreshold,
        approvers: step.approval.approvers,
        timeoutMs: step.approval.timeoutMs,
      } as ApprovalNodeConfig;
      break;

    case 'condition':
      if (!step.condition) throw new Error(`Condition step ${step.id} missing condition config`);
      config = {
        expression: step.condition.expression,
      } as ConditionNodeConfig;
      break;

    default:
      // For other types, create a generic transform node
      config = {
        script: '// Legacy step type: ' + step.type,
      };
      break;
  }

  return {
    id: step.id,
    type: step.type as any,
    name: step.name,
    description: step.description,
    config,
    retry: step.retry,
  };
}

/**
 * Batch convert all workflows in a registry from sequential to DAG
 */
export async function migrateAllWorkflows(
  getWorkflows: () => Promise<WorkflowDefinition[]>,
  saveWorkflow: (workflow: WorkflowDefinitionDAG) => Promise<void>
): Promise<{
  migrated: number;
  failed: number;
  errors: Array<{ workflowId: string; error: string }>;
}> {
  const workflows = await getWorkflows();
  const errors: Array<{ workflowId: string; error: string }> = [];
  let migrated = 0;
  let failed = 0;

  for (const workflow of workflows) {
    try {
      const dagWorkflow = convertSequentialToDAG(workflow);
      await saveWorkflow(dagWorkflow);
      migrated++;
      console.log(`✅ Migrated workflow: ${workflow.id} (${workflow.name})`);
    } catch (error: any) {
      failed++;
      errors.push({
        workflowId: workflow.id,
        error: error.message,
      });
      console.error(`❌ Failed to migrate workflow: ${workflow.id}`, error.message);
    }
  }

  return { migrated, failed, errors };
}
