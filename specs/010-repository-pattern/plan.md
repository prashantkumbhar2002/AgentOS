# Implementation Plan: Repository Pattern Refactor

**Branch**: `feat/enhancements/v1` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)

## Summary

Introduce a repository abstraction layer between service modules and Prisma. Refactor all 5 service domains (agents, audit, approvals, policies, analytics) to accept repository interfaces via constructor injection. Create a composition root (`container.ts`) that wires Prisma implementations at startup. Add mock repository implementations and pure unit tests for each service. Eliminate all `unknown`/`any` return types from services.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Fastify v4, Prisma v5, Zod
**Storage**: PostgreSQL 16 (via Prisma ORM)
**Testing**: Vitest (unit) + Supertest (integration)
**Target Platform**: Node.js 20+ (Linux server)
**Project Type**: Web service (monorepo — Turborepo)
**Constraints**: Zero API contract changes, zero database schema changes, 100% existing test pass rate

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | All new interfaces, DTOs, and services use strict TypeScript. No `any` types. Zod validation at route boundaries unchanged. |
| II. Prisma-Exclusive Data Access | PASS | Prisma remains the only data access layer. Repository implementations use PrismaClient internally. Services no longer import Prisma directly — this is stricter separation, not a violation. |
| III. Test-Driven Quality Gates | PASS | Adding unit tests with mock repos (Vitest). Existing Supertest integration tests preserved unchanged. |
| IV. Security-First | PASS | No auth, CORS, or rate-limiting changes. Internal refactor only. |
| V. RBAC | PASS | Role checks remain in route handlers. Services don't handle authorization. |
| VI. Resilient Async + SSE | PASS | BullMQ workers and SSE plugin unchanged. Workers will access services through the container. |
| VII. Monorepo Conventions | PASS | New files follow convention: `repositories/` at `apps/api/src/`. Services keep `[entity].service.ts` naming. |
| VIII. Precision in Domain Values | PASS | 6-decimal USD and 0.0–1.0 risk scores unchanged. DTOs enforce same precision. |

## Project Structure

### Documentation (this feature)

```text
specs/010-repository-pattern/
├── plan.md              # This file
├── research.md          # Architectural decisions
├── data-model.md        # Repository interfaces and DTOs
├── contracts/
│   └── repository-api.md  # Interface contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown
```

### Source Code (new/modified files)

```text
apps/api/src/
├── repositories/
│   ├── interfaces/
│   │   ├── IAgentRepository.ts
│   │   ├── IAuditRepository.ts
│   │   ├── IApprovalRepository.ts
│   │   ├── IPolicyRepository.ts
│   │   └── IAnalyticsRepository.ts
│   ├── prisma/
│   │   ├── PrismaAgentRepository.ts
│   │   ├── PrismaAuditRepository.ts
│   │   ├── PrismaApprovalRepository.ts
│   │   ├── PrismaPolicyRepository.ts
│   │   └── PrismaAnalyticsRepository.ts
│   └── mock/
│       ├── MockAgentRepository.ts
│       ├── MockAuditRepository.ts
│       ├── MockApprovalRepository.ts
│       ├── MockPolicyRepository.ts
│       └── MockAnalyticsRepository.ts
├── types/
│   └── dto.ts               # All service return DTOs
├── container.ts              # Composition root
└── modules/
    ├── agents/
    │   ├── agents.service.ts     # Refactored (class, injected repos)
    │   ├── agents.service.unit.test.ts  # NEW: mock-based unit tests
    │   └── agents.routes.ts      # Updated to use container
    ├── audit/
    │   ├── audit.service.ts
    │   ├── audit.service.unit.test.ts
    │   └── audit.routes.ts
    ├── approvals/
    │   ├── approvals.service.ts
    │   ├── approvals.service.unit.test.ts
    │   └── approvals.routes.ts
    ├── policies/
    │   ├── policies.service.ts
    │   ├── policies.evaluator.ts  # Refactored to use IPolicyRepository
    │   ├── policies.service.unit.test.ts
    │   └── policies.routes.ts
    └── analytics/
        ├── analytics.service.ts
        ├── analytics.service.unit.test.ts
        └── analytics.routes.ts
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Repository pattern adds indirection | Services are untestable without DB; review identified this as critical issue #1 | Direct Prisma in services means every test needs PostgreSQL — 10x slower CI, flaky tests |
| DTOs duplicate Prisma model shapes | Service return types must be decoupled from Prisma-generated types | Using Prisma types in service returns couples consumers to the ORM; changing a DB column forces route handler changes |
