# Restate Integration: Quick Start Guide

**For developers implementing the Restate integration**

---

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL client (psql)
- Familiarity with AgentOS architecture

---

## Local Development Setup (30 minutes)

### Step 1: Install Dependencies

```bash
# 1. Install Restate SDK in workflow service
cd apps/workflows
npm install @restatedev/restate-sdk@^1.3.0

# 2. Install Restate client in API
cd ../api
npm install @restatedev/restate-sdk-clients@^1.3.0

# 3. Install Restate client in SDK
cd ../../packages/governance-sdk
npm install @restatedev/restate-sdk-clients@^1.3.0
```

### Step 2: Start Restate Runtime

```bash
# Add to docker-compose.yml (or use provided version)
docker-compose up -d restate

# Verify it's running
curl http://localhost:9070/health
# Should return: {"status":"ok"}

# Access admin UI
open http://localhost:9070
```

### Step 3: Create Your First Workflow

```typescript
// apps/workflows/src/workflows/hello.ts
import * as restate from '@restatedev/restate-sdk';

const helloWorkflow = restate.workflow({
  name: 'hello',
  
  handlers: {
    run: async (ctx: restate.WorkflowContext, name: string) => {
      // Step 1: Durable greeting
      const greeting = await ctx.run('generate-greeting', async () => {
        return `Hello, ${name}! Workflow ID: ${ctx.key}`;
      });

      // Step 2: Wait for confirmation (5 seconds for demo)
      try {
        const confirmed = await ctx.promise<boolean>('confirmation')
          .orTimeout(5000);
        
        if (confirmed) {
          return { greeting, confirmed: true };
        } else {
          return { greeting, confirmed: false };
        }
      } catch {
        return { greeting, confirmed: false, reason: 'timeout' };
      }
    },
  },
});

// Start server
restate
  .endpoint()
  .bind(helloWorkflow)
  .listen(9080);

console.log('Workflow service listening on :9080');
```

### Step 4: Register Workflow with Restate

```bash
# Register the workflow service
curl -X POST http://localhost:9070/deployments \
  -H 'Content-Type: application/json' \
  -d '{
    "uri": "http://localhost:9080",
    "force": true
  }'

# Verify registration
curl http://localhost:9070/services
# Should list "hello" workflow
```

### Step 5: Invoke Your Workflow

```bash
# Invoke workflow (returns immediately)
curl -X POST http://localhost:8080/hello/test-123/run \
  -H 'Content-Type: application/json' \
  -d '"World"'

# Response:
# {
#   "invocationId": "..."
# }

# Check status
curl http://localhost:8080/hello/test-123/getStatus

# Resolve promise (simulate approval)
curl -X POST http://localhost:9070/workflows/hello/test-123/promises/confirmation/resolve \
  -H 'Content-Type: application/json' \
  -d 'true'

# Check final result
curl http://localhost:8080/hello/test-123/getStatus
# {
#   "greeting": "Hello, World! Workflow ID: test-123",
#   "confirmed": true
# }
```

---

## Testing Crash Recovery

```bash
# 1. Start workflow
curl -X POST http://localhost:8080/hello/crash-test/run \
  -H 'Content-Type: application/json' \
  -d '"Crash Test"'

# 2. Kill the workflow service
docker-compose kill workflows

# 3. Restart it
docker-compose up -d workflows

# 4. Resolve promise (workflow should resume)
curl -X POST http://localhost:9070/workflows/hello/crash-test/promises/confirmation/resolve \
  -H 'Content-Type: application/json' \
  -d 'true'

# 5. Verify result (should show completed)
curl http://localhost:8080/hello/crash-test/getStatus
```

✅ If the workflow completed successfully, crash recovery works!

---

## Key Concepts

### 1. Durable Steps with `ctx.run()`

```typescript
// ❌ BAD: Direct execution (not durable)
const result = await someAsyncOperation();

// ✅ GOOD: Wrapped in ctx.run (survives crashes)
const result = await ctx.run('step-name', async () => {
  return await someAsyncOperation();
});
```

**Rules:**
- Every external call (DB, HTTP, LLM) must be in `ctx.run()`
- Step names must be unique within workflow
- Result is cached - on replay, doesn't re-execute
- Must be deterministic (same input → same output)

### 2. Durable Promises with `ctx.promise()`

