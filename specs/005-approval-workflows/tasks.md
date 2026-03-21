# Tasks: Approval Workflows

**Input**: Design documents from `/specs/005-approval-workflows/`
**Prerequisites**: spec.md, plan.md, contracts/, data-model.md, research.md
**Organization**: Tasks grouped by phase with clear dependencies. Each task completable in one focused session.

## Format: `T4.[number] — [file] — [description]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions

---

## Phase 1: Shared Types & Dependencies

**Purpose**: Create shared Zod schemas, install new dependencies (BullMQ, ioredis, Slack), add Slack env vars. No Fastify or Prisma involvement yet.

- [X] T4.01 [P] — `packages/types/src/approval.ts` + `packages/types/src/index.ts` — Create all approval Zod schemas: ApprovalStatusSchema (z.enum of PENDING, APPROVED, DENIED, EXPIRED, AUTO_APPROVED), CreateApprovalSchema ({ agentId: uuid, actionType: string, payload: z.unknown(), riskScore: z.number().min(0).max(1), reasoning: string }), ApprovalDecisionSchema ({ decision: z.enum(["APPROVED","DENIED"]), comment?: string }), ApprovalTicketSchema (full ticket with agentName, resolvedByName), ApprovalQuerySchema ({ status?, agentId?, page=1, limit=20 }), ApprovalIdParamsSchema ({ id: z.string().uuid() }). Update barrel `index.ts` to re-export all approval schemas and types.
- [X] T4.02 [P] — `apps/api/package.json` + `apps/api/src/config/env.ts` — Install `bullmq`, `ioredis`, `@slack/web-api` as dependencies. Add optional Slack env vars to EnvSchema: SLACK_BOT_TOKEN (z.string().optional()), SLACK_SIGNING_SECRET (z.string().optional()), SLACK_CHANNEL_ID (z.string().optional()). Run `npm install` from root.
- [X] T4.03 [P] — `apps/api/src/utils/risk-label.ts` — Create pure `getRiskLabel(riskScore: number)` function returning `{ label: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL', emoji: string }` based on score thresholds: 0–0.39 LOW, 0.40–0.69 MEDIUM, 0.70–0.89 HIGH, 0.90–1.0 CRITICAL. Export for use in Slack notifications and API responses.

**Checkpoint**: Shared types, dependencies, and utilities ready. No HTTP or DB layer yet.

---

## Phase 2: Service Layer

**Purpose**: Implement all Prisma queries and business logic for approval management.

- [X] T4.04 — `apps/api/src/modules/approvals/approvals.service.ts` — Create all service functions: `evaluatePolicy(prisma, agentId, actionType, riskScore)` — STUB: always returns `{ effect: 'REQUIRE_APPROVAL' as const }` (to be replaced by EPIC 5 policy engine). `createTicket(prisma, data)` — insert ApprovalTicket with expiresAt = now + 30min, return ticket. `getTicket(prisma, ticketId)` — findUnique with agent.name and resolvedBy.name included. `resolveTicket(prisma, ticketId, userId, decision, comment?)` — optimistic concurrency: update WHERE id AND status=PENDING, set status/resolvedById/resolvedAt; throw if expired (expiresAt < now) or already resolved (no PENDING row found). `listTickets(prisma, query)` — paginated query with status/agentId filters, default sort expiresAt ASC, include pendingCount (separate count WHERE status=PENDING). `expirePendingTickets(prisma)` — updateMany WHERE status=PENDING AND expiresAt < now → set status=EXPIRED, return count.
  - **Depends on**: T4.01 (types), T4.02 (dependencies)

**Checkpoint**: All business logic implemented and callable. No HTTP or worker layer yet.

---

## Phase 3: Workers & Slack Infrastructure

**Purpose**: Set up BullMQ workers and Slack integration.

- [X] T4.05 — `apps/api/src/plugins/bullmq.ts` — Create Fastify plugin that initializes ioredis connection from REDIS_URL, creates BullMQ `Queue` named "notifications", and decorates fastify with `notificationQueue`. Add cleanup on fastify close. Export the queue type for workers.
  - **Depends on**: T4.02 (ioredis/bullmq deps)
