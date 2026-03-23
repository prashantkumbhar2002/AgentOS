# Tasks: Repository Pattern Refactor (FIX-01)

## Phase 1 — Foundation (DTOs + Interfaces)

- [ ] **R01** — `apps/api/src/types/dto.ts` — Define all service return DTOs (AgentSummary, AgentDetail, AuditLogEntry, ApprovalTicketDetail, PolicyDetail, analytics DTOs, PaginatedResult). No `unknown` or `any`.

- [ ] **R02** — `apps/api/src/repositories/interfaces/IAgentRepository.ts` — Define IAgentRepository interface (findById, findMany, create, update, updateStatus, exists, updateLastActiveAt).

- [ ] **R03** — `apps/api/src/repositories/interfaces/IAuditRepository.ts` — Define IAuditRepository interface (create, findMany, findByTraceId, getAgentStats, exportRows).

- [ ] **R04** — `apps/api/src/repositories/interfaces/IApprovalRepository.ts` — Define IApprovalRepository interface (create, findById, findMany, resolve, expireStale, updateSlackMsgTs, getPendingCount).

- [ ] **R05** — `apps/api/src/repositories/interfaces/IPolicyRepository.ts` — Define IPolicyRepository interface (create, findById, findMany, update, delete, findByName, getAssignedAgentCount, assign/unassign, findAssignment, getAgentPoliciesWithRules, getGlobalPoliciesWithRules).

- [ ] **R06** — `apps/api/src/repositories/interfaces/IAnalyticsRepository.ts` — Define IAnalyticsRepository interface (getCostAggregates, getCostByAgentByDay, getUsageCounts, getApprovalCountsByStatus, getAgentMetrics, getModelMetrics). [P]

## Phase 2 — Prisma Implementations

- [ ] **R07** — `apps/api/src/repositories/prisma/PrismaAgentRepository.ts` — Implement IAgentRepository using PrismaClient. Move all agent query logic from agents.service.ts. Include 7d cost aggregation in findMany, tool includes in findById, nested tool creation in create.

- [ ] **R08** — `apps/api/src/repositories/prisma/PrismaAuditRepository.ts` — Implement IAuditRepository. Move query construction, aggregate, and export logic from audit.service.ts. Handle Prisma.JsonNull for inputs/outputs.

- [ ] **R09** — `apps/api/src/repositories/prisma/PrismaApprovalRepository.ts` — Implement IApprovalRepository. Move ticket queries, includes (agent, resolvedBy), and bulk expiration from approvals.service.ts.

- [ ] **R10** — `apps/api/src/repositories/prisma/PrismaPolicyRepository.ts` — Implement IPolicyRepository. Move policy CRUD queries, agent assignment queries, and evaluator data loading (getAgentPoliciesWithRules, getGlobalPoliciesWithRules) from policies.service.ts and policies.evaluator.ts.

- [ ] **R11** — `apps/api/src/repositories/prisma/PrismaAnalyticsRepository.ts` — Implement IAnalyticsRepository. Move all groupBy, aggregate, and findMany queries from analytics.service.ts. Return raw aggregated data; leave date-filling and calculations to the service. [P]

## Phase 3 — Service Refactor

- [ ] **R12** — Refactor `agents.service.ts` to class `AgentService`. Constructor takes `IAgentRepository` and `IAuditRepository`. Remove all `PrismaClient` imports. Keep `VALID_TRANSITIONS`, `validateStatusTransition`, and `calculateHealthScore` as business logic. All methods return typed DTOs.

- [ ] **R13** — Refactor `audit.service.ts` to class `AuditService`. Constructor takes `IAuditRepository` and `IAgentRepository`. Remove all `@prisma/client` imports. Keep cost calculation, CSV generation, trace enrichment, and stats computation as business logic. All methods return typed DTOs.

- [ ] **R14** — Refactor `approvals.service.ts` to class `ApprovalService`. Constructor takes `IApprovalRepository` and `IAgentRepository`. Remove all `PrismaClient` imports. Keep expiration time calculation, resolution validation (status check, expiry check), and comment appending as business logic.

- [ ] **R15** — Refactor `policies.service.ts` to class `PolicyService`. Constructor takes `IPolicyRepository` and `IAgentRepository`. Remove all `@prisma/client` imports. Keep unique name enforcement, deletion guard (agent count check), and assignment validation as business logic.

- [ ] **R16** — Refactor `policies.evaluator.ts` to use `IPolicyRepository` instead of `PrismaClient`. The `evaluatePolicy` function (or method) receives the repository and calls `getAgentPoliciesWithRules` + `getGlobalPoliciesWithRules`. Keep `ruleMatches` and `checkConditions` as pure functions.

- [ ] **R17** — Refactor `analytics.service.ts` to class `AnalyticsService`. Constructor takes `IAnalyticsRepository`, `IAgentRepository`. Remove all `PrismaClient` imports. Keep date range validation, zero-filling, health score calculation, changeVs7dAgo computation, and sorting as business logic.

