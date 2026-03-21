# Implementation Plan: Analytics & Cost Tracking

**Branch**: `002-jwt-auth-rbac` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-analytics-cost-tracking/spec.md`

## Summary

Add 5 read-only analytics API endpoints that aggregate existing AuditLog and ApprovalTicket data into cost summaries, cost timelines, usage statistics, agent leaderboards, and model usage breakdowns. No new Prisma models — all data is derived from Prisma `groupBy` and `aggregate` queries. A composite database index `(agentId, createdAt)` on AuditLog must be added to support performant time-windowed queries.

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: Fastify v4, Prisma v5, Zod, @fastify/jwt
**Storage**: PostgreSQL 16 via Prisma ORM
**Testing**: Vitest (unit) + Supertest (integration)
**Target Platform**: Linux server (Docker)
**Project Type**: Web service (monorepo — Turborepo)
**Performance Goals**: All analytics endpoints < 500ms response time
**Constraints**: Set-based aggregation only (Prisma groupBy/aggregate) — never load all rows into memory
**Scale/Scope**: Organization-wide analytics across all agents and audit log entries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | All query params validated with Zod; shared schemas in packages/types |
| II. Prisma-Exclusive Data Access | PASS | All aggregation via Prisma groupBy/aggregate — no raw SQL |
| III. Test-Driven Quality Gates | PASS | Vitest unit tests for service, Supertest integration for routes |
| IV. Security-First | PASS | JWT auth on all endpoints; no secrets in responses |
| V. RBAC | PASS | All endpoints require authentication; analytics are read-only |
| VI. Async Processing | N/A | No async work needed — all endpoints are synchronous reads |
| VII. Monorepo Conventions | PASS | analytics.routes.ts, analytics.service.ts, analytics.schema.ts |
| VIII. Domain Value Precision | PASS | Cost values maintain 6-decimal USD precision from AuditLog.costUsd |

All gates PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/007-analytics-cost-tracking/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── analytics-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/types/src/
└── analytics.ts                          # Shared Zod schemas

apps/api/src/modules/analytics/
├── analytics.schema.ts                   # Re-export from @agentos/types
├── analytics.service.ts                  # 5 aggregation functions
├── analytics.service.test.ts             # Vitest unit tests
├── analytics.routes.ts                   # 5 GET endpoints
└── analytics.test.ts                     # Supertest integration tests

apps/api/prisma/
└── migrations/xxx_add_audit_composite_index/  # New composite index
```

**Structure Decision**: Follows existing monorepo convention — shared types in `packages/types`, module files in `apps/api/src/modules/analytics/`, registered in `app.ts`.

## Complexity Tracking

No violations — no complexity justification needed.
