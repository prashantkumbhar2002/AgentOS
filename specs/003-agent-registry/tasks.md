# Tasks: Agent Registry

**Input**: Design documents from `/specs/003-agent-registry/`
**Prerequisites**: spec.md (required)
**Organization**: Tasks are grouped by phase with clear dependencies. Each task is completable by Cursor Agent in one focused session.

## Format: `T2.[number] — [file] — [description]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions
- Dependencies listed per-task

---

## Phase 1: Shared Types & Utilities

**Purpose**: Create shared Zod schemas and pure utility functions with no external dependencies. All tasks in this phase can run in parallel.

- [x] T2.01 [P] — `packages/types/src/agent.ts` + `packages/types/src/index.ts` — Create all agent Zod schemas (RiskTierSchema, EnvironmentSchema, AgentStatusSchema, AgentToolSchema, CreateAgentSchema, UpdateAgentSchema, UpdateAgentStatusSchema, AgentListQuerySchema, AgentIdParamsSchema, AgentSummarySchema, AgentStatsSchema, AgentDetailSchema) and update barrel `index.ts` to re-export all agent schemas and types
- [x] T2.02 [P] — `apps/api/src/utils/health-score.ts` — Create pure `calculateHealthScore(errorRate, approvalDenyRate, avgLatencyMs)` function returning 0-100 score using formula: `round((1 - errorRate) * 0.40 + (1 - approvalDenyRate) * 0.30 + max(0, 1 - avgLatencyMs / 10000) * 0.30) * 100`
- [x] T2.03 [P] — `apps/api/src/utils/health-score.test.ts` — Vitest unit tests for calculateHealthScore: perfect score (100), zero score, boundary values, default-zero inputs (new agent = 100), negative/overflow inputs
  - **Depends on**: T2.02

**Checkpoint**: Shared types and utilities ready. No Fastify or Prisma involvement yet.

---

## Phase 2: SSE Plugin — SHARED INFRA (other epics depend on this)

**Purpose**: Build the SSE broadcasting infrastructure. This is shared across ALL future epics (Audit, Approvals, etc.) — design for generic event broadcasting, not agent-specific.

- [x] T2.04 — `apps/api/src/plugins/sse.ts` — Create SSE Fastify plugin using `fastify-plugin` pattern (like `prisma.ts`). Implement: `Map<string, FastifyReply>` client registry, `addClient(id, reply)`, `removeClient(id)`, `broadcast({ type, payload, timestamp })` methods, 30s heartbeat interval (`": ping\n\n"`), `onClose` hook cleanup. Decorate fastify instance with `sse` object.
  - **SHARED — other epics depend on this plugin**
- [x] T2.05 — `apps/api/src/app.ts` — Register SSE plugin after auth plugin. Add `GET /api/events/stream` route with: query-param JWT auth (`?token=`), `reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })`, `reply.hijack()`, register client via SSE plugin, cleanup on `reply.raw.on('close')`.
  - **Depends on**: T2.04

**Checkpoint**: SSE infrastructure operational. Clients can connect and receive heartbeats.

---

## Phase 3: Service Layer

**Purpose**: Implement all Prisma queries and business logic for agent management.

- [x] T2.06 — `apps/api/src/modules/agents/agents.service.ts` — Create all service functions: `createAgent(prisma, data)` with tools transaction, `listAgents(prisma, filters, pagination)` with 7d cost aggregation and tool count, `getAgentById(prisma, id)` returning full detail with tools + recent logs + pending approvals + assigned policies, `updateAgent(prisma, id, data)` partial update preserving unmodified fields, `updateAgentStatus(prisma, id, newStatus, userId)` with state machine validation, `computeAgentStats(prisma, agentId)` using `calculateHealthScore` from T2.02, `validateStatusTransition(currentStatus, newStatus)` enforcing DRAFT→APPROVED→ACTIVE, ACTIVE→SUSPENDED→ACTIVE, ANY→DEPRECATED rules.
  - **Depends on**: T2.01 (types), T2.02 (health score)

