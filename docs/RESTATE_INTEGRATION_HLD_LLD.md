# Restate Integration: High-Level and Low-Level Design
**AgentOS Durable Execution Engine Integration**

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-19 | Architecture Team | Initial HLD/LLD |

**Status:** Draft for Review  
**Review Date:** TBD  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [High-Level Design (HLD)](#3-high-level-design-hld)
4. [Low-Level Design (LLD)](#4-low-level-design-lld)
5. [Implementation Plan](#5-implementation-plan)
6. [Risk Analysis & Mitigation](#6-risk-analysis--mitigation)
7. [Success Criteria](#7-success-criteria)
8. [Appendices](#8-appendices)

---

## 1. Executive Summary

### 1.1 Purpose
Integrate **Restate** as a durable execution engine to enable AgentOS agents to survive process crashes, server restarts, and long-running human-in-the-loop approval workflows (hours to days) without holding resources.

### 1.2 Business Impact
- **Reliability:** 99.9% → 99.99% agent execution completion rate
- **Scalability:** Support 100x more concurrent workflows (0 resource cost during waits)
- **Cost:** Reduce server costs by ~60% (no long-lived polling connections)
- **Developer Experience:** Declarative workflow definitions instead of manual state management

### 1.3 Scope

**In Scope:**
- Durable execution for approval workflows
- Agent state persistence during long waits
- Process crash recovery
- Multi-step agent workflows
- Restate SDK integration into GovernanceClient
- Dashboard workflow status tracking

**Out of Scope:**
- Migration of existing non-approval workflows
- Real-time streaming execution (WebSocket)
- Multi-tenant Restate deployment (Phase 2)

### 1.4 Key Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Max approval wait time | 30 min | 7 days |
| Process crash recovery | ❌ None | ✅ Automatic |
| Concurrent workflows | ~100 | ~10,000 |
| Resource cost per waiting workflow | High (polling) | Near-zero (durable sleep) |

---

## 2. Current State Analysis

### 2.1 Current Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Agent (SDK)                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 1. callTool('send_email', ...)                      │ │
│  │ 2. checkPolicy() → REQUIRE_APPROVAL                 │ │
│  │ 3. requestApproval() → ticketId                     │ │
│  │ 4. while(true) { poll ticket every 3s }  ⚠️ BLOCKS  │ │
│  │ 5. if (approved) { execute() }                      │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                         │ HTTP Polling
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Fastify API (apps/api)                      │
│  POST /api/v1/approvals → PostgreSQL                     │
│  GET /api/v1/approvals/:id → ticket status               │
│  PATCH /api/v1/approvals/:id/decide → resolve            │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Current Components

| Component | Technology | Location |
|-----------|-----------|----------|
| API Server | Fastify | `apps/api/src/app.ts` |
| SDK | TypeScript | `packages/governance-sdk/src/GovernanceClient.ts` |
| Database | PostgreSQL | Prisma ORM |
| Job Queue | BullMQ + Redis | Background workers |
| Real-time | SSE | `/api/v1/events/stream` |
| Auth | JWT + bcrypt | `@fastify/jwt` |

### 2.3 Current Limitations

#### ❌ **L1: No Process Crash Recovery**
```typescript
// If agent crashes here, approval is orphaned
const draft = await llm.createMessage(...); // ✅ Completed
await gov.callTool('send_email', draft, ...); // ❌ Crashes before approval
// Draft is lost, ticket exists but no one is waiting
```

#### ❌ **L2: Resource Inefficiency**
- Agent process holds memory/connections for 30 minutes while polling
- Does not scale beyond ~100 concurrent approvals
- Wastes server resources on idle waiting

#### ❌ **L3: 30-Minute Hard Timeout**
```typescript
// Cannot wait longer than 30 minutes
const maxWait = 30 * 60 * 1000; // Hardcoded in SDK
// Overnight/weekend approvals impossible
```

#### ❌ **L4: No Multi-Step Orchestration**
```typescript
// Manual state management for multi-step workflows
const step1Result = await doStep1();
await saveState(step1Result); // Manual
const approval = await waitForApproval();
const step2Result = await doStep2(step1Result); // Must manually restore
```

### 2.4 Gap Analysis

| Requirement | Current | Restate Solution |
|------------|---------|------------------|
| Survive crashes | ❌ | ✅ Auto-resume from last checkpoint |
| Long waits (days) | ❌ 30 min max | ✅ Unlimited (durable promises) |
| Zero-cost waiting | ❌ Polling overhead | ✅ No resources while waiting |
| State persistence | ❌ Manual | ✅ Automatic |
| Retry logic | ⚠️ Manual in SDK | ✅ Built-in with policies |
| Multi-step flows | ❌ Manual coordination | ✅ Workflow primitives |

---

## 3. High-Level Design (HLD)

### 3.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent (SDK Client)                           │
│  gov.executeWorkflow('email-approval', { task })                    │
│  → Returns workflowId immediately, agent can exit                   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Invoke workflow (HTTP/gRPC)
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Restate Runtime (8080)                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Ingress: Receives workflow invocations                         │ │
│  │ State Store: Persists execution state (RocksDB)                │ │
│  │ Event Log: Guarantees exactly-once execution                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Invoke handlers
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Workflow Service (apps/workflows) - NEW                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ EmailApprovalWorkflow                                          │ │
│  │   1. ctx.run(() => draftEmail())        [Durable step]         │ │
│  │   2. ctx.run(() => checkPolicy())       [Durable step]         │ │
│  │   3. ctx.run(() => createTicket())      [Durable step]         │ │
│  │   4. ctx.promise('approval')            [Durable wait]         │ │
│  │      .orTimeout(7 days)                 [No resources held]    │ │
│  │   5. ctx.run(() => sendEmail())         [Durable step]         │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Call existing APIs
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              AgentOS Fastify API (apps/api) - MODIFIED              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ PATCH /api/v1/approvals/:id/decide                             │ │
│  │   → Resolve ticket in DB (existing)                            │ │
│  │   → restateClient.promiseResolve(workflowId, decision) [NEW]   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Existing: /agents, /audit, /policies, /analytics                   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                PostgreSQL + Redis (Existing)                        │
│  ApprovalTicket (+ restateWorkflowId, restatePromiseName)           │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Architecture

#### 3.2.1 New Components

| Component | Purpose | Technology | Port |
|-----------|---------|-----------|------|
| **Restate Runtime** | Durable execution orchestrator | Restate Server | 8080 (ingress), 9070 (admin) |
| **Workflow Service** | Workflow handlers (email, research, etc.) | TypeScript + Restate SDK | 9080 |
| **Workflow Repository** | Store workflow metadata in DB | Prisma | N/A |

#### 3.2.2 Modified Components

| Component | Change | Impact |
|-----------|--------|--------|
| **GovernanceClient SDK** | Add `executeWorkflow()`, `getWorkflowStatus()` | Minor (additive) |
| **Approval Routes** | Add Restate promise resolution on ticket resolve | Medium |
| **ApprovalTicket Schema** | Add `restateWorkflowId`, `restatePromiseName` | Medium (migration) |
| **Dashboard** | Add workflow status UI | Low (new page) |

### 3.3 Data Flow Diagrams

#### 3.3.1 Happy Path: Email Approval Workflow

```
Agent                Restate          Workflow Svc        AgentOS API       Human
  │                    │                   │                   │              │
  │ 1. executeWorkflow │                   │                   │              │
  │───────────────────>│                   │                   │              │
  │ workflowId         │                   │                   │              │
  │<───────────────────│                   │                   │              │
  │ (agent exits)      │                   │                   │              │
  │                    │ 2. invoke handler │                   │              │
  │                    │──────────────────>│                   │              │
  │                    │                   │ 3. checkPolicy()  │              │
  │                    │                   │──────────────────>│              │
  │                    │                   │ REQUIRE_APPROVAL  │              │
  │                    │                   │<──────────────────│              │
  │                    │                   │ 4. createTicket() │              │
  │                    │                   │──────────────────>│              │
  │                    │                   │ ticketId          │              │
  │                    │                   │<──────────────────│              │
  │                    │                   │                   │ 5. Slack     │
  │                    │                   │                   │─────────────>│
  │                    │ 6. promise.wait() │                   │              │
  │                    │<──────────────────│                   │              │
  │                    │ (workflow paused) │                   │              │
  │                    │ (no resources)    │                   │              │
  │                    │                   │                   │ 6. Approve   │
  │                    │                   │                   │<─────────────│
  │                    │                   │                   │              │
  │                    │                   │  7. promiseResolve('APPROVED')   │
  │                    │<──────────────────────────────────────│              │
  │                    │ 8. resume handler │                   │              │
  │                    │──────────────────>│                   │              │
  │                    │                   │ 9. sendEmail()    │              │
  │                    │                   │ (executes)        │              │
  │                    │ result            │                   │              │
  │                    │<──────────────────│                   │              │
```

#### 3.3.2 Crash Recovery Flow

```
Agent      Restate       Workflow Svc      AgentOS API
  │           │               │                  │
  │ 1. Start  │               │                  │
  │──────────>│               │                  │
  │           │ 2. Step 1     │                  │
  │           │──────────────>│ ✅ Complete      │
  │           │ [SAVED]       │                  │
  │           │               │                  │
  │           │ 3. Step 2     │                  │
  │           │──────────────>│ ✅ Complete      │
  │           │ [SAVED]       │                  │
  │           │               │                  │
  │           │ 4. Step 3     │                  │
  │           │──────────────>│ ⚠️ CRASH         │
  │           │               X                  │
  │           │                                  │
  │ (restart) │                                  │
  │           │ 5. Auto-resume from Step 3       │
  │           │──────────────>│ ✅ Retry         │
  │           │ [replays 1,2] │                  │
  │           │ [executes 3]  │                  │
```

### 3.4 Integration Points

| Integration | Direction | Protocol | Purpose |
|------------|-----------|----------|---------|
| Agent → Restate | Push | HTTP POST | Invoke workflow |
| Restate → Workflow Svc | Pull | HTTP/gRPC | Execute handlers |
| Workflow Svc → AgentOS API | Push | HTTP | Check policy, create tickets, log audit |
| AgentOS API → Restate | Push | HTTP POST | Resolve promises on approval |
| Dashboard → Restate | Pull | HTTP GET | Query workflow status |

### 3.5 Deployment Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Docker Compose / K8s                      │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Restate    │  │   Workflow   │  │  AgentOS API │          │
│  │   Runtime    │  │   Service    │  │   (Fastify)  │          │
│  │   :8080      │  │   :9080      │  │   :3000      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                │
│         │                  │                  │                │
│  ┌──────▼──────────────────▼──────────────────▼────────┐       │
│  │              PostgreSQL :5432                       │       │
│  │  - ApprovalTickets (+ Restate fields)               │       │
│  │  - WorkflowExecutions (NEW)                         │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              Redis :6379                            │       │
│  │  - BullMQ (Slack notifications)                     │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                │
│  ┌─────────────────────────────────────────────────────┐       │
│  │         Restate Data (RocksDB volume)               │       │
│  │  - Execution state, event log                       │       │
│  └─────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Low-Level Design (LLD)

### 4.1 Database Schema Changes

#### 4.1.1 ApprovalTicket Table Modification

```prisma
model ApprovalTicket {
  // ... existing fields ...
  
  // NEW: Restate integration
  restateWorkflowId   String?  @db.VarChar(255)
  restatePromiseName  String?  @db.VarChar(255)
  
  @@index([restateWorkflowId])
}
```

**Migration:**
```sql
-- Migration: 001_add_restate_fields.sql
ALTER TABLE "ApprovalTicket" 
  ADD COLUMN "restateWorkflowId" VARCHAR(255),
  ADD COLUMN "restatePromiseName" VARCHAR(255);

CREATE INDEX "ApprovalTicket_restateWorkflowId_idx" 
  ON "ApprovalTicket"("restateWorkflowId");
```

#### 4.1.2 New WorkflowExecution Table

```prisma
model WorkflowExecution {
  id              String   @id @default(uuid())
  workflowId      String   @unique  // Restate workflow ID
  workflowType    String              // 'email-approval', 'research', etc.
  agentId         String
  status          WorkflowStatus @default(RUNNING)
  input           Json
  result          Json?
  error           String?
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  
  agent           Agent    @relation(fields: [agentId], references: [id])
  
  @@index([agentId])
  @@index([status])
  @@index([workflowType])
}

enum WorkflowStatus {
  RUNNING
  SUSPENDED    // Waiting for promise
  COMPLETED
  FAILED
  CANCELLED
}
```

### 4.2 API Contracts

#### 4.2.1 New SDK Methods

```typescript
// packages/governance-sdk/src/GovernanceClient.ts

interface WorkflowInvokeOptions {
  restateUrl?: string;
  timeout?: number;       // Max workflow execution time
  idempotencyKey?: string; // For exactly-once semantics
}

interface WorkflowResult<T> {
  workflowId: string;
  status: 'running' | 'suspended' | 'completed' | 'failed';
  result?: T;
  error?: string;
}

class GovernanceClient {
  /**
   * Execute a durable workflow. Returns immediately with workflowId.
   * Workflow continues even if agent process exits.
   */
  async executeWorkflow<TInput, TResult>(
    workflowType: string,
    input: TInput,
    options?: WorkflowInvokeOptions,
  ): Promise<WorkflowResult<TResult>>;

  /**
   * Query workflow status. Non-blocking.
   */
  async getWorkflowStatus<TResult>(
    workflowId: string,
    options?: { restateUrl?: string },
  ): Promise<WorkflowResult<TResult>>;

  /**
   * Cancel a running workflow.
   */
  async cancelWorkflow(
    workflowId: string,
    reason: string,
    options?: { restateUrl?: string },
  ): Promise<void>;
}
```

#### 4.2.2 Workflow Service API

```typescript
// apps/workflows/src/workflows/emailApproval.ts

import * as restate from '@restatedev/restate-sdk';

interface EmailApprovalInput {
  agentId: string;
  apiKey: string;
  task: string;
  platformUrl: string;
}

interface EmailApprovalOutput {
  workflowId: string;
  status: 'APPROVED' | 'DENIED' | 'EXPIRED' | 'FAILED';
  draft?: { subject: string; body: string };
  ticketId?: string;
  cost?: number;
  error?: string;
}

const emailApprovalWorkflow = restate.workflow({
  name: 'email-approval',
  
  handlers: {
    /**
     * Main workflow entry point.
     * POST /email-approval/{workflowId}/run
     */
    run: async (
      ctx: restate.WorkflowContext,
      input: EmailApprovalInput,
    ): Promise<EmailApprovalOutput> => {
      // Implementation in next section
    },
    
    /**
     * Query workflow status.
     * GET /email-approval/{workflowId}/getStatus
     */
    getStatus: restate.handlers.workflow.getStatus(),
    
    /**
     * Cancel workflow.
     * POST /email-approval/{workflowId}/cancel
     */
    cancel: async (ctx: restate.WorkflowContext): Promise<void> => {
      // Mark as cancelled
    },
  },
});
```

#### 4.2.3 Modified Approval Routes

```typescript
// apps/api/src/modules/approvals/approvals.routes.ts

import { InvokeClient } from '@restatedev/restate-sdk-clients';

export default async function approvalRoutes(fastify: FastifyInstance) {
  const restateClient = new InvokeClient({
    url: env.RESTATE_URL,
  });

  // Modified: Resolve ticket + Restate promise
  fastify.patch('/:id/decide', async (request, reply) => {
    const { id } = request.params;
    const { decision, comment } = request.body;

    // 1. Resolve in database (existing)
    const ticket = await approvalService.resolveTicket(
      id,
      request.user.id,
      decision,
      comment,
    );

    if (!ticket) throw new NotFoundError('Ticket', id);

    // 2. NEW: Resolve Restate promise if workflow exists
    if (ticket.restateWorkflowId && ticket.restatePromiseName) {
      try {
        await restateClient.workflowClient({
          name: 'email-approval',
          key: ticket.restateWorkflowId,
        }).promiseResolve(ticket.restatePromiseName, decision);

        fastify.log.info(
          `Resolved Restate promise for workflow ${ticket.restateWorkflowId}`,
        );
      } catch (err) {
        // Log but don't fail - workflow might have timed out
        fastify.log.error(
          `Failed to resolve Restate promise: ${err.message}`,
        );
      }
    }

    // 3. Existing: SSE broadcast, Slack update
    fastify.sse.broadcast({
      type: 'approval.resolved',
      payload: { ticketId: id, decision },
    });

    return reply.status(200).send(ticket);
  });
}
```

### 4.3 Workflow Implementation Details

#### 4.3.1 EmailApprovalWorkflow (Complete)

```typescript
// apps/workflows/src/workflows/emailApproval.ts

const emailApprovalWorkflow = restate.workflow({
  name: 'email-approval',
  
  handlers: {
    run: async (
      ctx: restate.WorkflowContext,
      input: EmailApprovalInput,
    ): Promise<EmailApprovalOutput> => {
      const workflowId = ctx.key; // Restate-provided ID
      
      // STEP 1: Draft email (DURABLE)
      const draft = await ctx.run('draft-email', async () => {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
        
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: 'Email assistant. Format: Subject: <subject>\\n\\n<body>',
          messages: [
            { role: 'user', content: `Draft email: ${input.task}` },
          ],
        });

        const text = response.content[0]?.type === 'text' 
          ? response.content[0].text 
          : '';
        
        const [subjectLine, ...bodyLines] = text.split('\\n');
        
        // Log to AgentOS audit
        await fetch(`${input.platformUrl}/api/v1/audit/log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            agentId: input.agentId,
            traceId: workflowId,
            event: 'llm_call',
            model: 'claude-sonnet-4-5',
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            costUsd: calculateCost(response.usage),
          }),
        });

        return {
          subject: subjectLine.replace('Subject:', '').trim(),
          body: bodyLines.join('\\n').trim(),
          cost: calculateCost(response.usage),
        };
      });

      // STEP 2: Check policy (DURABLE)
      const policyResult = await ctx.run('check-policy', async () => {
        const response = await fetch(
          `${input.platformUrl}/api/v1/policies/check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
              agentId: input.agentId,
              actionType: 'send_email',
              riskScore: 0.82,
            }),
          },
        );

        return response.json();
      });

      if (policyResult.effect === 'DENY') {
        return {
          workflowId,
          status: 'DENIED',
          draft,
        };
      }

      // STEP 3: Create approval ticket (DURABLE)
      const ticketId = await ctx.run('create-ticket', async () => {
        const response = await fetch(
          `${input.platformUrl}/api/v1/approvals`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
              agentId: input.agentId,
              actionType: 'send_email',
              payload: draft,
              reasoning: 'Agent wants to send email to external recipient',
              riskScore: 0.82,
              restateWorkflowId: workflowId,
              restatePromiseName: 'approval-decision',
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`Ticket creation failed: ${response.status}`);
        }

        const { ticketId } = await response.json();
        return ticketId;
      });

      // STEP 4: DURABLE WAIT (zero resources, survives crashes)
      let decision: string;
      try {
        decision = await ctx.promise<string>('approval-decision')
          .orTimeout(7 * 24 * 60 * 60 * 1000); // 7 days
      } catch (err) {
        // Timeout
        decision = 'EXPIRED';
      }

      if (decision === 'APPROVED') {
        // STEP 5: Send email (DURABLE)
        await ctx.run('send-email', async () => {
          // Actual send logic here
          console.log(`[EmailWorkflow] Sending email: ${draft.subject}`);
          
          await fetch(`${input.platformUrl}/api/v1/audit/log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
              agentId: input.agentId,
              traceId: workflowId,
              event: 'tool_call',
              toolName: 'send_email',
              inputs: draft,
              success: true,
            }),
          });

          return { sent: true };
        });

        return {
          workflowId,
          status: 'APPROVED',
          draft,
          ticketId,
          cost: draft.cost,
        };
      } else {
        return {
          workflowId,
          status: decision as 'DENIED' | 'EXPIRED',
          draft,
          ticketId,
        };
      }
    },
  },
});

