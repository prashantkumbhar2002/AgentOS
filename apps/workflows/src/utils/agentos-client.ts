import { getEnv } from '../config/env.js';

/**
 * Client for calling AgentOS API from workflow handlers
 */

const env = getEnv();
const API_BASE_URL = env.AGENTOS_API_URL;

/**
 * Check policy for a given action
 */
export async function checkPolicy(params: {
  agentId: string;
  action: string;
  riskScore: number;
  context: Record<string, unknown>;
}): Promise<{
  decision: 'allow' | 'deny' | 'approve';
  requiresApproval: boolean;
  policyId: string;
  reason?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/policy/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Policy check failed: ${response.statusText}`);
  }

  return (await response.json()) as {
    decision: 'allow' | 'deny' | 'approve';
    requiresApproval: boolean;
    policyId: string;
    reason?: string;
  };
}

/**
 * Create approval ticket
 */
export async function createApprovalTicket(params: {
  agentId: string;
  traceId: string;
  action: string;
  reasoning: string;
  payload: Record<string, unknown>;
  riskScore: number;
  restateWorkflowId: string;
  restatePromiseName: string;
}): Promise<{
  ticketId: string;
  status: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to create approval ticket: ${response.statusText}`);
  }

  return (await response.json()) as { ticketId: string; status: string };
}

/**
 * Create audit log entry
 */
export async function createAuditLog(params: {
  agentId: string;
  traceId: string;
  workflowId: string;
  action: string;
  status: string;
  metadata: Record<string, unknown>;
}): Promise<{ logId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/audit/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to create audit log: ${response.statusText}`);
  }

  return (await response.json()) as { logId: string };
}

/**
 * Record workflow execution
 */
export async function recordWorkflowExecution(params: {
  workflowId: string;
  workflowType: string;
  agentId: string;
  status: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}): Promise<{ executionId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/workflows/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to record workflow execution: ${response.statusText}`);
  }

  return (await response.json()) as { executionId: string };
}
