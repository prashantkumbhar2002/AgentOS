# Tasks: Audit Logging & Observability

**Input**: Design documents from `/specs/004-audit-logging/`
**Prerequisites**: spec.md, plan.md, contracts/, data-model.md, research.md
**Organization**: Tasks grouped by phase with clear dependencies. Each task completable in one focused session.

## Format: `T3.[number] — [file] — [description]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions
- Dependencies listed per-task

---

## Phase 1: Shared Types & Utilities

**Purpose**: Create shared Zod schemas and the cost calculator utility. No Fastify or Prisma involvement yet. All tasks in this phase can run in parallel.

- [x] T3.01 [P] — `packages/types/src/audit.ts` + `packages/types/src/index.ts` — Create all audit Zod schemas: AuditEventTypeSchema (z.enum of 6 event types), AuditEventSchema (agentId, traceId, event, model?, toolName?, inputs?, outputs?, inputTokens?, outputTokens?, latencyMs?, success?, errorMsg?, metadata? — NO costUsd field), AuditQuerySchema (agentId?, traceId?, event?, success?, fromDate?, toDate?, page=1, limit=50, export?), AuditLogSchema (full row with id, costUsd, createdAt), TraceIdParamsSchema ({ traceId: z.string().uuid() }), AgentStatsResponseSchema ({ totalRuns, totalCalls, totalCostUsd, avgLatencyMs, errorRate, successRate, topTools: [{ name, count }] }). Update barrel `index.ts` to re-export all audit schemas and types.
- [x] T3.02 [P] — `apps/api/src/utils/cost-calculator.ts` — Create MODEL_PRICING map with per-token prices (claude-opus-4-5: input 0.000015 / output 0.000075, claude-sonnet-4-5: input 0.000003 / output 0.000015, claude-haiku-4-5: input 0.00000025 / output 0.00000125, gpt-4o: input 0.0000025 / output 0.00001, gpt-4o-mini: input 0.00000015 / output 0.0000006). Export `calculateCost(model, inputTokens, outputTokens)` returning USD with 6-decimal precision. Return 0 for unknown models.
- [x] T3.03 [P] — `apps/api/src/utils/cost-calculator.test.ts` — Vitest unit tests for calculateCost: claude-sonnet-4-5 with known tokens, claude-opus-4-5, claude-haiku-4-5, gpt-4o, gpt-4o-mini, unknown model returns 0, zero tokens returns 0, precision to 6 decimal places.
  - **Depends on**: T3.02

**Checkpoint**: Shared types and cost utility ready. No HTTP or DB layer yet.

---

## Phase 2: Service Layer

**Purpose**: Implement all Prisma queries and business logic for audit management.

- [x] T3.04 — `apps/api/src/modules/audit/audit.service.ts` — Create all service functions: `createLog(prisma, data, costUsd)` — insert AuditLog + fire-and-forget `agent.update({ lastActiveAt })`, `queryLogs(prisma, filters)` — paginated query with filters (agentId, traceId, event, success, fromDate/toDate) + totalCostUsd aggregation, `getTrace(prisma, traceId)` — all events for trace ordered by createdAt ASC with agent name, totalCost, totalLatencyMs, startedAt, completedAt, overall success, `getAgentStats(prisma, agentId)` — totalRuns (distinct traceIds), totalCalls (count), totalCostUsd (sum), avgLatencyMs, errorRate, successRate, topTools (group by toolName, count, top 10), `exportCsv(prisma, filters)` — query logs with resolved agent names, return CSV string with headers: id, agentId, agentName, traceId, event, model, toolName, inputTokens, outputTokens, costUsd, latencyMs, success, createdAt.
  - **Depends on**: T3.01 (types), T3.02 (cost calculator)

**Checkpoint**: All business logic implemented and callable. No HTTP layer yet.

---

## Phase 3: Request Schemas

**Purpose**: Bridge shared Zod schemas to Fastify route-level validation objects.

- [x] T3.05 — `apps/api/src/modules/audit/audit.schema.ts` — Thin re-export layer mapping `@agentos/types` audit schemas to Fastify route-level validation objects (body, params, querystring shapes for each route).
  - **Depends on**: T3.01

**Checkpoint**: Schema bridge ready for route handlers.

---