```typescript
// Wait for external event (approval, webhook, etc.)
const approval = await ctx.promise<string>('approval-decision')
  .orTimeout(30 * 60 * 1000); // 30 minutes

// Promise is resolved from outside:
// POST /workflows/{workflow-name}/{key}/promises/{promise-name}/resolve
```

**Use Cases:**
- Human approvals
- Webhook callbacks
- External system confirmations

### 3. Deterministic Helpers

```typescript
// ❌ BAD: Non-deterministic
const id = crypto.randomUUID(); // Different on each replay
const now = Date.now();

// ✅ GOOD: Deterministic
const id = ctx.rand.uuidv4(); // Same on replay
const now = await ctx.date.now();
```

### 4. Workflow Isolation

```typescript
// Each workflow instance has unique state
const workflow1 = await invokeWorkflow('email-approval', 'user-123', data);
const workflow2 = await invokeWorkflow('email-approval', 'user-456', data);
// workflow1 and workflow2 are completely isolated
```

---

## Common Patterns

### Pattern 1: Multi-Step with Approval

```typescript
const workflow = restate.workflow({
  name: 'multi-step',
  
  handlers: {
    run: async (ctx, input) => {
      // Step 1: Preparation
      const draft = await ctx.run('prepare', async () => {
        return await prepareDraft(input);
      });

      // Step 2: Request approval
      const ticketId = await ctx.run('create-ticket', async () => {
        return await createApprovalTicket(draft);
      });

      // Step 3: Wait for decision
      const decision = await ctx.promise<string>('approval')
        .orTimeout(24 * 60 * 60 * 1000); // 24 hours

      // Step 4: Execute or rollback
      if (decision === 'APPROVED') {
        await ctx.run('execute', async () => {
          return await executeAction(draft);
        });
      }

      return { status: decision, ticketId };
    },
  },
});
```

### Pattern 2: Retry with Exponential Backoff

```typescript
const result = await ctx.run('flaky-operation', {
  retryPolicy: {
    initialRetryInterval: 1000,      // 1 second
    retryIntervalFactor: 2.0,          // Double each time
    maxRetryInterval: 30000,           // Cap at 30s
    maxRetryAttempts: 5,               // Give up after 5
  },
}, async () => {
  return await flakyExternalAPI();
});
```

### Pattern 3: Fan-Out / Fan-In

```typescript
const workflow = restate.workflow({
  name: 'parallel-tasks',
  
  handlers: {
    run: async (ctx, tasks: string[]) => {
      // Start all tasks in parallel
      const promises = tasks.map((task, i) =>
        ctx.run(`task-${i}`, async () => {
          return await processTask(task);
        })
      );

      // Wait for all to complete
      const results = await Promise.all(promises);

      // Aggregate
      return await ctx.run('aggregate', async () => {
        return aggregateResults(results);
      });
    },
  },
});
```

---

## Debugging Workflows

### 1. Restate Admin UI

Access at `http://localhost:9070`

Features:
- **Invocations:** See all workflow executions
- **Services:** View registered workflows
- **Deployments:** Check service health
- **Promises:** Inspect pending promises

### 2. Logs

```bash
# Workflow service logs
docker-compose logs -f workflows

# Restate runtime logs
docker-compose logs -f restate
```

### 3. Query Workflow State

```typescript
// From your application
const status = await fetch(
  `http://localhost:8080/email-approval/${workflowId}/getStatus`
);
const state = await status.json();
console.log(state);
```

### 4. Replay Debugger (Advanced)

```typescript
// Restate records all inputs/outputs
// You can replay workflows locally to debug

// 1. Export workflow log
curl http://localhost:9070/invocations/${invocationId}/log > workflow.log

// 2. Analyze steps
cat workflow.log | jq '.entries[] | select(.type == "Run")'
```

---

## Performance Tips

### 1. Minimize `ctx.run()` Calls

```typescript
// ❌ BAD: Too many small steps
const a = await ctx.run('step-1', () => 1);
const b = await ctx.run('step-2', () => 2);
const c = await ctx.run('step-3', () => a + b);

// ✅ GOOD: Group related logic
const result = await ctx.run('calculate', async () => {
  const a = 1;
  const b = 2;
  return a + b;
});
```

### 2. Use Idempotency Keys

```typescript
// Ensure workflows aren't duplicated
const workflowId = `email-${userId}-${timestamp}`;

