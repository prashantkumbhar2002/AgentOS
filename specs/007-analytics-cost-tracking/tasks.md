# Tasks: Analytics & Cost Tracking

**Input**: Design documents from `/specs/007-analytics-cost-tracking/`
**Prerequisites**: spec.md, plan.md, contracts/, data-model.md, research.md
**Organization**: Tasks grouped by phase with clear dependencies. Each task completable in one focused session.

## Format: `T6.[number] — [file] — [description]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions

---

## Phase 1: Shared Types

**Purpose**: Create shared Zod schemas in packages/types. No Fastify or Prisma involvement.

- [ ] T6.01 [P] — `packages/types/src/analytics.ts` + `packages/types/src/index.ts` — Create all analytics Zod schemas: CostSummarySchema ({ todayUsd: z.number(), last7dUsd: z.number(), last30dUsd: z.number(), totalUsd: z.number(), changeVs7dAgo: z.number() }), CostTimelineQuerySchema ({ days: z.enum(['7','30','90']).transform(Number).default('30'), agentId: z.string().uuid().optional() }), CostTimelineSchema ({ dates: z.array(z.string()), series: z.array(z.object({ agentId: z.string().uuid(), agentName: z.string(), dailyCosts: z.array(z.number()) })) }), DateRangeQuerySchema ({ fromDate: z.string().datetime().optional(), toDate: z.string().datetime().optional() }), UsageStatsSchema ({ totalRuns: z.number(), totalLlmCalls: z.number(), totalToolCalls: z.number(), avgRunCostUsd: z.number(), totalApprovals: z.number(), autoApproved: z.number(), approved: z.number(), denied: z.number(), expired: z.number() }), AgentLeaderboardQuerySchema ({ sortBy: z.enum(['cost','runs','errorRate']).default('cost'), limit: z.coerce.number().min(1).max(100).default(10) }), AgentLeaderboardSchema ({ agents: z.array(z.object({ agentId, agentName, ownerTeam, totalCostUsd, totalRuns, errorRate, avgLatencyMs, healthScore })) }), ModelUsageSchema ({ models: z.array(z.object({ model: z.string(), callCount: z.number(), totalInputTokens: z.number(), totalOutputTokens: z.number(), totalCostUsd: z.number() })) }). Update barrel `index.ts` to re-export all analytics schemas and types.

**Checkpoint**: Shared types ready. No HTTP or DB layer yet.

---

## Phase 2: Service Layer (Aggregation Logic)

**Purpose**: Implement all Prisma aggregation functions. Pure business logic, no Fastify dependency.

- [ ] T6.02 — `apps/api/src/modules/analytics/analytics.service.ts` — Create all service functions: `getCostSummary(prisma, fromDate?, toDate?)` — aggregate costUsd for today, last 7d, last 30d, total; compute changeVs7dAgo as ((current7d - previous7d) / previous7d * 100), handle division by zero (return 0). `getCostTimeline(prisma, days, agentId?)` — generate date range array (today minus N days), groupBy agentId+createdAt (date-truncated), left-join with date array to zero-fill, include agent names from Agent table. `getUsageStats(prisma, fromDate?, toDate?)` — distinct traceId count for totalRuns, count by event type for llm/tool calls, aggregate costUsd/totalRuns for avg cost, groupBy approval ticket status for approval counts. `getAgentLeaderboard(prisma, sortBy, limit)` — groupBy agentId with _sum(costUsd), _avg(latencyMs), _count, calculate errorRate (success=false / total per agent), calculate approvalDenyRate from ApprovalTicket, call calculateHealthScore(), sort by requested field descending. `getModelUsage(prisma)` — groupBy model (exclude null), _sum(costUsd, inputTokens, outputTokens), _count, sort by totalCostUsd desc. Validate fromDate < toDate in getCostSummary and getUsageStats — throw if invalid.
  - **Depends on**: T6.01 (types)

**Checkpoint**: All aggregation logic implemented. No HTTP layer yet.

---

## Phase 3: Service Unit Tests

**Purpose**: Vitest unit tests for the service layer with seeded data.

- [ ] T6.03 — `apps/api/src/modules/analytics/analytics.service.test.ts` — Vitest unit tests for all 5 service functions. Test setup: create test agent, seed AuditLog entries with known costs/events/models/traceIds, seed ApprovalTickets with various statuses. Test cases: (1) getCostSummary returns correct sums for today/7d/30d/total, (2) getCostSummary with date range filters correctly, (3) getCostSummary with fromDate > toDate throws, (4) getCostSummary on empty DB returns all zeros, (5) getCostTimeline returns correct date count and zero-fills, (6) getCostTimeline with agentId filter returns single series, (7) getUsageStats returns correct run/call/approval counts, (8) getAgentLeaderboard sorts by cost, (9) getAgentLeaderboard sorts by errorRate, (10) getModelUsage excludes null models, sorts by cost, (11) all functions return zeros/empty on empty DB. Cleanup: delete seeded data after each test.
  - **Depends on**: T6.02 (service functions)

