# T1.3 Architecture Redesign Summary

## Problem Statement

You correctly identified that the initial implementation had **static, hardcoded workflows** for specific use cases:
- ❌ `EmailApprovalWorkflow.ts` - Hardcoded for email use case
- ❌ `ResearchTaskWorkflow.ts` - Hardcoded for research use case
- ❌ Users couldn't define their own workflows
- ❌ Each new use case required writing a new workflow class

## Solution: Generic Workflow Engine

Redesigned to support **user-defined, dynamic workflows**:

### Architecture

```
┌────────────────────────────────────────────────────────┐
│ User-Defined Workflow Definitions (Data/Config)       │
│  - email-approval-v1.json                              │
│  - research-task-v1.json                               │
│  - custom-workflow.json                                │
└────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│ GenericWorkflowEngine (Workflow Executor)              │
│  - Interprets workflow definitions dynamically         │
│  - Executes steps based on type                        │
│  - Handles durable approvals with ctx.promise()        │
│  - Automatic error handling & retries                  │
└────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│ Step Executors (Pluggable Step Types)                 │
│  ✅ llm      - Call Claude/GPT                         │
│  ✅ api      - Call external APIs                      │
│  ✅ approval - Durable human-in-the-loop gates         │
│  ✅ condition- Branch execution (if-then-else)         │
│  🚧 parallel - Concurrent execution (TODO)             │
│  🚧 loop     - Iterative execution (TODO)              │
└────────────────────────────────────────────────────────┘
```

### Key Features

1. **Workflow as Data**
   - Workflows are JSON/TypeScript config, not code
   - Easy to version, store in DB, build UI editors

2. **Variable Interpolation**
   - `{{variableName}}` - From input
   - `{{stepId.output}}` - From previous steps
   - `{{_agentId}}`, `{{_traceId}}` - Built-in context

3. **Built-in Step Types**
   - LLM calls with automatic cost tracking
   - API calls with error handling
   - Approval gates with durable promises
   - Conditional branching

4. **Extensible**
   - Users can define new step types
   - Workflow definitions can be stored/loaded dynamically
   - Can build visual workflow builder on top

## Example Workflow Definition

```typescript
{
  id: 'email-approval-v1',
  name: 'Email Approval Workflow',
  steps: [
    {
      id: 'draft_email',
      type: 'llm',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        userPrompt: 'Draft email for: {{task}}',
      },
      next: 'check_policy',
    },
    {
      id: 'check_policy',
      type: 'api',
      api: {
        url: '{{_apiUrl}}/api/v1/policy/check',
        method: 'POST',
        body: { riskScore: '{{riskScore}}' },
      },
      next: 'approval_gate',
    },
    {
      id: 'approval_gate',
      type: 'approval',
      approval: {
        requiresApproval: true,
        riskThreshold: 0.7,
      },
      next: 'send_email',
    },
    {
      id: 'send_email',
      type: 'api',
      api: {
        url: '{{_apiUrl}}/api/v1/email/send',
        method: 'POST',
      },
    },
  ],
  startStep: 'draft_email',
}
```

## Usage

```bash
# Execute any user-defined workflow
POST /GenericWorkflowEngine/{unique-key}/run/send
{
  "workflowDefinitionId": "email-approval-v1",
  "agentId": "agent-123",
  "traceId": "trace-456",
  "input": {
    "task": "Draft report",
    "recipient": "team@example.com",
    "riskScore": 0.8
  }
}
```

## Benefits Over Static Workflows

| Feature | Static Workflows | Generic Engine |
|---------|-----------------|----------------|
| **User-Defined** | ❌ Requires coding | ✅ Config-based |
| **Reusable** | ❌ One use case per class | ✅ Templates + variants |
| **Versionable** | ❌ Git only | ✅ DB versioning |
| **UI-Buildable** | ❌ Can't visualize | ✅ Can build editor |
| **Extensible** | ❌ New class per pattern | ✅ Add step types |
| **Dynamic** | ❌ Compile-time | ✅ Runtime |

## Test Results

✅ **All systems operational:**
- GenericWorkflowEngine registered with Restate
- 3 example workflows registered:
  - `email-approval-v1` - Email with LLM + approval
  - `research-task-v1` - Multi-step research
  - `simple-approval-v1` - Generic approval pattern
- Workflows execute and call steps correctly
- Failures are due to missing external services (expected)

## Files Created

```
apps/workflows/src/
├── workflows/
│   ├── generic-engine.ts           # Core workflow executor
│   └── legacy/                      # Old static workflows (deprecated)
│       ├── emailApproval.ts
│       └── researchTask.ts
├── executors/
│   └── step-executor.ts             # Step type implementations
├── types/
│   └── workflow-definition.ts       # Workflow schema (Zod)
├── utils/
│   └── workflow-registry.ts         # Workflow storage/retrieval
├── examples/
│   └── workflow-definitions.ts      # Example workflows
├── server.ts                        # Registers engine + examples
test-generic-engine.sh               # Integration tests
README.md                            # Complete documentation
```

## Next Steps for Production

1. **Database Storage**
   - Store workflow definitions in PostgreSQL
   - Add versioning (v1, v2, etc.)
   - Support workflow templates

2. **API Endpoints**
   ```
   POST   /api/v1/workflows/definitions    # Create workflow
   GET    /api/v1/workflows/definitions    # List workflows
   GET    /api/v1/workflows/definitions/:id # Get workflow
   PUT    /api/v1/workflows/definitions/:id # Update workflow
   DELETE /api/v1/workflows/definitions/:id # Delete workflow
   ```

3. **Visual Workflow Builder**
   - Drag-and-drop workflow editor in dashboard
   - Step library with previews
   - Validation and testing UI

4. **Advanced Step Types**
   - `parallel` - Concurrent execution
   - `loop` - Iterative execution
   - `subworkflow` - Nested workflows
   - `webhook` - Wait for external webhook

5. **Workflow Marketplace**
   - Community-shared workflow templates
   - Import/export workflows
   - Workflow analytics

## Documentation

- **Full README**: `apps/workflows/README.md`
- **Example Definitions**: `apps/workflows/src/examples/workflow-definitions.ts`
- **Implementation Checklist**: `specs/015-restate-durable-execution/checklists/implementation.md`

## Key Insight

The generic engine approach provides **maximum flexibility** while maintaining the benefits of durable execution:
- Users define workflows without coding
- Built-in workflows are reusable templates
- System is extensible for new use cases
- Perfect foundation for visual workflow builder
