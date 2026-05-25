import { WorkflowDefinition } from '../types/workflow-definition.js';

/**
 * Workflow Registry
 * 
 * Manages workflow definitions. In a real implementation, this would:
 * - Store definitions in PostgreSQL
 * - Support versioning
 * - Validate definitions before saving
 * - Cache frequently used definitions
 * 
 * For now, this is an in-memory store for development.
 */

// In-memory workflow definition store
const workflowDefinitions = new Map<string, WorkflowDefinition>();

/**
 * Register a workflow definition
 */
export function registerWorkflowDefinition(definition: WorkflowDefinition): void {
  workflowDefinitions.set(definition.id, definition);
  console.log(`✅ Registered workflow definition: ${definition.name} (${definition.id})`);
}

/**
 * Get a workflow definition by ID
 */
export async function getWorkflowDefinition(id: string): Promise<WorkflowDefinition | null> {
  // TODO: In production, load from PostgreSQL with caching
  return workflowDefinitions.get(id) ?? null;
}

/**
 * List all workflow definitions
 */
export async function listWorkflowDefinitions(filters?: {
  agentId?: string;
  tags?: string[];
}): Promise<WorkflowDefinition[]> {
  let definitions = Array.from(workflowDefinitions.values());

  if (filters?.agentId) {
    definitions = definitions.filter((d) => d.metadata.agentId === filters.agentId);
  }

  if (filters?.tags && filters.tags.length > 0) {
    definitions = definitions.filter((d) =>
      filters.tags!.some((tag) => d.metadata.tags?.includes(tag))
    );
  }

  return definitions;
}

/**
 * Delete a workflow definition
 */
export async function deleteWorkflowDefinition(id: string): Promise<boolean> {
  return workflowDefinitions.delete(id);
}

/**
 * Update a workflow definition
 */
export async function updateWorkflowDefinition(
  id: string,
  updates: Partial<WorkflowDefinition>
): Promise<WorkflowDefinition | null> {
  const existing = workflowDefinitions.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  workflowDefinitions.set(id, updated);
  return updated;
}
