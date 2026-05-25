import { WorkflowDAG } from '../types/workflow-dag.js';

/**
 * DAG Validation Utilities
 * 
 * Validates workflow DAGs for correctness:
 * - No cycles (acyclic)
 * - All nodes reachable
 * - Valid references
 * - Proper structure
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a complete workflow DAG
 */
export function validateDAG(dag: WorkflowDAG, entryNodeId: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic structure checks
  if (dag.nodes.length === 0) {
    errors.push('DAG must have at least one node');
    return { valid: false, errors, warnings };
  }

  const nodeIds = new Set(dag.nodes.map(n => n.id));
  
  // Check for duplicate node IDs
  if (nodeIds.size !== dag.nodes.length) {
    errors.push('Duplicate node IDs found');
  }

  // Check entry node exists
  if (!nodeIds.has(entryNodeId)) {
    errors.push(`Entry node '${entryNodeId}' does not exist in DAG`);
  }

  // Validate edges
  for (const edge of dag.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge '${edge.id}': source node '${edge.from}' does not exist`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge '${edge.id}': target node '${edge.to}' does not exist`);
    }
  }

  // Check for cycles
  if (hasCycle(dag)) {
    errors.push('DAG contains cycles (must be acyclic)');
  }

  // Check reachability from entry node
  const reachable = getReachableNodes(dag, entryNodeId);
  const unreachable = Array.from(nodeIds).filter(id => !reachable.has(id));
  if (unreachable.length > 0) {
    warnings.push(`Unreachable nodes: ${unreachable.join(', ')}`);
  }

  // Check for orphaned nodes (no incoming or outgoing edges, except entry)
  const nodesWithEdges = new Set<string>();
  dag.edges.forEach(edge => {
    nodesWithEdges.add(edge.from);
    nodesWithEdges.add(edge.to);
  });
  
  const orphaned = Array.from(nodeIds).filter(
    id => !nodesWithEdges.has(id) && id !== entryNodeId
  );
  if (orphaned.length > 0) {
    warnings.push(`Orphaned nodes (no edges): ${orphaned.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect cycles in DAG using DFS
 */
export function hasCycle(dag: WorkflowDAG): boolean {
  const adjList = buildAdjacencyList(dag);
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true; // Cycle detected
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of dag.nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}

/**
 * Get all nodes reachable from a starting node
 */
export function getReachableNodes(dag: WorkflowDAG, startNodeId: string): Set<string> {
  const adjList = buildAdjacencyList(dag);
  const reachable = new Set<string>();

  function dfs(nodeId: string) {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }
  }

  dfs(startNodeId);
  return reachable;
}

/**
 * Build adjacency list from DAG
 */
export function buildAdjacencyList(dag: WorkflowDAG): Map<string, string[]> {
  const adjList = new Map<string, string[]>();

  // Initialize all nodes
  for (const node of dag.nodes) {
    adjList.set(node.id, []);
  }

  // Add edges
  for (const edge of dag.edges) {
    const neighbors = adjList.get(edge.from) || [];
    neighbors.push(edge.to);
    adjList.set(edge.from, neighbors);
  }

  return adjList;
}

/**
 * Compute in-degree for all nodes (number of incoming edges)
 */
export function computeInDegree(dag: WorkflowDAG): Map<string, number> {
  const inDegree = new Map<string, number>();

  // Initialize all nodes with 0
  for (const node of dag.nodes) {
    inDegree.set(node.id, 0);
  }

  // Count incoming edges
  for (const edge of dag.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  return inDegree;
}

/**
 * Get topological sort of DAG (execution order)
 * Returns null if DAG has cycles
 */
export function topologicalSort(dag: WorkflowDAG): string[] | null {
  if (hasCycle(dag)) return null;

  const adjList = buildAdjacencyList(dag);
  const inDegree = computeInDegree(dag);
  const queue: string[] = [];
  const result: string[] = [];

  // Add all nodes with in-degree 0 to queue
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If result doesn't contain all nodes, there's a cycle
  return result.length === dag.nodes.length ? result : null;
}

/**
 * Get all direct children of a node
 */
export function getChildren(dag: WorkflowDAG, nodeId: string): string[] {
  return dag.edges
    .filter(edge => edge.from === nodeId)
    .map(edge => edge.to);
}

/**
 * Get all direct parents of a node
 */
export function getParents(dag: WorkflowDAG, nodeId: string): string[] {
  return dag.edges
    .filter(edge => edge.to === nodeId)
    .map(edge => edge.from);
}

/**
 * Find all entry nodes (nodes with no incoming edges)
 */
export function findEntryNodes(dag: WorkflowDAG): string[] {
  const inDegree = computeInDegree(dag);
  return Array.from(inDegree.entries())
    .filter(([_, degree]) => degree === 0)
    .map(([nodeId, _]) => nodeId);
}

/**
 * Find all exit nodes (nodes with no outgoing edges)
 */
export function findExitNodes(dag: WorkflowDAG): string[] {
  const nodesWithOutgoing = new Set(dag.edges.map(e => e.from));
  return dag.nodes
    .filter(node => !nodesWithOutgoing.has(node.id))
    .map(node => node.id);
}
