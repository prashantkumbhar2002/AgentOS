import { WorkflowDefinitionDAG } from '../types/workflow-dag.js';

/**
 * Example DAG Workflow Definitions
 * 
 * These demonstrate the new DAG-based workflow format.
 */

/**
 * Example 1: Simple Linear Workflow (Email Approval)
 * 
 * Flow: draft_email → check_policy → approval_gate → send_email → audit_log
 */
export const emailApprovalDAG: WorkflowDefinitionDAG = {
  id: 'email-approval-dag-v1',
  name: 'Email Approval Workflow (DAG)',
  description: 'Draft email with LLM, check policy, get approval if needed, send email',
  version: '1.0.0',
  
  metadata: {
    agentId: 'system-agent',
    createdBy: 'system-user',
    createdAt: new Date().toISOString(),
    tags: ['email', 'approval', 'llm', 'dag'],
  },
  
  dag: {
    nodes: [
      {
        id: 'draft_email',
        type: 'llm',
        name: 'Draft Email',
        description: 'Use LLM to draft professional email',
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          systemPrompt: 'You are an email writing assistant. Draft professional emails.',
          userPrompt: 'Draft an email for: {{task}}',
          maxTokens: 1024,
          temperature: 0.7,
        },
        position: { x: 200, y: 100 },
      },
      {
        id: 'check_policy',
        type: 'api',
        name: 'Check Policy',
        description: 'Check if email requires approval',
        config: {
          url: '{{_apiUrl}}/api/v1/policy/check',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            agentId: '{{_agentId}}',
            action: 'send_email',
            riskScore: '{{riskScore}}',
          },
        },
        position: { x: 200, y: 250 },
      },
      {
        id: 'approval_gate',
        type: 'approval',
        name: 'Human Approval Gate',
        description: 'Wait for human approval if required',
        config: {
          requiresApproval: true,
          riskThreshold: 0.7,
          timeoutMs: 86400000, // 24 hours
        },
        position: { x: 200, y: 400 },
      },
      {
        id: 'send_email',
        type: 'api',
        name: 'Send Email',
        description: 'Send the approved email',
        config: {
          url: '{{_apiUrl}}/api/v1/email/send',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            to: '{{recipient}}',
            subject: 'Notification',
            body: '{{draft_email.content}}',
          },
        },
        position: { x: 200, y: 550 },
      },
      {
        id: 'audit_log',
        type: 'api',
        name: 'Create Audit Log',
        description: 'Log workflow execution',
        config: {
          url: '{{_apiUrl}}/api/v1/audit/log',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            workflowId: '{{_workflowId}}',
            action: 'email_sent',
            result: 'success',
          },
        },
        position: { x: 200, y: 700 },
      },
    ],
    edges: [
      { id: 'e1', from: 'draft_email', to: 'check_policy' },
      { id: 'e2', from: 'check_policy', to: 'approval_gate' },
      { id: 'e3', from: 'approval_gate', to: 'send_email' },
      { id: 'e4', from: 'send_email', to: 'audit_log' },
    ],
  },
  
  entryNodeId: 'draft_email',
  
  constraints: {
    maxCostUsd: 1.0,
    maxDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};

/**
 * Example 2: Parallel Execution (Multi-Check Workflow)
 * 
 * Flow: start → [spam_check, sentiment_check, policy_check] (parallel) → aggregate → decide
 */