**Checkpoint**: All business logic implemented and callable. No HTTP layer yet.

---

## Phase 4: Request Schemas

**Purpose**: Bridge shared Zod schemas to Fastify route-level validation objects.

- [x] T2.07 — `apps/api/src/modules/agents/agents.schema.ts` — Thin re-export layer mapping `@agentos/types` agent schemas to Fastify route-level validation objects (body, params, querystring shapes for each route)
  - **Depends on**: T2.01

**Checkpoint**: Schema bridge ready for route handlers.

---

## Phase 5: Routes (each route independently reviewable)

**Purpose**: Implement all 6 agent routes. Each task adds one route to `apps/api/src/modules/agents/agents.routes.ts`. T2.08 creates the file and registers it in `app.ts`.

- [x] T2.08 — `apps/api/src/modules/agents/agents.routes.ts` + `apps/api/src/app.ts` — Create routes file with `POST /` (register agent). Any authenticated role. Zod validate via CreateAgentSchema. Return 201 `{ id, name, status: "DRAFT", riskTier, createdAt }`. Broadcast `agent.registered` SSE event. Register `agentsRoutes` in `app.ts` with prefix `/api/agents`.
  - **Depends on**: T2.05 (SSE in app.ts), T2.06 (service), T2.07 (schema)
- [x] T2.09 — `apps/api/src/modules/agents/agents.routes.ts` — Add `GET /` (list agents with filters). Query params: status, riskTier, environment, ownerTeam, search, page (default 1), limit (default 20). Return 200 `{ data: AgentSummary[], total, page, limit }`.
  - **Depends on**: T2.08
- [x] T2.10 — `apps/api/src/modules/agents/agents.routes.ts` — Add `GET /:id` (agent detail). Return 200 with full AgentDetail (tools, stats, recentLogs, pendingApprovals, policies). Return 404 `{ error: "Agent not found" }` for non-existent id.
  - **Depends on**: T2.08
- [x] T2.11 — `apps/api/src/modules/agents/agents.routes.ts` — Add `PATCH /:id` (update metadata). Admin only via `requireRole('admin')`. Partial update via UpdateAgentSchema. Return 200 with updated agent. Return 403 for non-admin, 404 for non-existent.
  - **Depends on**: T2.08
- [x] T2.12 — `apps/api/src/modules/agents/agents.routes.ts` — Add `PATCH /:id/status` (change lifecycle status). Admin or approver via `requireRole(['admin', 'approver'])`. Enforce transition rules. Set `approvedBy` on APPROVED transition. Return 200 `{ id, status, approvedBy, updatedAt }`. Broadcast `agent.status_changed` SSE event. Return 400 for invalid transitions, 403 for viewer.
  - **Depends on**: T2.08
- [x] T2.13 — `apps/api/src/modules/agents/agents.routes.ts` — Add `DELETE /:id` (soft delete). Admin only. Set status to DEPRECATED. Reject ACTIVE agents with 400 (must suspend first). Return 200. Return 403 for non-admin.
  - **Depends on**: T2.08

**Checkpoint**: All 6 routes operational. Full CRUD + lifecycle management working end-to-end.

---

## Phase 6: Integration Tests

**Purpose**: Comprehensive Supertest integration tests covering all routes, RBAC, and edge cases.

- [x] T2.14 — `apps/api/src/modules/agents/agents.test.ts` — Supertest integration tests (17+ cases). Test setup: `buildApp()`, seed test users (admin, approver, viewer), cleanup agents after each test. Test groups: **Create agent** (happy path 201, validation error 400, duplicate name allowed), **List with filters** (no filters returns paginated, filter by status, filter by riskTier, search by name, empty results `{ data: [], total: 0 }`, pagination), **Get detail** (happy path with stats/tools, 404 non-existent), **Status transitions** (DRAFT→APPROVED by approver, APPROVED→ACTIVE by admin, ACTIVE→SUSPENDED, SUSPENDED→ACTIVE, ANY→DEPRECATED, invalid DRAFT→ACTIVE returns 400, viewer forbidden returns 403), **Update metadata** (admin partial update preserves other fields, non-admin 403, 404 non-existent), **Soft delete** (SUSPENDED→DEPRECATED ok, ACTIVE→DEPRECATED rejected 400, non-admin 403).
  - **Depends on**: T2.08, T2.09, T2.10, T2.11, T2.12, T2.13 (all routes)

