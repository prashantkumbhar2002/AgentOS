# Tasks: Fix N+1 Queries (FIX-04)

## Phase 1 — Fix N+1 in Agent List

- [ ] **N01** — `apps/api/src/repositories/prisma/PrismaAgentRepository.ts` — Replace the `Promise.all(agents.map(async (agent) => prisma.auditLog.aggregate(...)))` in `findMany()` with a single `prisma.auditLog.groupBy({ by: ['agentId'], where: { agentId: { in: agentIds }, createdAt: { gte: sevenDaysAgo } }, _sum: { costUsd: true } })`. Build a `Map<agentId, cost>` from the result and look up each agent's cost from the map (defaulting to 0).

## Phase 2 — Fix Sequential Queries in Analytics

- [ ] **N02** — `apps/api/src/repositories/prisma/PrismaAnalyticsRepository.ts` — Replace the sequential `for (const range of ranges)` loop in `getCostAggregates()` with `Promise.all(ranges.map(...))` to parallelize the 5 aggregate queries instead of running them one-by-one.

## Phase 3 — Update Mock Repository (if needed)

- [ ] **N03** — `apps/api/src/repositories/mock/MockAgentRepository.ts` — Verify the mock `findMany()` implementation still matches the interface. Since we're only changing the Prisma implementation (not the interface), the mock should remain unchanged. Verify and confirm.

## Phase 4 — Tests

- [ ] **N04** — `apps/api/src/repositories/prisma/PrismaAgentRepository.test.ts` — Add a Vitest unit test that verifies the N+1 fix: spy on `prisma.auditLog.groupBy` and assert it is called exactly once (not N times) when listing 5 agents. Use a mock Prisma client.

## Phase 5 — Validation

- [ ] **N05** — Run TypeScript compilation (`npx tsc --noEmit`) — verify zero new errors.

- [ ] **N06** — Run all unit tests (`npx vitest run`) — verify no regressions.

- [ ] **N07** — Grep verification: zero instances of `agents.map(async (agent) => { ... prisma.auditLog.aggregate` pattern in `PrismaAgentRepository.ts`.

## Dependency Order

```
N01 (fix agent list N+1) ─┐
N02 (parallelize analytics)├── N03 (verify mock)
                           │     └── N04 (test)
                           └── N05-N07 (validation)
```
