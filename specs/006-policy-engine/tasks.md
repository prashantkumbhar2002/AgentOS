# Tasks: Policy Engine

**Input**: Design documents from `/specs/006-policy-engine/`
**Prerequisites**: spec.md, plan.md, contracts/, data-model.md, research.md
**Organization**: Tasks grouped by phase with clear dependencies. Each task completable in one focused session.

## Format: `T5.[number] — [file] — [description]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions

---

## Phase 1: Shared Types

**Purpose**: Create shared Zod schemas in packages/types. No Fastify or Prisma involvement.

- [X] T5.01 [P] — `packages/types/src/policy.ts` + `packages/types/src/index.ts` — Create all policy Zod schemas: PolicyEffectSchema (z.enum of ALLOW, DENY, REQUIRE_APPROVAL), PolicyRuleInputSchema ({ actionType: string.min(1), riskTiers: RiskTierSchema[], effect: PolicyEffectSchema, conditions?: z.record(z.unknown()).optional() }), CreatePolicySchema ({ name: string.min(1), description: string.min(1), rules: PolicyRuleInputSchema[] }), UpdatePolicySchema ({ name?: string, description?: string, isActive?: boolean }), PolicyIdParamsSchema ({ id: z.string().uuid() }), PolicyListQuerySchema ({ isActive?: z.coerce.boolean().optional(), page=1, limit=20 }), PolicyAssignSchema ({ agentId: z.string().uuid() }), PolicyUnassignParamsSchema ({ id: z.string().uuid(), agentId: z.string().uuid() }), PolicyEvaluationRequestSchema ({ agentId: z.string().uuid(), actionType: string.min(1), riskTier: RiskTierSchema, context?: z.record(z.unknown()).optional() }), PolicyEvaluationResultSchema ({ effect: PolicyEffectSchema, matchedRule?: object, matchedPolicy?: { id, name }, reason: string }). Update barrel `index.ts` to re-export all policy schemas and types.

**Checkpoint**: Shared types ready. No HTTP or DB layer yet.

---

## Phase 2: Evaluator (Pure Function + Unit Tests)

**Purpose**: Implement the policy evaluation logic as a pure function. Test in total isolation from Fastify.

- [X] T5.02 — `apps/api/src/modules/policies/policies.evaluator.ts` — Create pure evaluation function: `evaluatePolicy(prisma, agentId, actionType, riskTier, context?)` — loads agent-specific policies (via AgentPolicy join), then global policies (policies with zero AgentPolicy entries), iterates active policies and their rules, collects matched effects using `ruleMatches()`, resolves priority DENY > REQUIRE_APPROVAL > ALLOW > default REQUIRE_APPROVAL. Returns `{ effect, matchedRule?, matchedPolicy?, reason }`. Create helper `ruleMatches(rule, actionType, riskTier, context)` — checks actionType match (wildcard "*" matches all), riskTier match (empty array matches all), and conditions match via `checkConditions()` (shallow key-value equality). Create helper `checkConditions(conditions, context)` — for each key in conditions, context must have same value. Export `evaluatePolicy` for use by routes and approvals module.
  - **Depends on**: T5.01 (types)

- [X] T5.03 — `apps/api/src/modules/policies/policies.evaluator.test.ts` — Vitest unit tests for the evaluator. Mock Prisma client with in-memory policy/rule data. Test cases: (1) DENY wins over ALLOW when both match, (2) REQUIRE_APPROVAL wins over ALLOW, (3) default REQUIRE_APPROVAL when no rules match, (4) wildcard actionType "*" matches any action, (5) empty riskTiers array matches all tiers, (6) conditions match — rule with `{ recipientType: "external" }` matches context `{ recipientType: "external" }`, (7) conditions mismatch — rule skipped when context doesn't match, (8) inactive policy skipped, (9) agent-specific policy evaluated before global, (10) non-existent agent returns null/appropriate error.
  - **Depends on**: T5.02 (evaluator function)