## Phase 4 — Composition Root + Route Wiring

- [ ] **R18** — `apps/api/src/container.ts` — Create `createContainer(prisma: PrismaClient)` function. Instantiate all 5 Prisma repositories, pass to 5 service constructors. Return typed `ServiceContainer`. Declare Fastify module augmentation for `fastify.services`.

- [ ] **R19** — Update `apps/api/src/plugins/prisma.ts` — After PrismaClient is created, call `createContainer(prisma)` and `fastify.decorate('services', container)`.

- [ ] **R20** — Update `apps/api/src/modules/agents/agents.routes.ts` — Replace `fastify.prisma` calls to service functions with `fastify.services.agentService.*`. Remove direct Prisma usage.

- [ ] **R21** — Update `apps/api/src/modules/audit/audit.routes.ts` — Replace with `fastify.services.auditService.*`.

- [ ] **R22** — Update `apps/api/src/modules/approvals/approvals.routes.ts` — Replace with `fastify.services.approvalService.*`. Update policy evaluator call to use the service/repository.

- [ ] **R23** — Update `apps/api/src/modules/policies/policies.routes.ts` — Replace with `fastify.services.policyService.*`.

- [ ] **R24** — Update `apps/api/src/modules/analytics/analytics.routes.ts` — Replace with `fastify.services.analyticsService.*`.

- [ ] **R25** — Update `apps/api/src/modules/showcase/showcase.routes.ts` — Update showcase agent routes to use services through the container if they call service functions directly. [P]

## Phase 5 — Mock Repositories + Unit Tests

- [ ] **R26** — `apps/api/src/repositories/mock/MockAgentRepository.ts` — In-memory Map-based mock implementing IAgentRepository. Support pre-loading test data via constructor.

- [ ] **R27** — `apps/api/src/repositories/mock/MockAuditRepository.ts` — In-memory mock implementing IAuditRepository. [P]

- [ ] **R28** — `apps/api/src/repositories/mock/MockApprovalRepository.ts` — In-memory mock implementing IApprovalRepository. [P]

- [ ] **R29** — `apps/api/src/repositories/mock/MockPolicyRepository.ts` — In-memory mock implementing IPolicyRepository. [P]

- [ ] **R30** — `apps/api/src/repositories/mock/MockAnalyticsRepository.ts` — In-memory mock implementing IAnalyticsRepository. [P]

- [ ] **R31** — `apps/api/src/modules/agents/agents.service.unit.test.ts` — 5+ unit tests: valid status transition, invalid status transition, create agent returns typed DTO, getById returns null for missing, listAgents pagination.

- [ ] **R32** — `apps/api/src/modules/audit/audit.service.unit.test.ts` — 5+ unit tests: createLog returns typed entry, queryLogs pagination, getTrace returns null for missing traceId, getAgentStats computation, CSV export format.

- [ ] **R33** — `apps/api/src/modules/approvals/approvals.service.unit.test.ts` — 5+ unit tests: createTicket sets expiresAt, resolveTicket rejects non-PENDING, resolveTicket rejects expired, listTickets returns pendingCount, expirePendingTickets bulk update.

- [ ] **R34** — `apps/api/src/modules/policies/policies.service.unit.test.ts` — 5+ unit tests: createPolicy rejects duplicate name, deletePolicy rejects when agents assigned, evaluatePolicy DENY wins, evaluatePolicy default REQUIRE_APPROVAL, assignToAgent rejects duplicate.

- [ ] **R35** — `apps/api/src/modules/analytics/analytics.service.unit.test.ts` — 5+ unit tests: date range validation, cost summary changeVs7dAgo calculation, timeline zero-filling, leaderboard sorting, model usage sorting.

## Phase 6 — Validation

- [ ] **R36** — Run all existing integration tests (`npm run test --workspace=apps/api`) and verify 100% pass rate with zero modifications.

- [ ] **R37** — Run all new unit tests and verify they pass without any database or network dependency.

- [ ] **R38** — Verify zero `@prisma/client` imports in any service file (`agents.service.ts`, `audit.service.ts`, `approvals.service.ts`, `policies.service.ts`, `policies.evaluator.ts`, `analytics.service.ts`).

- [ ] **R39** — Verify zero `unknown` or `any` return types in any public service method.

- [ ] **R40** — Start the application (`npm run dev`) and verify it boots successfully with the container wired.

## Dependency Order

```
R01 ──────────────────────────┐
R02-R06 (interfaces) ────────┤
                              ├── R07-R11 (Prisma impls)
                              ├── R26-R30 (mock impls)
                              │
R07-R11 ──────────────────────┼── R12-R17 (service refactor)
                              │
R12-R17 ──────────────────────┼── R18 (container)
                              │
R18 ──────────────────────────┼── R19-R25 (route wiring)
                              │
R26-R30 + R12-R17 ────────────┼── R31-R35 (unit tests)
                              │
R19-R25 + R31-R35 ────────────┴── R36-R40 (validation)
```

Tasks marked [P] can run in parallel with their phase siblings.
