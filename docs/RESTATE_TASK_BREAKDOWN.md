# Restate Integration: Detailed Task Breakdown

**Project:** AgentOS Durable Execution Engine  
**Date:** 2026-05-19  
**Epic:** RESTATE-001

---

## Phase 1: Foundation (2 weeks)

### T1.1: Add Restate Dependencies
- **ID:** RESTATE-101
- **Type:** Task
- **Priority:** High
- **Effort:** 2 hours
- **Owner:** Backend + DevOps
- **Dependencies:** None

**Acceptance Criteria:**
- [ ] `@restatedev/restate-sdk` added to `apps/workflows/package.json`
- [ ] `@restatedev/restate-sdk-clients` added to `apps/api/package.json`
- [ ] Version 1.3.0 or higher
- [ ] `npm install` succeeds in both packages
- [ ] Types are properly resolved in IDE

**Steps:**
```bash
# 1. Update workflows package
cd apps/workflows
npm init -y  # If new package
npm install @restatedev/restate-sdk@^1.3.0

# 2. Update API package
cd ../api
npm install @restatedev/restate-sdk-clients@^1.3.0

# 3. Update SDK package
cd ../../packages/governance-sdk
npm install @restatedev/restate-sdk-clients@^1.3.0 --save-peer
```

**Testing:**
- Build all packages: `npm run build`
- Verify no type errors: `npm run lint`

---

### T1.2: Set Up Restate Runtime in Docker Compose
- **ID:** RESTATE-102
- **Type:** Task
- **Priority:** High
- **Effort:** 4 hours
- **Owner:** DevOps
- **Dependencies:** None

**Acceptance Criteria:**
- [ ] Restate service added to `docker-compose.yml`
- [ ] Ports 8080 (ingress) and 9070 (admin) exposed
- [ ] Data persistence configured with volume
- [ ] Health check working
- [ ] Admin UI accessible at `http://localhost:9070`

**Implementation:**
```yaml
# Add to docker-compose.yml
services:
  restate:
    image: restatedev/restate:1.3
    ports:
      - "8080:8080"
      - "9070:9070"
    environment:
      RESTATE_LOG_LEVEL: info
    volumes:
      - restate_data:/restate-data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9070/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  restate_data:
```

**Testing:**
- `docker-compose up restate`
- Check logs: `docker-compose logs -f restate`
- Access admin UI: `http://localhost:9070`
- Verify health: `curl http://localhost:9070/health`

---

### T1.3: Create Workflow Service Skeleton
- **ID:** RESTATE-103
- **Type:** Task
- **Priority:** High
- **Effort:** 4 hours
- **Owner:** Backend
- **Dependencies:** RESTATE-101

**Acceptance Criteria:**
- [ ] `apps/workflows` directory created
- [ ] TypeScript + Restate SDK initialized
- [ ] Basic health endpoint responds
- [ ] Dockerfile created
- [ ] Service starts successfully

**File Structure:**
```
apps/workflows/
├── src/
│   ├── server.ts           # Entry point
│   ├── workflows/
│   │   └── .gitkeep
│   └── config/
│       └── env.ts          # Env validation
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

**Implementation:**
```typescript
// apps/workflows/src/server.ts
import * as restate from '@restatedev/restate-sdk';

const endpoint = restate.endpoint();