function calculateCost(usage: { input_tokens: number; output_tokens: number }) {
  return usage.input_tokens * 0.000003 + usage.output_tokens * 0.000015;
}

// Start Restate endpoint
restate
  .endpoint()
  .bind(emailApprovalWorkflow)
  .listen(9080);
```

### 4.4 Service Layer Changes

#### 4.4.1 New WorkflowService

```typescript
// apps/api/src/modules/workflows/workflows.service.ts

import type { IWorkflowRepository } from '../../repositories/interfaces/IWorkflowRepository.js';

export class WorkflowService {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
  ) {}

  async trackWorkflow(data: {
    workflowId: string;
    workflowType: string;
    agentId: string;
    input: unknown;
  }) {
    return this.workflowRepo.create({
      workflowId: data.workflowId,
      workflowType: data.workflowType,
      agentId: data.agentId,
      status: 'RUNNING',
      input: data.input,
    });
  }

  async updateWorkflowStatus(
    workflowId: string,
    status: WorkflowStatus,
    result?: unknown,
    error?: string,
  ) {
    return this.workflowRepo.updateStatus(workflowId, {
      status,
      result,
      error,
      completedAt: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
        ? new Date()
        : undefined,
    });
  }

  async getWorkflowsByAgent(agentId: string, limit: number = 50) {
    return this.workflowRepo.findByAgent(agentId, limit);
  }
}
```

#### 4.4.2 Update Container

```typescript
// apps/api/src/container.ts

