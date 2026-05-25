import { WorkflowDefinition } from '../types/workflow-definition.js';

/**
 * Example: Email Approval Workflow Definition
 * 
 * This shows how users can define an email approval workflow as data/config
 * instead of hardcoded TypeScript.
 */
export const emailApprovalWorkflowDefinition: WorkflowDefinition = {
  id: 'email-approval-v1',
  name: 'Email Approval Workflow',
  description: 'Draft email with LLM, check policy, get approval if needed, send email',
  version: '1.0.0',
  
  metadata: {
    agentId: 'system',
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    tags: ['email', 'approval', 'llm'],
  },
  
  constraints: {
    maxCostUsd: 1.0,
    maxDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  
  steps: [
    {
      id: 'draft_email',
      type: 'llm',
      name: 'Draft Email',
      description: 'Use LLM to draft professional email',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are an email writing assistant. Draft professional emails. Format your response as:\nSubject: <subject line>\n\n<email body>',
        userPrompt: 'Draft an email for this task: {{task}}',
        maxTokens: 1024,
      },
      next: 'check_policy',
    },
    {
      id: 'check_policy',
      type: 'api',
      name: 'Check Policy',
      description: 'Check if email requires approval based on risk score',
      api: {
        url: '{{_apiUrl}}/api/v1/policy/check',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          agentId: '{{_agentId}}',
          action: 'send_email',
          riskScore: '{{riskScore}}',
          context: {
            recipient: '{{recipient}}',
            subject: '{{draft_email.content}}',
          },
        },
      },
      next: 'approval_gate',
    },
    {
      id: 'approval_gate',
      type: 'approval',
      name: 'Human Approval Gate',
      description: 'Wait for human approval if required by policy',
      approval: {
        requiresApproval: true,
        riskThreshold: 0.7,
        timeoutMs: 24 * 60 * 60 * 1000, // 24 hours
      },
      next: 'send_email',
    },
    {
      id: 'send_email',
      type: 'api',
      name: 'Send Email',
      description: 'Send the approved email',
      api: {
        url: '{{_apiUrl}}/api/v1/email/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          to: '{{recipient}}',
          subject: '{{draft_email.content}}',
          body: '{{draft_email.content}}',
        },
      },
      next: 'create_audit_log',
    },
    {
      id: 'create_audit_log',
      type: 'api',
      name: 'Create Audit Log',
      description: 'Log the completed workflow execution',
      api: {
        url: '{{_apiUrl}}/api/v1/audit/logs',
        method: 'POST',
        body: {
          agentId: '{{_agentId}}',
          traceId: '{{_traceId}}',
          action: 'send_email',
          status: 'completed',
        },
      },
    },
  ],
  
  startStep: 'draft_email',
};

/**
 * Example: Research Task Workflow Definition
 */
export const researchTaskWorkflowDefinition: WorkflowDefinition = {
  id: 'research-task-v1',
  name: 'Multi-Step Research Task',
  description: 'Generate research plan, execute steps, synthesize findings',
  version: '1.0.0',
  
  metadata: {
    agentId: 'system',
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    tags: ['research', 'llm', 'multi-step'],
  },
  
  constraints: {
    maxCostUsd: 2.0,
    maxDurationMs: 60 * 60 * 1000, // 1 hour
  },
  
  steps: [
    {
      id: 'generate_plan',
      type: 'llm',
      name: 'Generate Research Plan',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are a research planning assistant. Create a structured research plan with specific queries.',
        userPrompt: 'Create a research plan for: {{topic}}\nDepth: {{depth}}',
        maxTokens: 1024,
      },
      next: 'execute_research',
    },
    {
      id: 'execute_research',
      type: 'llm',
      name: 'Execute Research Steps',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are a research assistant. Conduct thorough research on the given topic.',
        userPrompt: 'Research this topic based on the plan:\n\nPlan: {{generate_plan.content}}\nTopic: {{topic}}',
        maxTokens: 4096,
      },
      next: 'synthesize_findings',
    },
    {
      id: 'synthesize_findings',
      type: 'llm',
      name: 'Synthesize Findings',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are a research synthesizer. Create a concise summary of research findings.',
        userPrompt: 'Synthesize these research findings:\n\n{{execute_research.content}}',
        maxTokens: 2048,
      },
    },
  ],
  
  startStep: 'generate_plan',
};

/**
 * Example: Simple Approval Workflow (No LLM)
 */
export const simpleApprovalWorkflowDefinition: WorkflowDefinition = {
  id: 'simple-approval-v1',
  name: 'Simple Approval Workflow',
  description: 'Generic approval workflow for any action',
  version: '1.0.0',
  
  metadata: {
    agentId: 'system',
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    tags: ['approval', 'generic'],
  },
  
  steps: [
    {
      id: 'check_policy',
      type: 'api',
      name: 'Check Policy',
      api: {
        url: '{{_apiUrl}}/api/v1/policy/check',
        method: 'POST',
        body: {
          agentId: '{{_agentId}}',
          action: '{{action}}',
          riskScore: '{{riskScore}}',
          context: '{{context}}',
        },
      },
      next: 'approval_gate',
    },
    {
      id: 'approval_gate',
      type: 'approval',
      name: 'Human Approval',
      approval: {
        requiresApproval: true,
        riskThreshold: 0.5,
      },
      next: 'execute_action',
    },
    {
      id: 'execute_action',
      type: 'api',
      name: 'Execute Action',
      api: {
        url: '{{actionUrl}}',
        method: 'POST',
        body: '{{actionPayload}}',
      },
    },
  ],
  
  startStep: 'check_policy',
};