- [X] T4.06 — `apps/api/src/workers/notificationWorker.ts` — BullMQ Worker for "notifications" queue. Handle job name "slack-approval-notification": extract ticketId from job data, fetch ticket + agent from Prisma, build Slack Block Kit message (header, fields for agent/action/risk/reason/expires, truncated payload code block, Approve/Deny buttons), post via @slack/web-api WebClient, store slackMsgTs on ticket. Retry: 3 attempts with exponential backoff. If Slack env vars missing, log warning and return early. If Slack API fails, log warning (do not throw — ticket remains valid).
  - **Depends on**: T4.05 (bullmq plugin), T4.03 (risk label)
- [X] T4.07 — `apps/api/src/workers/approvalExpirationWorker.ts` — BullMQ Worker for "notifications" queue, job name "expire-pending-approvals". Calls `expirePendingTickets(prisma)` and logs count. Register as repeatable job (every 5 minutes) on app startup.
  - **Depends on**: T4.04 (service), T4.05 (bullmq plugin)
- [X] T4.08 — `apps/api/src/plugins/slack.ts` — Fastify plugin registering `POST /slack/interactions` route. Verify X-Slack-Signature header (using SLACK_SIGNING_SECRET + raw body + timestamp). Parse action value ("approve:ticketId" or "deny:ticketId"). Look up Slack user → map to platform user (by email or fallback). Call resolveTicket from service. Update Slack message: remove buttons, add resolution text ("Approved by [name]" or "Denied by [name]"). If Slack env vars missing, skip registration with info log.
  - **Depends on**: T4.04 (service), T4.02 (Slack deps)

**Checkpoint**: Workers and Slack infrastructure ready. No HTTP routes for the approval API yet.

---

## Phase 4: Routes

**Purpose**: Implement all approval API routes. T4.09 creates the file and registers it in app.ts.

- [X] T4.09 — `apps/api/src/modules/approvals/approvals.routes.ts` + `apps/api/src/modules/approvals/approvals.schema.ts` + `apps/api/src/app.ts` — Create routes file with `POST /` (create approval ticket). Any authenticated role. Zod validate via CreateApprovalSchema. Verify agentId exists (400 if not). Call evaluatePolicy stub. If ALLOW → return 200 { status: "AUTO_APPROVED" }, log audit event. If DENY → return 403 with policy name, log audit event. If REQUIRE_APPROVAL → call createTicket, add job to notificationQueue, broadcast SSE `approval.requested`, return 201 { ticketId, status, expiresAt }. Create `approvals.schema.ts` as thin re-export from @agentos/types. Register `approvalRoutes` in `app.ts` with prefix `/api/approvals`. Also register bullmq plugin in app.ts.
  - **Depends on**: T4.04 (service), T4.05 (bullmq plugin)
- [X] T4.10 — `apps/api/src/modules/approvals/approvals.routes.ts` — Add `GET /` (list tickets with filters). Parse ApprovalQuerySchema from query params. Call listTickets. Return 200 { data, total, pendingCount, page, limit }. Add `GET /:id` (get single ticket for polling). Validate id param. Call getTicket. Return 404 if not found. Add `PATCH /:id/decide` (resolve ticket). Require admin/approver role. Validate ApprovalDecisionSchema body. Call resolveTicket (handle expired/already-resolved errors as 400). Broadcast SSE `approval.resolved`. Log audit event `approval_resolved`. If slackMsgTs exists, queue Slack message update job. Return 200 with resolution details.
  - **Depends on**: T4.09

**Checkpoint**: All 4 approval routes operational (POST create, GET list, GET poll, PATCH decide).

---

## Phase 5: Integration Tests

**Purpose**: Comprehensive Supertest integration tests covering all routes and edge cases.

- [X] T4.11 — `apps/api/src/modules/approvals/approvals.test.ts` — Supertest integration tests (19 cases). Test setup: `buildApp()`, seed test users (admin, approver, viewer) + test agent, cleanup approval tickets after each test. Test groups: **Create ticket** (happy path 201 PENDING with expiresAt, validation error 400, non-existent agentId 400, out-of-range riskScore 400, no auth 401), **Poll ticket** (happy path returns full ticket, 404 for non-existent ticket, returns EXPIRED status not 404), **Resolve ticket** (admin approves 200, approver denies 200, viewer gets 403, expired ticket returns 400, already-resolved ticket returns 400, non-existent ticket 404, invalid decision 400), **List tickets** (default returns PENDING sorted by expiresAt ASC, filter by agentId, filter by status, empty results).
  - **Depends on**: T4.09, T4.10 (all routes)