import { WorkflowService } from './modules/workflows/workflows.service.js';
import { PrismaWorkflowRepository } from './repositories/prisma/PrismaWorkflowRepository.js';

export interface ServiceContainer {
  // ... existing services ...
  workflowService: WorkflowService; // NEW
}

export function createContainer(prisma: PrismaClient): ServiceContainer {
  // ... existing repos ...
  const workflowRepo = new PrismaWorkflowRepository(prisma); // NEW

  // ... existing services ...
  const workflowService = new WorkflowService(workflowRepo); // NEW

  return {
    // ... existing services ...
    workflowService,
  };
}
```

### 4.5 Sequence Diagrams

#### 4.5.1 Workflow Invocation

```mermaid
sequenceDiagram
    participant Agent
    participant SDK as GovernanceClient
    participant Restate
    participant WorkflowSvc as Workflow Service
    participant API as AgentOS API
    participant DB as PostgreSQL

    Agent->>SDK: executeWorkflow('email-approval', input)
    SDK->>Restate: POST /email-approval/{key}/run
    Restate->>SDK: 202 Accepted {workflowId}
    SDK->>Agent: {workflowId, status: 'RUNNING'}
    
    Note over Agent: Agent can exit here
    
    Restate->>WorkflowSvc: invoke run handler
    WorkflowSvc->>WorkflowSvc: ctx.run('draft-email')
    WorkflowSvc->>API: POST /api/v1/audit/log
    API->>DB: INSERT audit_logs
    
    WorkflowSvc->>API: POST /api/v1/policies/check
    API-->>WorkflowSvc: {effect: 'REQUIRE_APPROVAL'}
    
    WorkflowSvc->>API: POST /api/v1/approvals
    Note over API: Store restateWorkflowId
    API->>DB: INSERT approval_tickets
    API-->>WorkflowSvc: {ticketId}
    
    WorkflowSvc->>Restate: ctx.promise('approval-decision').orTimeout()
    Note over Restate: Workflow SUSPENDED<br/>(no resources)
