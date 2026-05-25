import { WorkflowDefinition } from '../types/workflow-definition.js';
import { WorkflowDefinitionDAG } from '../types/workflow-dag.js';
import { getPrismaClient } from '../config/database.js';
import type { WorkflowDefinition as PrismaWorkflowDefinition } from '@prisma/client';

/**
 * Workflow Registry with PostgreSQL Backend
 * 
 * Stores workflow definitions in PostgreSQL with support for both:
 * - Legacy sequential workflows (steps + next)
 * - Modern DAG workflows (nodes + edges)
 */

/**
 * Union type for both workflow formats
 */
export type AnyWorkflowDefinition = WorkflowDefinition | WorkflowDefinitionDAG;

/**
 * Convert Prisma model to workflow definition
 */
function toWorkflowDefinition(prismaWorkflow: PrismaWorkflowDefinition): AnyWorkflowDefinition {
  return prismaWorkflow.definition as unknown as AnyWorkflowDefinition;
}

/**
 * Register a workflow definition (create or update)
 * Supports both legacy and DAG formats
 */
export async function registerWorkflowDefinition(
  definition: AnyWorkflowDefinition
): Promise<void> {
  const prisma = getPrismaClient();

  // Determine if this is a DAG workflow
  const isDag = 'dag' in definition && 'entryNodeId' in definition;
  const dagDef = definition as WorkflowDefinitionDAG;

  await prisma.workflowDefinition.upsert({
    where: { id: definition.id },
    create: {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      version: definition.version,
      status: 'ACTIVE',
      definition: definition as any, // Stored as JSONB
      isDag,
      entryNodeId: isDag ? dagDef.entryNodeId : null,
      inputSchema: definition.inputSchema as any,
      outputSchema: definition.outputSchema as any,
      agentId: definition.metadata.agentId,
      createdBy: definition.metadata.createdBy,
      tags: definition.metadata.tags || [],
      maxCostUsd: definition.constraints?.maxCostUsd,
      maxDurationMs: definition.constraints?.maxDurationMs,
    },
    update: {
      name: definition.name,
      description: definition.description,
      version: definition.version,
      definition: definition as any,
      isDag,
      entryNodeId: isDag ? dagDef.entryNodeId : null,
      inputSchema: definition.inputSchema as any,
      outputSchema: definition.outputSchema as any,
      tags: definition.metadata.tags || [],
      maxCostUsd: definition.constraints?.maxCostUsd,
      maxDurationMs: definition.constraints?.maxDurationMs,
      updatedAt: new Date(),
    },
  });

  console.log(`✅ Registered workflow definition: ${definition.name} (${definition.id}) [${isDag ? 'DAG' : 'Sequential'}]`);
}

/**
 * Get a workflow definition by ID
 */
export async function getWorkflowDefinition(id: string): Promise<AnyWorkflowDefinition | null> {
  const prisma = getPrismaClient();

  const workflow = await prisma.workflowDefinition.findUnique({
    where: { id },
  });

  if (!workflow) return null;
  return toWorkflowDefinition(workflow);
}

/**
 * List all workflow definitions
 */
export async function listWorkflowDefinitions(filters?: {
  agentId?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  tags?: string[];
  isDag?: boolean;
}): Promise<AnyWorkflowDefinition[]> {
  const prisma = getPrismaClient();

  const workflows = await prisma.workflowDefinition.findMany({
    where: {
      ...(filters?.agentId && { agentId: filters.agentId }),
      ...(filters?.status && { status: filters.status }),
      ...(filters?.isDag !== undefined && { isDag: filters.isDag }),
      ...(filters?.tags && {
        tags: {
          hasSome: filters.tags,
        },
      }),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return workflows.map(toWorkflowDefinition);
}

/**
 * Delete a workflow definition
 */
export async function deleteWorkflowDefinition(id: string): Promise<boolean> {
  const prisma = getPrismaClient();

  try {
    await prisma.workflowDefinition.delete({
      where: { id },
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Update a workflow definition
 */
export async function updateWorkflowDefinition(
  id: string,
  updates: Partial<AnyWorkflowDefinition>
): Promise<AnyWorkflowDefinition | null> {
  const prisma = getPrismaClient();

  try {
    const workflow = await prisma.workflowDefinition.update({
      where: { id },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description && { description: updates.description }),
        ...(updates.version && { version: updates.version }),
        ...(updates.inputSchema && { inputSchema: updates.inputSchema as any }),
        ...(updates.outputSchema && { outputSchema: updates.outputSchema as any }),
        ...(updates.metadata?.tags && { tags: updates.metadata.tags }),
        ...(updates.constraints?.maxCostUsd && { maxCostUsd: updates.constraints.maxCostUsd }),
        ...(updates.constraints?.maxDurationMs && { maxDurationMs: updates.constraints.maxDurationMs }),
        updatedAt: new Date(),
      },
    });

    return toWorkflowDefinition(workflow);
  } catch (error) {
    return null;
  }
}

/**
 * Update workflow execution stats
 */
export async function updateWorkflowStats(
  id: string,
  success: boolean
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.workflowDefinition.update({
    where: { id },
    data: {
      executionCount: { increment: 1 },
      ...(success 
        ? { successCount: { increment: 1 } } 
        : { failureCount: { increment: 1 } }
      ),
    },
  });
}