**Checkpoint**: All tests green. Backend approval module complete.

---

## Phase 6: Wire Governance SDK

**Purpose**: Connect the GovernanceClient's `requestApproval` stub from EPIC 3 to the real endpoint.

- [X] T4.12 — `packages/governance-sdk/src/GovernanceClient.ts` — Replace `requestApproval` stub (currently throws "not yet implemented") with real implementation: POST to `${platformUrl}/api/approvals` with auth header, create ticket, then poll `GET /api/approvals/:id` every 3 seconds until status is not PENDING. Return `{ decision, ticketId }`. Swallow network errors with console.warn (never block agent). Add configurable poll interval and max wait time (default 30 min).
  - **Depends on**: T4.09 (POST route must exist)

**Checkpoint**: SDK fully connected to approval workflow. Full EPIC 4 feature done.

---

## Dependencies & Execution Order

### Dependency Graph

```
T4.01 ──┐
T4.02 ──┼──> T4.04 ──> T4.09 ──> T4.10 ──> T4.11
T4.03 ──┤              │
        ├──> T4.05 ──┬─┘
        │            ├──> T4.06
        │            └──> T4.07
        └──> T4.08
                                   T4.09 ──> T4.12
```

### Parallel Opportunities

- **Batch 1** (no deps): T4.01, T4.02, T4.03 — all in parallel
- **Batch 2** (after T4.01 + T4.02): T4.04 (service) and T4.05 (bullmq plugin) — in parallel
- **Batch 3** (after T4.04 + T4.05): T4.06, T4.07, T4.08, T4.09 — T4.06/T4.07/T4.08 can parallel with T4.09
- **Batch 4** (after T4.09): T4.10 (remaining routes) and T4.12 (SDK update)
- **Batch 5** (after T4.10): T4.11 (integration tests)

### Strictly Sequential Chains

1. T4.01 + T4.02 → T4.04 (types + deps before service)
2. T4.02 → T4.05 (deps before bullmq plugin)
3. T4.05 → T4.06, T4.07 (plugin before workers)
4. T4.04 + T4.05 → T4.09 (service + plugin before first route)
5. T4.09 → T4.10 (first route scaffolds the file + app.ts registration)
6. T4.10 → T4.11 (all routes before integration tests)
7. T4.09 → T4.12 (POST route before SDK implementation)

### Key Flags

- **T4.04 has a POLICY STUB** — `evaluatePolicy()` always returns REQUIRE_APPROVAL. Replace with real policy engine after EPIC 5.
- **T4.02 adds NEW DEPENDENCIES** — BullMQ, ioredis, @slack/web-api are net-new additions to apps/api.
- **T4.05 is SHARED INFRA** — the BullMQ plugin will be reused by future epics needing background jobs.
- **T4.06/T4.07/T4.08 are OPTIONAL for MVP** — Slack + expiration workers are P3 features. Core CRUD works without them.
- **T4.12 replaces a stub** — the EPIC 3 GovernanceClient.requestApproval currently throws; this task wires it to the real API.

---

## Implementation Strategy

### MVP First (Ticket CRUD E2E)

1. Complete Phase 1: T4.01 + T4.02 + T4.03 (types + deps + utils)
2. Complete Phase 2: T4.04 (service with policy stub)
3. Complete Phase 4 partially: T4.05 + T4.09 + T4.10 (bullmq plugin + all routes)
4. **STOP and VALIDATE**: Create, poll, resolve, list tickets end-to-end with SSE

### Full Delivery

5. Complete T4.06 + T4.07 + T4.08 (Slack workers + interactions)
6. Complete T4.11 (all tests)
7. Complete T4.12 (SDK wiring)

---

## Summary

- **Total tasks**: 12
- **Parallelizable batches**: 5
- **MVP scope**: T4.01, T4.02, T4.03, T4.04, T4.05, T4.09, T4.10 (ticket CRUD end-to-end)
- **New dependencies**: BullMQ, ioredis, @slack/web-api
- **New infra**: BullMQ plugin (shared), workers directory
- **Constitution compliance**: TypeScript strict, Zod validation, Prisma-only, SSE broadcast, JWT auth, RBAC on resolve, BullMQ for async work

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Routes added incrementally to `approvals.routes.ts` for independent review
- Slack features are completely optional — MVP works without Slack credentials
- Policy evaluation is a stub until EPIC 5; safe default = REQUIRE_APPROVAL