// Health check
endpoint.addHandler('health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

endpoint.listen(9080);
console.log('Workflow service listening on :9080');
```

**Testing:**
- `npm run build`
- `npm start`
- `curl http://localhost:9080/health`

---

### T1.4: Database Migration for Restate Fields
- **ID:** RESTATE-104
- **Type:** Task
- **Priority:** High
- **Effort:** 3 hours
- **Owner:** Backend
- **Dependencies:** None

**Acceptance Criteria:**
- [ ] Migration file created
- [ ] `restateWorkflowId` and `restatePromiseName` added to `ApprovalTicket`
- [ ] `WorkflowExecution` table created
- [ ] Rollback migration tested
- [ ] Seeds updated (if needed)

**Migration:**
```sql
-- Migration: 20260519_add_restate_fields.sql

-- Add Restate fields to ApprovalTicket
ALTER TABLE "ApprovalTicket" 
  ADD COLUMN "restateWorkflowId" VARCHAR(255),
  ADD COLUMN "restatePromiseName" VARCHAR(255);

CREATE INDEX "ApprovalTicket_restateWorkflowId_idx" 
  ON "ApprovalTicket"("restateWorkflowId");

-- Create WorkflowExecution table
CREATE TYPE "WorkflowStatus" AS ENUM (
  'RUNNING',
  'SUSPENDED',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "WorkflowExecution" (
  "id" TEXT PRIMARY KEY,
  "workflowId" TEXT UNIQUE NOT NULL,
  "workflowType" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "status" "WorkflowStatus" DEFAULT 'RUNNING',
  "input" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "WorkflowExecution_agentId_fkey" 
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

CREATE INDEX "WorkflowExecution_agentId_idx" ON "WorkflowExecution"("agentId");
CREATE INDEX "WorkflowExecution_status_idx" ON "WorkflowExecution"("status");
CREATE INDEX "WorkflowExecution_workflowType_idx" ON "WorkflowExecution"("workflowType");
```

**Rollback:**
```sql
-- Rollback migration
DROP INDEX "WorkflowExecution_workflowType_idx";
DROP INDEX "WorkflowExecution_status_idx";
DROP INDEX "WorkflowExecution_agentId_idx";
DROP TABLE "WorkflowExecution";
DROP TYPE "WorkflowStatus";

DROP INDEX "ApprovalTicket_restateWorkflowId_idx";
ALTER TABLE "ApprovalTicket" 
  DROP COLUMN "restateWorkflowId",
  DROP COLUMN "restatePromiseName";
```

**Testing:**
```bash
# Apply migration
npx prisma migrate dev --name add_restate_fields

# Verify schema
npx prisma db pull

# Test rollback in test database
npx prisma migrate reset --skip-seed
```

---

### T1.5: Deploy to Dev Environment
- **ID:** RESTATE-105
- **Type:** Task
- **Priority:** High
- **Effort:** 4 hours
- **Owner:** DevOps
- **Dependencies:** RESTATE-102, RESTATE-103, RESTATE-104

**Acceptance Criteria:**
- [ ] All services start successfully via Docker Compose
- [ ] Restate runtime healthy
- [ ] Workflow service registered with Restate
- [ ] Health checks passing
- [ ] No errors in logs

**Deployment Steps:**
```bash
# 1. Build all images
docker-compose build

# 2. Start infrastructure
docker-compose up -d postgres redis restate

# 3. Wait for health checks
./scripts/wait-for-health.sh

# 4. Run migrations
docker-compose exec api npm run db:migrate

# 5. Start application services
docker-compose up -d api workflows web

# 6. Verify all services
docker-compose ps
curl http://localhost:8080/health  # Restate
curl http://localhost:9080/health  # Workflows
curl http://localhost:3000/api/health  # API
```

**Testing:**
- All containers running: `docker-compose ps`
- No errors: `docker-compose logs --tail=100`
- Restate admin UI accessible
- API health check includes Restate status

---

## Phase 2: Email Approval Workflow (2 weeks)

### T2.1: Implement EmailApprovalWorkflow Handler
- **ID:** RESTATE-201
- **Type:** Feature
- **Priority:** High
- **Effort:** 16 hours
- **Owner:** Backend
- **Dependencies:** RESTATE-105

**Acceptance Criteria:**
- [ ] Workflow handler implements all 5 steps
- [ ] Each step wrapped in `ctx.run()` for durability
- [ ] Approval wait uses `ctx.promise()`
- [ ] Error handling for all external calls
- [ ] Audit logging integrated
- [ ] Unit tests pass

**Key Implementation Points:**
1. **Step 1: Draft Email** - Call Anthropic API via `ctx.run()`
2. **Step 2: Check Policy** - Call AgentOS policy API
3. **Step 3: Create Ticket** - Store workflow ID in ticket
4. **Step 4: Wait** - `ctx.promise('approval-decision').orTimeout(7 days)`
5. **Step 5: Send Email** - Execute action if approved

**Files to Create:**
- `apps/workflows/src/workflows/emailApproval.ts`
- `apps/workflows/src/workflows/emailApproval.test.ts`
- `apps/workflows/src/utils/anthropic.ts`
- `apps/workflows/src/utils/cost-calculator.ts`

**Testing:**
```typescript
// Unit test structure
describe('EmailApprovalWorkflow', () => {
  it('should draft email successfully');
  it('should handle policy denial');
  it('should wait for approval');
  it('should send email on approval');
  it('should not send email on denial');
  it('should handle timeout');
  it('should retry on transient failures');
});
```

---

### T2.2: Add Restate Promise Resolution to Approval Routes
- **ID:** RESTATE-202
- **Type:** Feature
- **Priority:** High
- **Effort:** 6 hours
- **Owner:** Backend
- **Dependencies:** RESTATE-201

**Acceptance Criteria:**
- [ ] `PATCH /api/v1/approvals/:id/decide` modified
- [ ] Restate client initialized in plugin
- [ ] Promise resolution on approval/denial
- [ ] Error handling for workflow not found
- [ ] Backward compatible (works without workflow ID)
- [ ] Integration test passes

**Implementation:**
```typescript
// apps/api/src/modules/approvals/approvals.routes.ts

fastify.patch('/:id/decide', async (request, reply) => {
  // 1. Resolve ticket in DB (existing)
  const ticket = await approvalService.resolveTicket(...);
  
  // 2. NEW: Resolve Restate promise
  if (ticket.restateWorkflowId && ticket.restatePromiseName) {
    try {
      await fastify.restateClient.workflowClient({
        name: 'email-approval',
        key: ticket.restateWorkflowId,
      }).promiseResolve(ticket.restatePromiseName, ticket.status);
    } catch (err) {
      fastify.log.error('Failed to resolve Restate promise', err);
      // Don't fail the request - workflow might have timed out
    }
  }
  
  // 3. Existing: SSE, Slack, etc.
  // ...
});
```

**Testing:**
- Mock Restate client
- Test with/without workflow ID
- Test network failure handling

---

### T2.3: Add executeWorkflow() to GovernanceClient SDK
- **ID:** RESTATE-203
- **Type:** Feature
- **Priority:** High
- **Effort:** 8 hours
- **Owner:** SDK Team
- **Dependencies:** RESTATE-201

**Acceptance Criteria:**
- [ ] `executeWorkflow()` method implemented
- [ ] `getWorkflowStatus()` method implemented
- [ ] `cancelWorkflow()` method implemented
- [ ] TypeScript types exported
- [ ] JSDoc documentation complete
- [ ] Unit tests pass
- [ ] Backward compatible (doesn't break existing code)

**API:**
```typescript
// packages/governance-sdk/src/GovernanceClient.ts

interface WorkflowInvokeOptions {
  restateUrl?: string;
  timeout?: number;
  idempotencyKey?: string;
}

interface WorkflowResult<T> {
  workflowId: string;
  status: 'running' | 'suspended' | 'completed' | 'failed';
  result?: T;
  error?: string;
}

class GovernanceClient {
  async executeWorkflow<TInput, TResult>(
    workflowType: string,
    input: TInput,
    options?: WorkflowInvokeOptions,
  ): Promise<WorkflowResult<TResult>> {
    const restateUrl = options?.restateUrl || this.restateUrl || 'http://localhost:8080';
    const idempotencyKey = options?.idempotencyKey || crypto.randomUUID();
    
    const response = await fetch(
      `${restateUrl}/${workflowType}/${idempotencyKey}/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    
    if (!response.ok) {
      throw new Error(`Workflow invocation failed: ${response.status}`);
    }
    
    return {
      workflowId: idempotencyKey,
      status: 'running',
    };
  }

  async getWorkflowStatus<TResult>(
    workflowType: string,
    workflowId: string,
    options?: { restateUrl?: string },
  ): Promise<WorkflowResult<TResult>> {
    const restateUrl = options?.restateUrl || this.restateUrl || 'http://localhost:8080';
    
    const response = await fetch(
      `${restateUrl}/${workflowType}/${workflowId}/getStatus`,
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get workflow status: ${response.status}`);
    }
    
    return response.json();
  }
}
```

**Testing:**
```typescript
describe('GovernanceClient Workflows', () => {
  it('should execute workflow and return workflowId');
  it('should query workflow status');
  it('should handle Restate unavailable');
  it('should use idempotency key');
  it('should cancel workflow');
});
```

---

### T2.4: Create Showcase Agent Using Durable Workflow
- **ID:** RESTATE-204
- **Type:** Feature
- **Priority:** Medium
- **Effort:** 6 hours
- **Owner:** Backend
- **Dependencies:** RESTATE-203

**Acceptance Criteria:**
- [ ] `emailDraftAgentDurable.ts` created
- [ ] Uses `executeWorkflow()` instead of `callTool()`
- [ ] Agent exits immediately after invocation
- [ ] Integration test verifies end-to-end flow
- [ ] README updated with example

**Implementation:**
```typescript
// apps/api/src/showcase-agents/emailDraftAgentDurable.ts

export async function runEmailDraftAgentDurable(
  config: GovernanceClientConfig,
  task: string,
) {
  const gov = new GovernanceClient(config);

  const result = await gov.executeWorkflow('email-approval', {
    agentId: config.agentId,
    apiKey: config.apiKey,
    task,
    platformUrl: config.platformUrl,
  });

  console.log(`Workflow started: ${result.workflowId}`);
  console.log('Agent exiting - workflow continues in background');

  await gov.shutdown();

  return {
    workflowId: result.workflowId,
    status: 'PENDING_APPROVAL',
    statusUrl: `${config.platformUrl}/api/v1/workflows/${result.workflowId}`,
  };
}
```

**Testing:**
- E2E test: invoke → approve → verify sent
- Test agent can exit before approval
- Test workflow survives restart

---

### T2.5: Add Workflow Tracking Service
- **ID:** RESTATE-205
- **Type:** Feature
- **Priority:** Medium
- **Effort:** 8 hours
- **Owner:** Backend
- **Dependencies:** RESTATE-104

**Acceptance Criteria:**
- [ ] `WorkflowService` class created
- [ ] `IWorkflowRepository` interface defined
- [ ] `PrismaWorkflowRepository` implemented
- [ ] CRUD operations for `WorkflowExecution` table
- [ ] Service added to container
- [ ] Unit tests pass

**Files to Create:**
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflows.routes.ts`
- `apps/api/src/repositories/interfaces/IWorkflowRepository.ts`
- `apps/api/src/repositories/prisma/PrismaWorkflowRepository.ts`

**API Endpoints:**
```typescript
// GET /api/v1/workflows - List workflows
// GET /api/v1/workflows/:id - Get workflow details
// GET /api/v1/agents/:id/workflows - Workflows for agent
// POST /api/v1/workflows/:id/cancel - Cancel workflow
```

---

### T2.6: End-to-End Testing
- **ID:** RESTATE-206
- **Type:** Test
- **Priority:** High
- **Effort:** 12 hours
- **Owner:** QA + Backend
- **Dependencies:** RESTATE-201, RESTATE-202, RESTATE-203, RESTATE-204

**Test Scenarios:**

1. **Happy Path:**
   - [ ] Agent invokes workflow
   - [ ] Agent exits
   - [ ] Human approves
   - [ ] Email sent successfully
   - [ ] Audit logs complete

2. **Denial Path:**
   - [ ] Agent invokes workflow
   - [ ] Human denies
   - [ ] Email NOT sent
   - [ ] Workflow marked as denied

3. **Timeout/Expiration:**
   - [ ] Agent invokes workflow
   - [ ] No approval within timeout
   - [ ] Workflow expires
   - [ ] Resources cleaned up

4. **Crash Recovery:**
   - [ ] Workflow starts
   - [ ] Kill workflow service mid-execution
   - [ ] Restart workflow service
   - [ ] Workflow resumes from checkpoint
   - [ ] Completes successfully

5. **Policy Denial:**
   - [ ] Policy returns DENY
   - [ ] Workflow terminates early
   - [ ] No ticket created

**Test Framework:**
```typescript
// apps/api/src/integration-tests/workflow.test.ts

describe('Email Approval Workflow E2E', () => {
  beforeAll(async () => {
    // Start Docker containers
    // Register test agent
    // Seed policies
  });

  it('should complete happy path workflow');
  it('should handle denial');
  it('should recover from crash');
  // ... more tests
});
```

---

## Phase 3-5: Summary Tasks

### Phase 3: Observability & Dashboard (1 week)
- **T3.1:** Workflow status API (4h)
- **T3.2:** Dashboard workflow page (12h)
- **T3.3:** SSE workflow events (4h)
- **T3.4:** Restate observability integration (6h)

### Phase 4: Production Hardening (2 weeks)
- **T4.1:** Retry policies (6h)
- **T4.2:** Idempotency keys (4h)
- **T4.3:** Workflow cancellation (6h)
- **T4.4:** Load testing (8h)
- **T4.5:** Documentation (8h)
- **T4.6:** Security review (6h)

### Phase 5: Rollout & Migration (1 week)
- **T5.1:** Feature flag (4h)
- **T5.2:** Staging deployment (8h)
- **T5.3:** Canary rollout (ongoing)
- **T5.4:** Full production rollout (ongoing)
- **T5.5:** Post-deployment monitoring (ongoing)

---

## Sprint Planning Suggestions

### Sprint 1 (Week 1-2): Foundation
- RESTATE-101, RESTATE-102, RESTATE-103, RESTATE-104, RESTATE-105
- **Goal:** Infrastructure ready

### Sprint 2 (Week 3-4): Core Workflow
- RESTATE-201, RESTATE-202, RESTATE-203
- **Goal:** Basic workflow works

### Sprint 3 (Week 5-6): Testing & Polish
- RESTATE-204, RESTATE-205, RESTATE-206
- **Goal:** E2E flow validated

### Sprint 4 (Week 7-8): Observability
- T3.1, T3.2, T3.3, T3.4
- **Goal:** Dashboard integration

### Sprint 5 (Week 9-10): Hardening
- T4.1, T4.2, T4.3, T4.4
- **Goal:** Production-ready

### Sprint 6 (Week 11-12): Rollout
- T4.5, T4.6, T5.1, T5.2, T5.3
- **Goal:** Deployed to production

---

## Tracking Dashboard

| Phase | Total Hours | Completed | In Progress | Not Started |
|-------|------------|-----------|-------------|-------------|
| 1 | 17 | 0 | 0 | 5 |
| 2 | 56 | 0 | 0 | 6 |
| 3 | 26 | 0 | 0 | 4 |
| 4 | 38 | 0 | 0 | 6 |
| 5 | 24+ | 0 | 0 | 5 |
| **Total** | **161+** | **0** | **0** | **26** |

---

## Risk Register

| Task ID | Risk | Mitigation |
|---------|------|------------|
| RESTATE-201 | Restate API complexity | Allocate buffer time, start with docs |
| RESTATE-202 | Breaking existing approvals | Feature flag, thorough testing |
| RESTATE-206 | Crash recovery flakiness | Automated test retry, use test containers |
| T4.4 | Load test environment limits | Use staging-like infra, mock LLM calls |

---

**Last Updated:** 2026-05-19  
**Version:** 1.0
