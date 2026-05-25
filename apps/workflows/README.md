# Workflow Service - User-Defined Workflow Engine

A **generic, user-defined workflow execution engine** powered by Restate for durable execution.

## Architecture

Instead of hardcoded workflows for specific use cases, this service provides:

1. **Generic Workflow Engine** - Executes user-defined workflows dynamically
2. **Workflow Definition System** - Define workflows as JSON/TypeScript configuration
3. **Built-in Step Types** - LLM calls, API calls, approvals, conditions, loops
4. **Durable Execution** - Automatic crash recovery, long-running approvals (days/weeks)

## Quick Start

### 1. Start the Service

```bash
# Install dependencies
npm install

# Copy environment  
cp .env.example .env

# Start dev server
npm run dev

# Register with Restate (use your host IP from: hostname -I)
curl -X POST http://localhost:9070/deployments \
  -H 'Content-Type: application/json' \
  -d '{"uri": "http://YOUR_HOST_IP:9080", "force": true}'
```

### 2. Execute a Workflow

```bash
# Execute the email approval workflow
curl -X POST http://localhost:8091/GenericWorkflowEngine/my-workflow-001/run/send \
  -H 'Content-Type: application/json' \
  -d '{
    "workflowDefinitionId": "email-approval-v1",
    "agentId": "agent-123",
    "traceId": "trace-456",
    "input": {
      "task": "Draft quarterly report email",
      "recipient": "team@example.com",
      "riskScore": 0.8,
      "_apiUrl": "http://localhost:3000"
    }
  }'
```

## Workflow Definition

Workflows are defined as structured configuration objects, not hardcoded TypeScript classes.

### Example: Email Approval Workflow

```typescript
const emailWorkflow: WorkflowDefinition = {
  id: 'email-approval-v1',
  name: 'Email Approval Workflow',
  description: 'Draft email, check policy, get approval, send',
  
  steps: [
    {
      id: 'draft_email',
      type: 'llm',
      name: 'Draft Email',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are an email assistant.',
        userPrompt: 'Draft an email for: {{task}}',
        maxTokens: 1024,
      },
      next: 'check_policy',
    },
    {
      id: 'check_policy',
      type: 'api',
      name: 'Check Policy',
      api: {
        url: '{{_apiUrl}}/api/v1/policy/check',
        method: 'POST',
        body: {
          agentId: '{{_agentId}}',
          action: 'send_email',
          riskScore: '{{riskScore}}',
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
        riskThreshold: 0.7,
      },
      next: 'send_email',
    },
    {
      id: 'send_email',
      type: 'api',
      name: 'Send Email',
      api: {
        url: '{{_apiUrl}}/api/v1/email/send',
        method: 'POST',
        body: {
          to: '{{recipient}}',
          subject: '{{draft_email.content}}',
          body: '{{draft_email.content}}',
        },
      },
    },
  ],
  
  startStep: 'draft_email',
};
```

## Step Types

### 1. LLM Step

Calls an LLM (Claude, GPT) with prompts.

```typescript
{
  type: 'llm',
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    systemPrompt: 'You are a helpful assistant.',
    userPrompt: 'Answer this: {{question}}',
    maxTokens: 2048,
    temperature: 0.7,
  }
}
```

**Supports:**
- Variable interpolation: `{{variableName}}`
- Previous step outputs: `{{stepId.content}}`
- Automatic cost tracking

### 2. API Step

Calls external APIs.

```typescript
{
  type: 'api',
  api: {
    url: 'https://api.example.com/endpoint',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer {{apiKey}}',
    },
    body: {
      param: '{{inputValue}}',
    },
  }
}
```

**Supports:**
- Variable interpolation in URL, headers, body
- All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Automatic error handling and retries

### 3. Approval Step

Creates approval gates that durably wait for human input.

```typescript
{
  type: 'approval',
  approval: {
    requiresApproval: true,
    riskThreshold: 0.7,  // Auto-approve if risk < 0.7
    approvers: ['user@example.com'],
    timeoutMs: 86400000,  // 24 hours
  }
}
```

**Features:**
- **Durable waits** - No polling, uses `ctx.promise()`
- **Survives restarts** - Workflow suspends and resumes automatically
- **Risk-based** - Auto-approve low-risk actions
- **Timeout support** - Optional expiration

### 4. Condition Step

Branch execution based on conditions.

```typescript
{
  type: 'condition',
  condition: {
    expression: 'check_policy.requiresApproval === true',
    onTrue: 'approval_gate',
    onFalse: 'execute_action',
  }
}
```

### 5. Parallel Step (Coming Soon)

Execute multiple steps concurrently.

### 6. Loop Step (Coming Soon)