```

#### 4.5.2 Approval Resolution

```mermaid
sequenceDiagram
    participant Human
    participant Dashboard
    participant API as AgentOS API
    participant DB as PostgreSQL
    participant Restate
    participant WorkflowSvc as Workflow Service

    Human->>Dashboard: Click "Approve"
    Dashboard->>API: PATCH /api/v1/approvals/:id/decide
    API->>DB: UPDATE approval_tickets SET status='APPROVED'
    DB-->>API: ticket {restateWorkflowId, restatePromiseName}
    
    API->>Restate: workflowClient.promiseResolve('approval-decision', 'APPROVED')
    Note over Restate: Workflow RESUMED
    
    Restate->>WorkflowSvc: resume run handler
    WorkflowSvc->>WorkflowSvc: ctx.run('send-email')
    WorkflowSvc->>API: POST /api/v1/audit/log
    WorkflowSvc-->>Restate: {status: 'APPROVED'}
    
    API->>Dashboard: SSE: approval.resolved
    Dashboard->>Human: Show "Approved" badge
```

#### 4.5.3 Crash Recovery

```mermaid
sequenceDiagram
    participant Restate
    participant WorkflowSvc as Workflow Service
    participant API as AgentOS API

    Restate->>WorkflowSvc: invoke run handler
    WorkflowSvc->>WorkflowSvc: ctx.run('step1') ✅
    Note over Restate: State saved: step1=complete
    
    WorkflowSvc->>WorkflowSvc: ctx.run('step2') ✅
    Note over Restate: State saved: step2=complete
    
    WorkflowSvc->>API: ctx.run('step3')
    Note over WorkflowSvc: ⚠️ Process crashes
    
    Note over Restate: Detects handler timeout
    
    Restate->>WorkflowSvc: reinvoke run handler
    Note over WorkflowSvc: Replays step1 (cached)
    Note over WorkflowSvc: Replays step2 (cached)
    WorkflowSvc->>API: ctx.run('step3') ♻️ Retry
    API-->>WorkflowSvc: Success ✅
    Note over Restate: State saved: step3=complete
