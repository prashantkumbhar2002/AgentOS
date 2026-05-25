# Restate Durable Execution - Implementation Checklist

**Feature:** 015-restate-durable-execution  
**Status:** In Progress - Phase 1  
**Started:** 2026-05-25

---

## Phase 1: Foundation ✅ 80% Complete

- [x] T1.1: Add Restate Dependencies (2h) - DONE
- [x] T1.2: Set up Restate Runtime (4h) - DONE (reusing existing container on ports 8091/9070)
- [x] T1.3: Workflow Service Skeleton (4h) - DONE (redesigned to generic engine)
- [x] T1.4: Database Migration (3h) - DONE
- [ ] T1.5: Dev Environment Deploy (4h) - TODO

**Phase 1 Target:** Week 1-2 (by 2026-06-08)

---

## Phase 2: Core Workflow

- [ ] T2.1: EmailApprovalWorkflow (16h)
- [ ] T2.2: Approval Routes Modification (6h)
- [ ] T2.3: SDK executeWorkflow() (8h)
- [ ] T2.4: Showcase Agent (6h)
- [ ] T2.5: Workflow Tracking Service (8h)
- [ ] T2.6: E2E Testing (12h)

**Phase 2 Target:** Week 3-4

---

## Phase 3: Observability

- [ ] T3.1: Workflow Status API (4h)
- [ ] T3.2: Dashboard Integration (12h)
- [ ] T3.3: SSE Events (4h)
- [ ] T3.4: Restate Metrics (6h)

**Phase 3 Target:** Week 5

---

## Phase 4: Production Hardening

- [ ] T4.1: Retry Policies (6h)
- [ ] T4.2: Idempotency Keys (4h)
- [ ] T4.3: Workflow Cancellation (6h)
- [ ] T4.4: Load Testing (8h)
- [ ] T4.5: Documentation (8h)
- [ ] T4.6: Security Review (6h)

**Phase 4 Target:** Week 6-7

---

## Phase 5: Rollout

- [ ] T5.1: Feature Flag (4h)
- [ ] T5.2: Staging Deploy (8h)
- [ ] T5.3: Canary Rollout (ongoing)
- [ ] T5.4: Full Prod Rollout (ongoing)
- [ ] T5.5: Post-Deploy Monitoring (ongoing)

**Phase 5 Target:** Week 8

---

## Success Criteria

- [ ] Crash recovery verified (99.9% success)
- [ ] 7-day approval wait supported
- [ ] 10,000 concurrent workflows supported
- [ ] Cost reduced by 50x ($0.05/hr → $0.001/hr)
- [ ] Completion rate 95% → 99.9%

---

**Total Effort:** 161 hours across 8 weeks  
**Last Updated:** 2026-05-25

---

## T1.4 Completion Notes

**Migration**: `20260525125446_add_workflow_management_and_restate_fields`

Successfully created and applied database migration for workflow management system.

**What Was Added:**
1. ✅ 3 New Enums: WorkflowStatus, TriggerType, WorkflowExecutionStatus
2. ✅ ApprovalTicket: restateWorkflowId, restatePromiseName fields
3. ✅ New Tables: WorkflowDefinition, WorkflowTrigger, WorkflowExecution
4. ✅ Indexes for performance
5. ✅ Foreign key relationships
6. ✅ Prisma Client regenerated

**Details**: See `T1.4_MIGRATION_SUMMARY.md` for complete documentation.

---

## T1.3 Completion Notes

**IMPORTANT ARCHITECTURAL CHANGE**: Redesigned from static, hardcoded workflows to a **generic, user-defined workflow engine**.

### What Changed

**Before:** Static workflows for specific use cases
- `EmailApprovalWorkflow.ts` - Hardcoded email approval logic
- `ResearchTaskWorkflow.ts` - Hardcoded research logic
- ❌ Users couldn't define their own workflows
- ❌ Each new use case required coding a new workflow class

**After:** Generic workflow engine + user-defined workflows
- `GenericWorkflowEngine` - Interprets and executes workflow definitions
- Workflow definitions as data (JSON/TypeScript config)
- ✅ Users can define workflows without coding
- ✅ Built-in step types: LLM, API, approval, conditions
- ✅ Variable interpolation: `{{variableName}}`

### Created Files

**Core Engine:**
- `workflows/generic-engine.ts` - Dynamic workflow executor
- `executors/step-executor.ts` - Step type execution logic (LLM, API, approval, etc.)
- `types/workflow-definition.ts` - Workflow schema definitions (Zod)
- `utils/workflow-registry.ts` - Workflow storage/retrieval
- `examples/workflow-definitions.ts` - Example workflow definitions

**Utilities:** (from previous iteration)
- `utils/anthropic.ts` - Claude client
- `utils/cost-calculator.ts` - LLM cost tracking
- `utils/agentos-client.ts` - AgentOS API client

**Legacy:** (moved to `workflows/legacy/`)
- `workflows/legacy/emailApproval.ts`
- `workflows/legacy/researchTask.ts`

### Architecture Highlights

**1. Workflow as Data**
```typescript
{
  id: 'email-approval-v1',
  steps: [
    { type: 'llm', llm: { ... } },
    { type: 'api', api: { ... } },
    { type: 'approval', approval: { ... } },
  ]
}
```

**2. Generic Execution Engine**
- Dynamically interprets workflow definitions
- Executes steps based on type
- Handles approvals with durable promises
- Automatic cost tracking and budget enforcement

**3. Built-in Step Types**
- `llm` - Call Claude/GPT with variable interpolation
- `api` - Call external APIs
- `approval` - Durable human-in-the-loop gates
- `condition` - Branch execution (if-then-else)
- `parallel` - Concurrent execution (TODO)
- `loop` - Iterative execution (TODO)

**4. Variable Interpolation**
- `{{inputVar}}` - From execution input
- `{{stepId.output}}` - From previous step outputs
- `{{_agentId}}`, `{{_traceId}}` - Built-in context variables

### Test Results

- ✅ TypeScript compilation clean
- ✅ GenericWorkflowEngine registered with Restate
- ✅ Health check passing (v0.2.0)
- ✅ 3 example workflows registered:
  - `email-approval-v1` - Email drafting + approval + send
  - `research-task-v1` - Multi-step research with LLM
  - `simple-approval-v1` - Generic approval pattern

### Next Steps for Users

1. **Define workflows** in `examples/workflow-definitions.ts` or via API
2. **Register workflows** at startup or dynamically
3. **Execute workflows** via Restate ingress:
   ```bash
   POST /GenericWorkflowEngine/{unique-key}/run/send
   Body: {
     "workflowDefinitionId": "email-approval-v1",
     "agentId": "...",
     "traceId": "...",
     "input": { ... }
   }
   ```

### Benefits

- ✅ **User-extensible**: Define workflows without coding
- ✅ **Reusable patterns**: Email approval, research, etc. are now templates
- ✅ **Declarative**: Workflows are data, not imperative code
- ✅ **Version-able**: Store definitions in DB with version history
- ✅ **UI-buildable**: Can build visual workflow editor on top

---

## T1.2 Completion Notes

Successfully reused existing container (v1.6.2):
- **Admin API**: `http://localhost:9070`
- **Ingress API**: `http://localhost:8091`
- **Deployment ID**: `dp_13QQKNa2Cy0xaha0HbxSVXj`
- **Network**: Connected via host IP (172.14.2.26)
- **Status**: Verified healthy and accepting workflow service registrations