**Checkpoint**: Evaluator fully tested in isolation. No HTTP layer yet.

---

## Phase 3: Service Layer

**Purpose**: Implement all Prisma queries for policy CRUD and agent assignment.

- [X] T5.04 — `apps/api/src/modules/policies/policies.service.ts` — Create all service functions: `createPolicy(prisma, data)` — insert Policy with nested rules create, enforce unique name (catch Prisma unique constraint or check first). `listPolicies(prisma, query)` — paginated query with optional isActive filter, include rules, return { data, total, page, limit }. `getPolicyById(prisma, id)` — findUnique with rules and agents (include agent name). `updatePolicy(prisma, id, data)` — update name/description/isActive, return updated policy or null. `deletePolicy(prisma, id)` — check AgentPolicy count first, if > 0 throw with count, otherwise delete rules then policy. `assignToAgent(prisma, policyId, agentId)` — verify policy and agent exist, check for duplicate assignment, create AgentPolicy. `unassignFromAgent(prisma, policyId, agentId)` — delete AgentPolicy, throw if not found.
  - **Depends on**: T5.01 (types)

**Checkpoint**: All CRUD and assignment logic implemented. No HTTP layer yet.

---

## Phase 4: Routes

**Purpose**: Implement all policy API routes. Register in app.ts.

- [X] T5.05 — `apps/api/src/modules/policies/policies.routes.ts` + `apps/api/src/modules/policies/policies.schema.ts` + `apps/api/src/app.ts` — Create schema file as thin re-export from @agentos/types. Create routes file with: `POST /` (admin only, create policy), `GET /` (any authenticated, list with filters), `GET /:id` (any authenticated, single policy with rules and agents), `PATCH /:id` (admin only, update policy), `DELETE /:id` (admin only, delete with assignment check). Register `policyRoutes` in `app.ts` with prefix `/api/policies`.
  - **Depends on**: T5.04 (service), T5.01 (types)

- [X] T5.06 — `apps/api/src/modules/policies/policies.routes.ts` — Add assignment routes and evaluation route: `POST /:id/assign` (admin only, assign policy to agent), `DELETE /:id/assign/:agentId` (admin only, unassign), `POST /evaluate` (any authenticated, call evaluatePolicy and return result). Note: `/evaluate` route must be registered BEFORE `/:id` to avoid route conflict.
  - **Depends on**: T5.05 (CRUD routes), T5.02 (evaluator)

**Checkpoint**: All 8 policy routes operational.

---

## Phase 5: Integration Tests

**Purpose**: Comprehensive Supertest integration tests covering all routes and edge cases.

- [X] T5.07 — `apps/api/src/modules/policies/policies.test.ts` — Supertest integration tests (15+ cases). Test setup: `buildApp()`, seed admin/approver/viewer users + test agent, cleanup policies after each test. Test groups: **Create policy** (happy path 201 with rules, duplicate name 400, non-admin 403, empty rules accepted), **List policies** (returns paginated data, filter by isActive), **Get policy** (returns full policy with rules and agents, 404 for non-existent), **Update policy** (admin deactivates policy 200, non-admin 403), **Delete policy** (admin deletes unassigned 200, assigned policy 400 with count), **Assign/Unassign** (assign 200, duplicate 400, unassign 200, unassign non-existent 404), **Evaluate** (DENY wins, ALLOW returned, default REQUIRE_APPROVAL, wildcard match, agent not found 404).
  - **Depends on**: T5.05, T5.06 (all routes)

**Checkpoint**: All tests green. Backend policy module complete.

---

## Phase 6: Wire into Approvals

**Purpose**: Replace the EPIC 4 evaluatePolicy stub with the real policy engine.