```

---

## 5. Implementation Plan

### 5.1 Phase Breakdown

#### **Phase 1: Foundation (Week 1-2)** 
**Goal:** Set up Restate infrastructure and basic workflow

**Tasks:**
1. **T1.1:** Add Restate dependencies to monorepo
   - Update `package.json` files
   - Install `@restatedev/restate-sdk`, `@restatedev/restate-sdk-clients`
   - **Effort:** 2 hours
   - **Owner:** DevOps + Backend

2. **T1.2:** Set up Restate runtime in Docker Compose
   - Add `restate` service to `docker-compose.yml`
   - Configure data persistence (RocksDB volume)
   - Add health checks
   - **Effort:** 4 hours
   - **Owner:** DevOps

3. **T1.3:** Create `apps/workflows` service skeleton
   - Initialize TypeScript project
   - Add Restate SDK setup
   - Create basic health endpoint
   - **Effort:** 4 hours
   - **Owner:** Backend

4. **T1.4:** Database migration for Restate fields
   - Add `restateWorkflowId`, `restatePromiseName` to `ApprovalTicket`
   - Create `WorkflowExecution` table
   - Write rollback migration
   - **Effort:** 3 hours
   - **Owner:** Backend

5. **T1.5:** Deploy to dev environment
   - Update deployment scripts
   - Verify Restate runtime is healthy
   - **Effort:** 4 hours
   - **Owner:** DevOps

**Deliverables:**
- ✅ Restate runtime running in dev
- ✅ Empty workflow service deployed
- ✅ Database schema updated

**Success Criteria:**
- Restate admin UI accessible at `:9070`
- Workflow service responds to health checks
- No regressions in existing tests

---

#### **Phase 2: Email Approval Workflow (Week 3-4)**
**Goal:** Implement first durable workflow end-to-end

**Tasks:**
1. **T2.1:** Implement `EmailApprovalWorkflow` handler
   - Draft email step (ctx.run)
   - Policy check step (ctx.run)
   - Create ticket step (ctx.run)
   - Approval wait (ctx.promise)
   - Send email step (ctx.run)
   - **Effort:** 16 hours
   - **Owner:** Backend

2. **T2.2:** Add Restate promise resolution to approval routes
   - Modify `PATCH /approvals/:id/decide`
   - Add Restate client initialization
   - Error handling for workflow not found
   - **Effort:** 6 hours
   - **Owner:** Backend

3. **T2.3:** Add `executeWorkflow()` to GovernanceClient SDK
   - New method implementation
   - Error handling
   - TypeScript types
   - JSDoc documentation
   - **Effort:** 8 hours
   - **Owner:** SDK Team

4. **T2.4:** Create showcase agent using durable workflow
   - `emailDraftAgentDurable.ts`
   - Compare with existing polling version
   - Add integration test
   - **Effort:** 6 hours
   - **Owner:** Backend

5. **T2.5:** Add workflow tracking service
   - Create `WorkflowService`
   - Implement repository layer
   - Add to container
   - **Effort:** 8 hours
   - **Owner:** Backend

6. **T2.6:** End-to-end testing
   - Happy path: approve workflow
   - Denial path
   - Timeout/expiration
   - Crash recovery simulation
   - **Effort:** 12 hours
   - **Owner:** QA + Backend

**Deliverables:**
- ✅ Email workflow works end-to-end
- ✅ Crash recovery verified
- ✅ SDK supports durable execution

**Success Criteria:**
- Agent can invoke workflow and exit immediately
- Workflow resumes after approval
- Workflow survives service restarts
- All existing tests pass

---

#### **Phase 3: Observability & Dashboard (Week 5)**
**Goal:** Add visibility into workflow execution

**Tasks:**
1. **T3.1:** Add workflow status API endpoint
   - `GET /api/v1/workflows/:id`
   - Query Restate + database
   - Return combined status
   - **Effort:** 4 hours
   - **Owner:** Backend

2. **T3.2:** Dashboard workflow status page
   - List workflows by agent
   - Show workflow progress
   - Display approval status
   - Cancel workflow button
   - **Effort:** 12 hours
   - **Owner:** Frontend

3. **T3.3:** Add workflow events to SSE stream
   - `workflow.started`, `workflow.suspended`, `workflow.completed`
   - Update live activity feed
   - **Effort:** 4 hours
   - **Owner:** Backend

4. **T3.4:** Integrate Restate observability
   - Configure Restate tracing
   - Export to existing audit logs
   - Add Restate metrics to `/api/health`
   - **Effort:** 6 hours
   - **Owner:** Backend + DevOps

**Deliverables:**
- ✅ Dashboard shows workflow status
- ✅ Real-time workflow updates
- ✅ Restate metrics in health check

**Success Criteria:**
- Users can see workflow progress in dashboard
- Live feed shows workflow events
- Restate metrics are monitored

---

#### **Phase 4: Production Hardening (Week 6-7)**
**Goal:** Production readiness

**Tasks:**
1. **T4.1:** Add retry policies to workflow steps
   - Configure per-step retry behavior
   - Handle transient failures
   - **Effort:** 6 hours
   - **Owner:** Backend

2. **T4.2:** Add idempotency keys
   - Generate deterministic keys
   - Test duplicate invocations
   - **Effort:** 4 hours
   - **Owner:** Backend

3. **T4.3:** Add workflow cancellation
   - Implement cancel handler
   - Update approval flow to cancel on deny
   - **Effort:** 6 hours
   - **Owner:** Backend

4. **T4.4:** Load testing
   - 1000 concurrent workflows
   - Measure resource usage
   - Identify bottlenecks
   - **Effort:** 8 hours
   - **Owner:** DevOps + Backend

5. **T4.5:** Documentation
   - Update SetUp.md
   - Add workflow development guide
   - Document migration path
   - **Effort:** 8 hours
   - **Owner:** Technical Writer

6. **T4.6:** Security review
   - API key handling in workflows
   - Restate access control
   - Audit log completeness
   - **Effort:** 6 hours
   - **Owner:** Security Team

**Deliverables:**
- ✅ Production-grade error handling
- ✅ Load test results
- ✅ Complete documentation

**Success Criteria:**
- Handles 1000+ concurrent workflows
- Zero data loss on crashes
- Security review approved

---

#### **Phase 5: Rollout & Migration (Week 8)**
**Goal:** Gradual rollout to users

**Tasks:**
1. **T5.1:** Feature flag for durable execution
   - Add `ENABLE_RESTATE_WORKFLOWS` env var
   - Fallback to polling if disabled
   - **Effort:** 4 hours
   - **Owner:** Backend

2. **T5.2:** Deploy to staging
   - Full regression testing
   - Monitor for 48 hours
   - **Effort:** 8 hours
   - **Owner:** DevOps

3. **T5.3:** Canary deployment to production
   - 10% of agents use workflows
   - Monitor metrics
   - **Effort:** Ongoing
   - **Owner:** DevOps + Backend

4. **T5.4:** Full production rollout
   - 100% of agents use workflows
   - Deprecate polling path
   - **Effort:** Ongoing
   - **Owner:** DevOps

5. **T5.5:** Post-deployment monitoring
   - Track success/failure rates
   - Monitor Restate resource usage
   - Collect user feedback
   - **Effort:** Ongoing
   - **Owner:** SRE Team

**Deliverables:**
- ✅ Production deployment complete
- ✅ Rollback plan tested
- ✅ Monitoring dashboards

**Success Criteria:**
- 99.9% workflow completion rate
- <1% error rate
- No user-reported issues

---

### 5.2 Task Dependencies

```
T1.1 → T1.2 → T1.3 → T1.4 → T1.5
                        ↓
              T2.1 → T2.2 → T2.3
                ↓     ↓
              T2.4   T2.5
                ↓     ↓
                 T2.6
                  ↓
        T3.1 → T3.2 → T3.3 → T3.4
                              ↓
              T4.1 → T4.2 → T4.3
                ↓     ↓     ↓
                   T4.4
                     ↓
              T4.5   T4.6
                ↓     ↓
        T5.1 → T5.2 → T5.3 → T5.4 → T5.5