export const parallelChecksDAG: WorkflowDefinitionDAG = {
  id: 'parallel-checks-dag-v1',
  name: 'Parallel Validation Checks (DAG)',
  description: 'Run multiple validation checks in parallel, then aggregate results',
  version: '1.0.0',
  
  metadata: {
    agentId: 'system-agent',
    createdBy: 'system-user',
    createdAt: new Date().toISOString(),
    tags: ['validation', 'parallel', 'dag'],
  },
  
  dag: {
    nodes: [
      {
        id: 'start',
        type: 'transform',
        name: 'Prepare Input',
        config: {
          script: 'return { text: input.message, timestamp: Date.now() }',
        },
        position: { x: 300, y: 100 },
      },
      {
        id: 'spam_check',
        type: 'api',
        name: 'Spam Check',
        config: {
          url: '{{_apiUrl}}/api/v1/checks/spam',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { text: '{{start.text}}' },
        },
        position: { x: 100, y: 250 },
      },
      {
        id: 'sentiment_check',
        type: 'api',
        name: 'Sentiment Analysis',
        config: {
          url: '{{_apiUrl}}/api/v1/checks/sentiment',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { text: '{{start.text}}' },
        },
        position: { x: 300, y: 250 },
      },
      {
        id: 'policy_check',
        type: 'api',
        name: 'Policy Check',
        config: {
          url: '{{_apiUrl}}/api/v1/policy/check',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { text: '{{start.text}}', agentId: '{{_agentId}}' },
        },
        position: { x: 500, y: 250 },
      },
      {
        id: 'aggregate',
        type: 'transform',
        name: 'Aggregate Results',
        config: {
          script: `
            return {
              spam: input.spam_check,
              sentiment: input.sentiment_check,
              policy: input.policy_check,
              allPassed: input.spam_check.passed && input.sentiment_check.passed && input.policy_check.passed
            }
          `,
        },
        position: { x: 300, y: 400 },
      },
      {
        id: 'decide',
        type: 'condition',
        name: 'Decision',
        description: 'Decide whether to approve or reject',
        config: {
          expression: '{{aggregate.allPassed}} === true',
        },
        position: { x: 300, y: 550 },
      },
    ],
    edges: [
      // Fork: start -> 3 parallel checks
      { id: 'e1', from: 'start', to: 'spam_check' },
      { id: 'e2', from: 'start', to: 'sentiment_check' },
      { id: 'e3', from: 'start', to: 'policy_check' },
      
      // Join: all checks -> aggregate
      { id: 'e4', from: 'spam_check', to: 'aggregate' },
      { id: 'e5', from: 'sentiment_check', to: 'aggregate' },
      { id: 'e6', from: 'policy_check', to: 'aggregate' },
      
      // Decision
      { id: 'e7', from: 'aggregate', to: 'decide' },
    ],
  },
  
  entryNodeId: 'start',
  
  constraints: {
    maxCostUsd: 0.5,
    maxDurationMs: 5 * 60 * 1000, // 5 minutes
  },
};

/**
 * Example 3: Conditional Branching (Risk-Based Routing)
 * 
 * Flow: assess_risk → (if high) manual_review | (if low) auto_approve → complete
 */
export const conditionalRoutingDAG: WorkflowDefinitionDAG = {
  id: 'conditional-routing-dag-v1',
  name: 'Risk-Based Conditional Routing (DAG)',
  description: 'Route to manual review or auto-approve based on risk score',
  version: '1.0.0',
  
  metadata: {
    agentId: 'system-agent',
    createdBy: 'system-user',
    createdAt: new Date().toISOString(),
    tags: ['conditional', 'routing', 'approval', 'dag'],
  },
  
  dag: {
    nodes: [
      {
        id: 'assess_risk',
        type: 'api',
        name: 'Assess Risk',
        description: 'Calculate risk score for action',
        config: {
          url: '{{_apiUrl}}/api/v1/risk/assess',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            action: '{{action}}',
            agentId: '{{_agentId}}',
            context: '{{context}}',
          },
        },
        position: { x: 300, y: 100 },
      },
      {
        id: 'low_risk_path',
        type: 'api',
        name: 'Auto Approve (Low Risk)',
        config: {
          url: '{{_apiUrl}}/api/v1/actions/execute',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            action: '{{action}}',
            approved: true,
            approver: 'system',
          },
        },
        position: { x: 150, y: 300 },
      },
      {
        id: 'high_risk_path',
        type: 'approval',
        name: 'Manual Review (High Risk)',
        config: {
          requiresApproval: true,
          riskThreshold: 0.5,
          timeoutMs: 7200000, // 2 hours
        },
        position: { x: 450, y: 300 },
      },
      {
        id: 'complete',
        type: 'api',
        name: 'Complete',
        description: 'Mark action as complete',
        config: {
          url: '{{_apiUrl}}/api/v1/actions/complete',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            workflowId: '{{_workflowId}}',
            status: 'completed',
          },
        },
        position: { x: 300, y: 450 },
      },
    ],
    edges: [
      // Conditional branches
      {
        id: 'e1',
        from: 'assess_risk',
        to: 'low_risk_path',
        condition: '{{assess_risk.riskScore}} < 0.5',
        label: 'Low Risk',
      },
      {
        id: 'e2',
        from: 'assess_risk',
        to: 'high_risk_path',
        condition: '{{assess_risk.riskScore}} >= 0.5',
        label: 'High Risk',
      },
      
      // Both paths converge at complete
      { id: 'e3', from: 'low_risk_path', to: 'complete' },
      { id: 'e4', from: 'high_risk_path', to: 'complete' },
    ],
  },
  
  entryNodeId: 'assess_risk',
  
  constraints: {
    maxCostUsd: 0.2,
    maxDurationMs: 4 * 60 * 60 * 1000, // 4 hours
  },
};