**Checkpoint**: All tests green. Agent Registry feature complete.

---

## Dependencies & Execution Order

### Dependency Graph

```
T2.01 ──┐
T2.02 ──┼──> T2.06 ──┐
T2.03   │             ├──> T2.08 ──┬──> T2.09 ──┐
        │   T2.07 ────╯    │       ├──> T2.10   │
T2.04 ──> T2.05 ───────────╯       ├──> T2.11   ├──> T2.14
                                    ├──> T2.12   │
                                    └──> T2.13 ──╯
```

### Parallel Opportunities

- **Batch 1** (no deps): T2.01, T2.02, T2.04 — all in parallel
- **Batch 2** (after T2.02): T2.03 (health score tests)
- **Batch 3** (after T2.04): T2.05 (SSE route in app.ts)
- **Batch 4** (after T2.01 + T2.02): T2.06 (service) and T2.07 (schema) — in parallel
- **Batch 5** (after T2.05 + T2.06 + T2.07): T2.08 (first route + app.ts registration)
- **Batch 6** (after T2.08): T2.09, T2.10, T2.11, T2.12, T2.13 — all in parallel
- **Batch 7** (after all routes): T2.14 (integration tests)

### Strictly Sequential Chains

1. T2.04 → T2.05 (SSE plugin before SSE route)
2. T2.01 → T2.06 (types before service)
3. T2.02 → T2.06 (health score util before service)
4. T2.06 + T2.07 → T2.08 (service + schema before first route)
5. T2.08 → T2.09..T2.13 (first route scaffolds the file + app.ts registration)
6. T2.09..T2.13 → T2.14 (all routes before integration tests)

### Key Flags

- **T2.04 is SHARED INFRASTRUCTURE** — the SSE plugin will be imported by Audit (EPIC 3), Approvals (EPIC 4), and other future modules. Design for generic event broadcasting, NOT agent-specific.
- **T2.02 is a PURE UTILITY** — isolated from Prisma/Fastify for easy unit testing.
- **Cost/stats will be zero initially** — AuditLog queries in T2.06 (`computeAgentStats`) will return zeros until EPIC 3 (Audit & Observability) populates data. Health score defaults to 100 for agents with no activity.

---

## Implementation Strategy

### MVP First (Agent Registration E2E)

1. Complete Phase 1: T2.01 + T2.02 (types + health score)
2. Complete Phase 2: T2.04 + T2.05 (SSE infra)
3. Complete Phase 3: T2.06 (service)
4. Complete Phase 4: T2.07 (schema)
5. Complete T2.08 (POST route + app.ts registration)
6. **STOP and VALIDATE**: Agent registration works end-to-end with SSE

### Full Delivery

7. Complete T2.09..T2.13 (remaining routes)
8. Complete T2.03 + T2.14 (all tests)

---

## Summary

- **Total tasks**: 14
- **Parallelizable batches**: 7 (max 5 tasks in Batch 6)
- **MVP scope**: T2.01, T2.02, T2.04, T2.05, T2.06, T2.07, T2.08 (agent registration end-to-end with SSE)
- **Shared infra**: T2.04 (SSE plugin — used by EPIC 3, 4, and beyond)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- All routes in same file (`agents.routes.ts`) but added incrementally for independent review
- Constitution compliance: TypeScript strict, Zod validation on all inputs/outputs, Prisma-only DB access, SSE not WebSockets, JWT auth on all protected routes