```

### 5.3 Resource Allocation

| Phase | Duration | Backend | Frontend | DevOps | QA |
|-------|----------|---------|----------|--------|-----|
| 1 | 2 weeks | 1 FTE | 0 | 0.5 FTE | 0 |
| 2 | 2 weeks | 2 FTE | 0 | 0.25 FTE | 0.5 FTE |
| 3 | 1 week | 1 FTE | 1 FTE | 0.25 FTE | 0.5 FTE |
| 4 | 2 weeks | 1.5 FTE | 0 | 0.5 FTE | 0.5 FTE |
| 5 | 1 week | 0.5 FTE | 0 | 1 FTE | 0.5 FTE |
| **Total** | **8 weeks** | **6 FTE** | **1 FTE** | **2.5 FTE** | **2 FTE** |

---

## 6. Risk Analysis & Mitigation

### 6.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| **R1: Restate learning curve** | High | Medium | • Allocate 1 week for team training<br/>• Start with simple workflow<br/>• Document patterns as we go |
| **R2: Restate stability in production** | High | Low | • Use stable version (1.3+)<br/>• Extensive testing in staging<br/>• Gradual rollout (10% → 100%) |
| **R3: State migration complexity** | Medium | Medium | • Keep both paths (polling + workflow) during transition<br/>• Feature flag for easy rollback |
| **R4: Performance degradation** | High | Low | • Load test before production<br/>• Monitor metrics closely<br/>• Set up alerts for anomalies |
| **R5: Data consistency issues** | High | Low | • Use database transactions<br/>• Test edge cases (crashes, timeouts)<br/>• Add idempotency |
| **R6: Restate scaling limits** | Medium | Low | • Review Restate scaling docs<br/>• Plan for horizontal scaling<br/>• Monitor resource usage |

### 6.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| **R7: Deployment complexity** | Medium | Medium | • Detailed deployment runbook<br/>• Practice in staging<br/>• Automate with CI/CD |
| **R8: Monitoring gaps** | High | Medium | • Add Restate metrics to Grafana<br/>• Set up alerts for workflow failures<br/>• Track SLOs |
| **R9: Rollback difficulty** | High | Low | • Feature flag for instant disable<br/>• Keep polling code intact for 2 releases<br/>• Test rollback in staging |

### 6.3 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| **R10: User disruption** | High | Low | • Transparent rollout communication<br/>• Beta test with friendly users<br/>• Quick rollback capability |
| **R11: Extended timeline** | Medium | Medium | • Buffer 2 weeks in schedule<br/>• Prioritize MVP scope<br/>• Cut nice-to-haves if needed |

---

## 7. Success Criteria

### 7.1 Functional Requirements

| Requirement | Acceptance Criteria |
|------------|-------------------|
| **FR1: Durable execution** | Agent can invoke workflow, exit, and workflow completes successfully |
| **FR2: Crash recovery** | Workflow survives service restart and resumes from last checkpoint |
| **FR3: Long waits** | Workflow can wait for approval for 7 days without resource consumption |
| **FR4: Observability** | Dashboard shows workflow status and progress |
| **FR5: Backward compatibility** | Existing polling agents continue to work |

### 7.2 Non-Functional Requirements

| Requirement | Target | Measurement |
|------------|--------|-------------|
| **NFR1: Reliability** | 99.95% workflow completion rate | Restate metrics |
| **NFR2: Performance** | <200ms workflow invocation latency | Grafana |
| **NFR3: Scalability** | Support 10,000 concurrent workflows | Load test |
| **NFR4: Resource efficiency** | <10MB memory per suspended workflow | Restate admin |
| **NFR5: Latency** | <100ms resume time after approval | Instrumentation |

### 7.3 Key Performance Indicators (KPIs)

| KPI | Baseline | Target | Timeline |
|-----|----------|--------|----------|
| Agent execution completion rate | 95% | 99.9% | Month 1 |
| Avg workflow duration (end-to-end) | N/A | <5min (excl. approval wait) | Month 1 |
| Workflow crash recovery success | 0% | 100% | Month 1 |
| Cost per 1000 workflows | $X (polling) | $X/10 (Restate) | Month 2 |
| Max concurrent workflows | 100 | 10,000 | Month 3 |

---

## 8. Appendices

### 8.1 Environment Variables

```bash
# New Restate-specific variables