## Phase 4: Routes (each route group independently reviewable)

**Purpose**: Implement all audit routes. Each task adds routes to `apps/api/src/modules/audit/audit.routes.ts`. T3.06 creates the file and registers it in `app.ts`.

- [x] T3.06 — `apps/api/src/modules/audit/audit.routes.ts` + `apps/api/src/app.ts` — Create routes file with `POST /` (ingest audit log). Any authenticated role. Zod validate via AuditEventSchema. Verify agentId exists (400 if not). Calculate costUsd via calculateCost. Persist via createLog. Broadcast SSE `audit.log` event. Per-agent rate limit: 1000 req/min using custom keyGenerator extracting agentId from body. Return 201 `{ id, traceId, costUsd }`. Register `auditRoutes` in `app.ts` with prefix `/api/audit`.
  - **Depends on**: T3.04 (service), T3.05 (schema)
- [x] T3.07 — `apps/api/src/modules/audit/audit.routes.ts` — Add `GET /logs` (query with filters + CSV export). Parse AuditQuerySchema from query params. If `export=csv`: restrict to admin/approver (403 for others), call exportCsv, respond with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="audit-export-[date].csv"`. Else: call queryLogs, return 200 `{ data, total, page, totalCostUsd }`. Add `GET /traces/:traceId` (trace view). Validate traceId param. Call getTrace. Return 404 if not found.
  - **Depends on**: T3.06
- [x] T3.08 — `apps/api/src/modules/audit/audit.routes.ts` — Add `GET /stats/:agentId` (agent statistics). Validate agentId param (UUID). Verify agent exists (404 if not). Call getAgentStats. Return 200 with AgentStatsResponseSchema shape.
  - **Depends on**: T3.06

**Checkpoint**: All 5 audit routes operational (POST log, GET logs, GET logs?export=csv, GET traces/:traceId, GET stats/:agentId).

---

## Phase 5: Integration Tests

**Purpose**: Comprehensive Supertest integration tests covering all routes and edge cases.

- [x] T3.09 — `apps/api/src/modules/audit/audit.test.ts` — Supertest integration tests (15+ cases). Test setup: `buildApp()`, seed test users (admin, viewer) + test agent, cleanup audit logs after each test. Test groups: **Ingest audit log** (happy path 201 with server-calculated costUsd, validation error 400, non-existent agentId 400, SSE broadcast verification), **Query logs** (no filters returns paginated with totalCostUsd, filter by agentId, filter by event type, filter by date range, filter by success, empty results), **Trace view** (happy path with ordered events + aggregates, 404 non-existent trace), **CSV export** (admin gets CSV with correct headers, viewer gets 403), **Agent stats** (correct aggregations from seeded data, zero stats for agent with no logs, 404 for non-existent agent).
  - **Depends on**: T3.06, T3.07, T3.08 (all routes)

**Checkpoint**: All tests green. Backend audit module complete.

---

## Phase 6: Governance SDK

**Purpose**: Create the `packages/governance-sdk` workspace with the GovernanceClient class.

- [x] T3.10 — `packages/governance-sdk/package.json` + `packages/governance-sdk/tsconfig.json` + `packages/governance-sdk/src/index.ts` — Bootstrap the governance-sdk workspace package. `package.json`: name `@agentos/governance-sdk`, main/types pointing to `src/index.ts`, dependencies on `@anthropic-ai/sdk`. `tsconfig.json`: extend root tsconfig. `index.ts`: barrel export for GovernanceClient. Run `npm install` from root to link workspace.
  - **No dependencies** (can start as soon as T3.01 is done for types)
- [x] T3.11 — `packages/governance-sdk/src/GovernanceClient.ts` — Implement full GovernanceClient class. Constructor({ platformUrl, agentId, apiKey }) generates traceId UUID. `logEvent(payload)`: POST to `${platformUrl}/api/audit/log` with auth header, swallow errors (console.warn). `createMessage(params)`: call Anthropic `messages.create`, measure latency, extract usage tokens, call logEvent with llm_call event, re-throw LLM errors after logging. `callTool<T>(toolName, inputs, fn)`: wrap async fn, measure latency, call logEvent with tool_call event, re-throw fn errors after logging. `requestApproval(...)`: throw `Error("requestApproval is not yet implemented — awaiting EPIC 4")`.
  - **Depends on**: T3.10 (SDK package bootstrap)
- [x] T3.12 — `packages/governance-sdk/src/GovernanceClient.test.ts` — Vitest unit tests for GovernanceClient with mocked HTTP (no real API calls). Tests: constructor generates unique traceId, logEvent sends POST with correct body and auth header, logEvent swallows network errors, createMessage logs llm_call event (mock Anthropic SDK), callTool logs tool_call event with latency, callTool re-throws fn errors after logging, requestApproval throws not-implemented error.
  - **Depends on**: T3.11

**Checkpoint**: SDK package complete and tested. Full EPIC 3 feature done.

---

## Dependencies & Execution Order

### Dependency Graph

```
T3.01 ──┬──> T3.04 ──> T3.05 ──> T3.06 ──┬──> T3.07 ──┐
T3.02 ──┤                                 └──> T3.08   ├──> T3.09
T3.03   │                                              │
        │   T3.10 ──> T3.11 ──> T3.12                  │
        └──────────────╯                                │