Repeat steps based on conditions or arrays.

## Variable Interpolation

Use `{{variableName}}` syntax to reference:

- **Input variables**: `{{task}}`, `{{recipient}}`
- **Step outputs**: `{{draft_email.content}}`, `{{check_policy.decision}}`
- **Built-in variables**:
  - `{{_agentId}}` - Agent ID from execution input
  - `{{_traceId}}` - Trace ID for audit trail
  - `{{_apiUrl}}` - AgentOS API base URL

## Defining Custom Workflows

### Option 1: Register at Runtime (Development)

```typescript
import { registerWorkflowDefinition } from './utils/workflow-registry.js';

const myWorkflow: WorkflowDefinition = {
  id: 'my-custom-workflow',
  name: 'My Custom Workflow',
  steps: [/* ... */],
  startStep: 'first_step',
};

registerWorkflowDefinition(myWorkflow);
```

### Option 2: API-Based Registration (Production)

```bash
# TODO: Implement POST /api/v1/workflows/definitions
curl -X POST http://localhost:3000/api/v1/workflows/definitions \
  -H 'Content-Type: application/json' \
  -d @my-workflow.json
```

### Option 3: Database Storage (Production)

Store workflow definitions in PostgreSQL `WorkflowDefinition` table with versioning.

## Example Workflows

### Simple Approval

Generic approval workflow for any action:

```typescript
{
  id: 'simple-approval-v1',
  steps: [
    { type: 'api', /* check policy */ },
    { type: 'approval', /* wait for human */ },
    { type: 'api', /* execute action */ },
  ]
}
```

### Multi-Step Research

Research workflow with LLM calls:

```typescript
{
  id: 'research-task-v1',
  steps: [
    { type: 'llm', /* generate plan */ },
    { type: 'llm', /* execute research */ },
    { type: 'llm', /* synthesize findings */ },
  ]
}
```

### Conditional Workflow

Branch based on risk score:

```typescript
{
  steps: [
    { type: 'api', /* check risk */ },
    { 
      type: 'condition',
      condition: {
        expression: 'risk > 0.8',
        onTrue: 'high_risk_approval',
        onFalse: 'auto_execute',
      }
    },
  ]
}
```

## Monitoring & Debugging

```bash
# Check workflow execution status
curl http://localhost:9070/invocations/{invocation-id}

# View Restate admin UI
open http://localhost:9070

# Check workflow service logs
docker logs abl-restate --tail 50

# List all workflow definitions
# TODO: GET /api/v1/workflows/definitions
```

## Project Structure

```
apps/workflows/
├── src/
│   ├── server.ts                   # Entry point, registers engine
│   ├── workflows/
│   │   ├── generic-engine.ts       # Core workflow execution engine
│   │   └── legacy/                 # Old static workflows (deprecated)
│   ├── executors/
│   │   └── step-executor.ts        # Step type execution logic
│   ├── types/
│   │   └── workflow-definition.ts  # Workflow schema definitions
│   ├── utils/
│   │   ├── workflow-registry.ts    # Workflow storage/retrieval
│   │   ├── anthropic.ts            # LLM client
│   │   ├── cost-calculator.ts      # Cost tracking
│   │   └── agentos-client.ts       # AgentOS API client
│   ├── examples/
│   │   └── workflow-definitions.ts # Example workflows
│   └── config/
│       └── env.ts                  # Environment validation
├── test-workflows.sh               # Integration tests
├── package.json
└── Dockerfile
```

## Next Steps

1. **Add API endpoints** for workflow definition management (CRUD)
2. **Database storage** for workflow definitions with versioning
3. **Dashboard integration** to visualize workflow executions
4. **Advanced step types**: parallel execution, loops, sub-workflows
5. **Workflow templates** library for common patterns
6. **Visual workflow builder** UI

## FAQ

**Q: How do I add a new step type?**  
A: Extend the `WorkflowStepSchema` in `types/workflow-definition.ts` and add execution logic in `executors/step-executor.ts`.

**Q: Can workflows call other workflows?**  
A: Not yet, but this is planned as a "sub-workflow" step type.

**Q: How long can approval waits last?**  
A: Days or weeks. Workflows durably suspend using Restate promises, consuming zero resources while waiting.

**Q: What happens if the service crashes during execution?**  
A: Restate automatically resumes from the last completed step when the service restarts.

**Q: Can I use my own LLM provider?**  
A: Currently supports Anthropic (Claude). OpenAI support coming soon. You can also call your LLM via API steps.

## See Also

- [Restate Documentation](https://docs.restate.dev/)
- [AgentOS Governance SDK](../../packages/governance-sdk/)
- [Workflow Specification](../../specs/015-restate-durable-execution/spec.md)