# Restate runtime URL (for SDK clients and API)
RESTATE_URL=http://localhost:8080

# Workflow service URL (where handlers run)
WORKFLOW_SERVICE_URL=http://localhost:9080

# Feature flag: enable durable workflows
ENABLE_RESTATE_WORKFLOWS=true

# Workflow defaults
WORKFLOW_DEFAULT_TIMEOUT_MS=604800000  # 7 days
WORKFLOW_MAX_RETRY_ATTEMPTS=5
```

### 8.2 Docker Compose Changes

```yaml
# Add to docker-compose.yml

services:
  # NEW: Restate runtime
  restate:
    image: restatedev/restate:1.3
    ports:
      - "8080:8080"   # Ingress
      - "9070:9070"   # Admin UI
    environment:
      RESTATE_LOG_LEVEL: info
      RESTATE_OBSERVABILITY__TRACING__ENDPOINT: http://jaeger:4317
    volumes:
      - restate_data:/restate-data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9070/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # NEW: Workflow service
  workflows:
    build:
      context: .
      dockerfile: apps/workflows/Dockerfile
    ports:
      - "9080:9080"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/agentos
      RESTATE_URL: http://restate:8080
      AGENTOS_API_URL: http://api:3000
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on:
      restate:
        condition: service_healthy
      postgres:
        condition: service_healthy
    command: node dist/server.js

  # MODIFIED: API service
  api:
    # ... existing config ...
    environment:
      # ... existing env vars ...
      RESTATE_URL: http://restate:8080
      ENABLE_RESTATE_WORKFLOWS: "true"