- [x] T5.08 — `apps/api/src/modules/approvals/approvals.service.ts` + `apps/api/src/modules/approvals/approvals.routes.ts` — Remove the stub `evaluatePolicy()` function from approvals.service.ts. In approvals.routes.ts POST handler, import `evaluatePolicy` from `../policies/policies.evaluator.js`. Replace the stub call with the real evaluator: pass `fastify.prisma`, `parsed.data.agentId`, `parsed.data.actionType`, derive riskTier from riskScore using getRiskLabel(), and pass empty context. Map the result: if effect is ALLOW → return 200 `{ status: "AUTO_APPROVED" }`, if DENY → return 403 with `{ error: "Action blocked by policy", policyName }`, if REQUIRE_APPROVAL → create ticket as before. Verify all existing approval tests still pass. Remove unused PolicyEffect/PolicyEvaluation types from approvals.service.ts.
  - **Depends on**: T5.02 (evaluator), T5.07 (all policy tests green)

**Checkpoint**: Approval workflow uses real policy engine. Full EPIC 5 done.

---

## Dependencies & Execution Order

### Dependency Graph

```
T5.01 ──┬──> T5.02 ──> T5.03
        │              │
        ├──> T5.04     │
        │              │
        └──────────────┼──> T5.05 ──> T5.06 ──> T5.07
                       │
                       └──> T5.08
```

### Parallel Opportunities

- **Batch 1** (no deps): T5.01 (types only)
- **Batch 2** (after T5.01): T5.02 (evaluator) and T5.04 (service) — in parallel
- **Batch 3** (after T5.02): T5.03 (evaluator tests) — can parallel with T5.04 if not done
- **Batch 4** (after T5.04 + T5.02): T5.05 (CRUD routes)
- **Batch 5** (after T5.05): T5.06 (assignment + evaluate routes)
- **Batch 6** (after T5.06): T5.07 (integration tests)
- **Batch 7** (after T5.02 + T5.07): T5.08 (wire into approvals)

### Strictly Sequential Chains

1. T5.01 → T5.02 → T5.03 (types → evaluator → evaluator tests)
2. T5.01 → T5.04 → T5.05 → T5.06 → T5.07 (types → service → routes → tests)
3. T5.02 + T5.07 → T5.08 (evaluator + all tests → approval integration)

### Key Flags

- **T5.02 is a PURE FUNCTION** — no Fastify dependency, testable with mocked Prisma.
- **T5.03 must pass before T5.08** — evaluator must be proven correct before wiring into approvals.
- **T5.06 has a ROUTE ORDER concern** — `POST /evaluate` must be registered before `GET /:id` to avoid Fastify treating "evaluate" as an :id parameter.
- **T5.08 REPLACES A STUB** — the EPIC 4 `evaluatePolicy()` in approvals.service.ts is deleted and replaced with the real import.

---

## Implementation Strategy

### MVP First (Evaluator + CRUD E2E)

1. Complete Phase 1: T5.01 (types)
2. Complete Phase 2: T5.02 + T5.03 (evaluator + unit tests)
3. Complete Phase 3: T5.04 (service)
4. Complete Phase 4: T5.05 + T5.06 (all routes)
5. **STOP and VALIDATE**: Create, list, evaluate policies end-to-end

### Full Delivery

6. Complete T5.07 (integration tests)
7. Complete T5.08 (wire into approvals, verify no regressions)

---

## Summary

- **Total tasks**: 8
- **Parallelizable batches**: 7
- **MVP scope**: T5.01, T5.02, T5.03, T5.04, T5.05, T5.06 (policy CRUD + evaluation)
- **No new dependencies**: Uses existing Prisma models, no new npm packages
- **Critical integration**: T5.08 replaces EPIC 4 stub — must not break existing 19 approval tests
- **Constitution compliance**: TypeScript strict, Zod validation, Prisma-only, JWT auth, RBAC on CRUD routes

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- T5.02 + T5.03 are the most critical — the evaluator is the brain of the policy engine
- T5.08 is the riskiest — run all approval tests after wiring
- No new Prisma migration needed — models already exist
