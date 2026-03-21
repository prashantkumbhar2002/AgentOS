# Implementation Plan: Policy Engine

**Branch**: `002-jwt-auth-rbac` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-policy-engine/spec.md`

## Summary

Build a policy engine that defines governance rules for AI agent actions. Policies contain rules that match on action type, risk tier, and optional conditions. The evaluator resolves matched effects with priority ordering (DENY > REQUIRE_APPROVAL > ALLOW), supports agent-specific and global policies, and integrates with the existing approval workflow by replacing the EPIC 4 stub.

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: Fastify v4, Zod, Prisma
**Storage**: PostgreSQL 16 via Prisma v5
**Testing**: Vitest (unit) + Supertest (integration)
**Target Platform**: Linux server (Docker)
**Project Type**: Web service (monorepo workspace: apps/api)
**Constraints**: Prisma models already exist (Policy, PolicyRule, AgentPolicy). Seed data exists. The approval workflow stub must be replaced without breaking existing tests.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | All schemas in packages/types/src/policy.ts; route inputs/outputs validated |
| II. Prisma-Exclusive Data | PASS | All DB access through Prisma; models already in schema.prisma |
| III. Test-Driven Quality | PASS | Vitest unit tests for evaluator; Supertest integration tests for routes |
| IV. Security-First | PASS | JWT on all routes; admin-only for CRUD; any authenticated for evaluate |
| V. Role-Based Access | PASS | Admin for create/update/delete/assign; any role for list/get/evaluate |
| VI. Resilient Async + Realtime | N/A | No async workers or SSE needed for this epic |
| VII. Monorepo & File Conventions | PASS | policies.routes.ts, policies.service.ts, policies.evaluator.ts pattern |
| VIII. Precision in Domain Values | N/A | No monetary or risk score values (uses existing RiskTier enum) |

## Project Structure

### Documentation (this feature)

```text
specs/006-policy-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── policy-api.md
├── tasks.md
├── spec.md
└── checklists/
    └── requirements.md
```

### Source Code (new files for this feature)

```text
packages/types/src/
└── policy.ts                           # Shared Zod schemas

apps/api/src/
└── modules/policies/
    ├── policies.evaluator.ts           # Pure evaluation function
    ├── policies.evaluator.test.ts      # Unit tests for evaluator
    ├── policies.service.ts             # CRUD + assignment service
    ├── policies.schema.ts              # Fastify schema bridge
    ├── policies.routes.ts              # All routes
    └── policies.test.ts                # Integration tests
```

### Files Modified

```text
packages/types/src/index.ts             # UPDATE: re-export policy schemas
apps/api/src/app.ts                     # UPDATE: register policyRoutes
apps/api/src/modules/approvals/
    approvals.service.ts                # UPDATE: replace evaluatePolicy stub
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No additional complexity beyond standard CRUD + evaluator | — |