volumes:
  restate_data:
```

### 8.3 Monitoring & Alerts

```yaml
# Grafana dashboard metrics

- Workflow invocation rate (req/s)
- Workflow completion rate (%)
- Workflow error rate (%)
- Avg workflow duration (ms)
- Suspended workflows (count)
- Restate memory usage (MB)
- Restate CPU usage (%)

# PagerDuty alerts

- Workflow error rate > 5% for 5 minutes
- Restate service down
- Workflow service unresponsive
- Database connection pool exhausted
```

### 8.4 Rollback Procedure

```bash
# Step 1: Disable Restate workflows via feature flag
export ENABLE_RESTATE_WORKFLOWS=false
kubectl set env deployment/api ENABLE_RESTATE_WORKFLOWS=false

# Step 2: Verify agents fall back to polling
curl http://api/api/health | jq '.features.restate_enabled'
# Should return false

# Step 3: Monitor for 10 minutes
# Check error rates, approval completion rates

# Step 4: If stable, keep disabled and investigate
# If issues persist, rollback code to previous release

# Step 5: Scale down workflow service (optional)
kubectl scale deployment/workflows --replicas=0
```

### 8.5 Testing Checklist

**Unit Tests:**
- [ ] EmailApprovalWorkflow handler logic
- [ ] Workflow service methods
- [ ] SDK executeWorkflow() method
- [ ] Approval route promise resolution

**Integration Tests:**
- [ ] End-to-end email workflow (happy path)
- [ ] Workflow timeout/expiration
- [ ] Workflow approval + resume
- [ ] Workflow denial
- [ ] Crash recovery (simulate process kill)

**Load Tests:**
- [ ] 1000 concurrent workflow invocations
- [ ] 10,000 suspended workflows
- [ ] 100 approvals/second
- [ ] Memory usage under load

**Security Tests:**
- [ ] API key validation in workflows
- [ ] Restate admin UI access control
- [ ] SQL injection in workflow inputs
- [ ] Audit log completeness

---

## Next Steps

### Immediate Actions (This Week)
1. **Stakeholder Review:** Schedule HLD/LLD review meeting
2. **Team Training:** Book Restate training session (2-3 hours)
3. **Environment Setup:** Provision dev environment with Restate
4. **Sprint Planning:** Break Phase 1 into sprint tickets

### Decision Points
- [ ] Approve HLD/LLD design
- [ ] Allocate engineering resources
- [ ] Set go-live date
- [ ] Define success metrics baseline

---

**Document Status:** ✅ Ready for Review  
**Last Updated:** 2026-05-19  
**Version:** 1.0