```

### Parallel Opportunities

- **Batch 1** (no deps): T3.01, T3.02, T3.10 — all in parallel
- **Batch 2** (after T3.02): T3.03 (cost calculator tests)
- **Batch 3** (after T3.01 + T3.02): T3.04 (service) and T3.05 (schema) — in parallel
- **Batch 4** (after T3.04 + T3.05): T3.06 (POST route + app.ts registration)
- **Batch 5** (after T3.06): T3.07, T3.08 — in parallel
- **Batch 6** (after T3.07 + T3.08): T3.09 (integration tests)
- **SDK track** (independent): T3.10 → T3.11 → T3.12 (can run in parallel with Batch 3–6)

### Strictly Sequential Chains

1. T3.01 → T3.04 (types before service)
2. T3.02 → T3.04 (cost calculator before service)
3. T3.04 + T3.05 → T3.06 (service + schema before first route)
4. T3.06 → T3.07, T3.08 (first route scaffolds the file + app.ts registration)
5. T3.07 + T3.08 → T3.09 (all routes before integration tests)
6. T3.10 → T3.11 → T3.12 (SDK bootstrap → implementation → tests)

### Key Flags

- **T3.02 is a PURE UTILITY** — isolated from Prisma/Fastify for easy unit testing. Complements the existing `health-score.ts` utility from EPIC 2.
- **T3.04 uses fire-and-forget** for lastActiveAt update — justified exception to BullMQ principle (documented in plan.md).
- **T3.10–T3.12 are a separate workspace** — `packages/governance-sdk` is a new Turborepo workspace. Requires `npm install` after bootstrap to link.
- **Cost/stats now powered by real data** — EPIC 2's `computeAgentStats` returned zeros because audit data didn't exist. After EPIC 3, the agent detail page will show real statistics.
- **SDK requestApproval is a stub** — throws not-implemented until EPIC 4 (Approvals) is built.

---

## Implementation Strategy

### MVP First (Audit Ingestion E2E)

1. Complete Phase 1: T3.01 + T3.02 (types + cost calculator)
2. Complete Phase 2: T3.04 (service)
3. Complete Phase 3: T3.05 (schema)
4. Complete T3.06 (POST route + app.ts registration)
5. **STOP and VALIDATE**: Audit event ingestion works end-to-end with cost calculation + SSE

### Full Delivery

6. Complete T3.07 + T3.08 (remaining routes)
7. Complete T3.03 + T3.09 (all tests)
8. Complete T3.10 + T3.11 + T3.12 (governance SDK)

---

## Summary

- **Total tasks**: 12
- **Parallelizable batches**: 6 (plus independent SDK track)
- **MVP scope**: T3.01, T3.02, T3.04, T3.05, T3.06 (audit ingestion end-to-end)
- **New workspace**: `packages/governance-sdk` (T3.10–T3.12)
- **Constitution compliance**: TypeScript strict, Zod validation, Prisma-only, SSE broadcast, JWT auth, RBAC on CSV export, 6-decimal cost precision

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Routes added incrementally to `audit.routes.ts` for independent review
- SDK track (T3.10–T3.12) is fully independent from the backend routes track
- The `@anthropic-ai/sdk` dependency is only in governance-sdk, not in apps/api