await invokeWorkflow('email-approval', workflowId, data);
// If invoked twice with same ID, second call is ignored
```

### 3. Set Appropriate Timeouts

```typescript
// Don't wait forever
const result = await ctx.promise('approval')
  .orTimeout(7 * 24 * 60 * 60 * 1000); // 7 days max
```

---

## Common Errors & Solutions

### Error: "Cannot connect to Restate"

```bash
# Check Restate is running
docker-compose ps restate

# Check logs
docker-compose logs restate

# Verify port
curl http://localhost:8080/health
```

**Solution:** Make sure Restate container is up and healthy

### Error: "Service not found"

```bash
# List registered services
curl http://localhost:9070/services
```

**Solution:** Re-register your workflow service:
```bash
curl -X POST http://localhost:9070/deployments \
  -H 'Content-Type: application/json' \
  -d '{"uri": "http://localhost:9080", "force": true}'
```

### Error: "Workflow handler failed"

Check workflow service logs:
```bash
docker-compose logs -f workflows
```

**Common causes:**
- External API failure (wrap in try/catch inside `ctx.run()`)
- Non-deterministic code (use `ctx.rand`, `ctx.date`)
- Missing environment variables

### Error: "Promise already resolved"

```bash
# Check promise status in Restate UI
open http://localhost:9070
```

**Solution:** You can't resolve the same promise twice. Check if it's already resolved.

---

## Testing Workflows

### Unit Tests

```typescript
// apps/workflows/src/workflows/email.test.ts
import { describe, it, expect, vi } from 'vitest';
import { emailApprovalWorkflow } from './email';

describe('EmailApprovalWorkflow', () => {
  it('should draft email', async () => {
    const mockCtx = {
      run: vi.fn((name, fn) => fn()),
      promise: vi.fn(() => ({ orTimeout: vi.fn() })),
      key: 'test-123',
    };

    const result = await emailApprovalWorkflow.handlers.run(
      mockCtx as any,
      { task: 'Test email' },
    );

    expect(mockCtx.run).toHaveBeenCalledWith('draft-email', expect.any(Function));
    expect(result).toHaveProperty('draft');
  });
});
```

### Integration Tests

```typescript
// apps/api/src/integration-tests/workflow.test.ts
describe('Workflow E2E', () => {
  beforeAll(async () => {
    await startTestContainers();
  });

  it('should complete approval workflow', async () => {
    // 1. Invoke workflow
    const { workflowId } = await invokeWorkflow(...);

    // 2. Verify ticket created
    const ticket = await getApprovalTicket(workflowId);
    expect(ticket.status).toBe('PENDING');

    // 3. Approve
    await approveTicket(ticket.id);

    // 4. Wait for completion
    await waitForWorkflowCompletion(workflowId, 10000);

    // 5. Verify result
    const status = await getWorkflowStatus(workflowId);
    expect(status.status).toBe('APPROVED');
  });
});
```

---

## Production Checklist

Before deploying workflows to production:

- [ ] All external calls wrapped in `ctx.run()`
- [ ] Appropriate timeouts set on promises
- [ ] Retry policies configured
- [ ] Error handling for all failure cases
- [ ] Idempotency keys used
- [ ] No non-deterministic code (random, Date.now)
- [ ] Unit tests cover happy path + failures
- [ ] Integration test validates crash recovery
- [ ] Load testing completed (1000+ workflows)
- [ ] Monitoring/alerts configured
- [ ] Documentation updated
- [ ] Rollback plan tested

---

## Resources

- [Restate Docs](https://docs.restate.dev/)
- [Restate TypeScript SDK](https://docs.restate.dev/develop/ts/overview/)
- [Examples](https://github.com/restatedev/examples)
- [Discord Community](https://discord.gg/restate)
- [AgentOS HLD/LLD](./RESTATE_INTEGRATION_HLD_LLD.md)
- [Task Breakdown](./RESTATE_TASK_BREAKDOWN.md)

---

## Getting Help

### Internal
- #agentos-dev Slack channel
- Tech Lead: [Name]
- Architecture Review: Thursdays 2pm

### External
- Restate Discord: https://discord.gg/restate
- GitHub Issues: https://github.com/restatedev/restate/issues
- Restate Support: support@restate.dev

---

**Last Updated:** 2026-05-19  