**Checkpoint**: Service layer fully tested. No HTTP layer yet.

---

## Phase 4: Routes + Registration

**Purpose**: Implement all 5 analytics routes and register in app.ts.

- [ ] T6.04 — `apps/api/src/modules/analytics/analytics.routes.ts` + `apps/api/src/modules/analytics/analytics.schema.ts` + `apps/api/src/app.ts` — Create schema file as thin re-export from @agentos/types. Create routes file with: `GET /costs` (authenticated, date range validation, calls getCostSummary), `GET /costs/timeline` (authenticated, days+agentId query validation, calls getCostTimeline), `GET /usage` (authenticated, date range validation, calls getUsageStats), `GET /agents` (authenticated, sortBy+limit validation, calls getAgentLeaderboard), `GET /models` (authenticated, calls getModelUsage). All routes: Zod-validate query params, return 400 on validation failure, catch service errors (fromDate > toDate → 400). Register in app.ts with prefix `/api/analytics`. Note: `/costs/timeline` route must be registered BEFORE `/costs` if using parameterized routes — or use separate route registrations.
  - **Depends on**: T6.02 (service), T6.01 (types)

**Checkpoint**: All 5 analytics routes operational.

---

## Phase 5: Integration Tests

**Purpose**: Comprehensive Supertest integration tests covering all routes.

- [ ] T6.05 — `apps/api/src/modules/analytics/analytics.test.ts` — Supertest integration tests (15+ cases). Test setup: `buildApp()`, seed admin user + test agent + audit logs + approval tickets, cleanup after each test. Test groups: **Cost summary** (returns all fields with correct structure, date range filters, invalid date range 400, empty DB returns zeros), **Cost timeline** (returns correct date count for days=7/30, zero-fills gaps, agentId filter, empty DB returns empty series), **Usage stats** (returns correct counts, date range filters, empty DB returns zeros), **Agent leaderboard** (sort by cost default, sort by errorRate, limit works, includes healthScore), **Model usage** (sorted by cost desc, excludes null models, empty returns empty array), **Auth** (401 without token).
  - **Depends on**: T6.04 (all routes)

**Checkpoint**: All tests green. Analytics module complete.

---

## Dependencies & Execution Order

### Dependency Graph

```
T6.01 ──> T6.02 ──> T6.03
              │
              └──> T6.04 ──> T6.05
```

### Parallel Opportunities

- **Batch 1** (no deps): T6.01 (types only)
- **Batch 2** (after T6.01): T6.02 (service)
- **Batch 3** (after T6.02): T6.03 (unit tests) and T6.04 (routes) — in parallel
- **Batch 4** (after T6.04): T6.05 (integration tests)

### Strictly Sequential Chains

1. T6.01 → T6.02 → T6.03 (types → service → unit tests)
2. T6.01 → T6.02 → T6.04 → T6.05 (types → service → routes → integration tests)

### Key Flags

- **T6.02 uses Prisma groupBy + aggregate** — all aggregation is pushed to PostgreSQL, never load rows into memory.
- **T6.02 getCostTimeline** — generate date range array in TypeScript, then left-join with Prisma groupBy results to zero-fill.
- **T6.02 getAgentLeaderboard** — reuses existing `calculateHealthScore()` from `apps/api/src/utils/health-score.ts`.
- **No new Prisma migration needed** — the composite index `@@index([agentId, createdAt])` on AuditLog already exists as separate indexes; a composite can be added but is optional for correctness.
- **No new Prisma models** — all data from existing AuditLog, ApprovalTicket, Agent tables.

---

## Summary

- **Total tasks**: 5
- **Parallelizable batches**: 4
- **MVP scope**: T6.01, T6.02, T6.04 (types + service + routes = working endpoints)
- **No new dependencies**: Uses existing Prisma models, no new npm packages
- **Constitution compliance**: TypeScript strict, Zod validation, Prisma-only, JWT auth, read-only endpoints
- **Performance**: All queries use Prisma groupBy/aggregate — set-based, not row-based

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- T6.02 is the most complex — 5 aggregation functions with date math, zero-fill, and health score calculation
- All cost values maintain 6-decimal USD precision per Constitution Principle VIII
- No role restriction — any authenticated user can view analytics
