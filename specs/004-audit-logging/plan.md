# Implementation Plan: Audit Logging & Observability

**Branch**: `002-jwt-auth-rbac` (consolidated) | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-audit-logging/spec.md`

## Summary

Build the complete audit trail infrastructure for AgentOS: a high-throughput
ingestion endpoint for agent events, query/filter/trace APIs, CSV export,
per-agent statistics, a cost calculator utility, and the GovernanceClient SDK
in `packages/governance-sdk` that wraps the Anthropic SDK for automatic
log shipping. The system reuses the existing SSE plugin (EPIC 2) and Prisma
AuditLog model (EPIC 1).

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: Fastify v4, @fastify/jwt, @fastify/rate-limit, Prisma v5, Zod, @anthropic-ai/sdk
**Storage**: PostgreSQL 16 via Prisma (AuditLog model already exists)
**Testing**: Vitest (unit) + Supertest (integration)
**Target Platform**: Linux server (Docker)
**Project Type**: Monorepo — apps/api (backend), packages/types (schemas), packages/governance-sdk (new)
**Performance Goals**: POST /api/audit/log < 50ms response; query < 2s for 100k events
**Constraints**: 6-decimal USD cost precision; never block agent for logging failures
**Scale/Scope**: 1000 req/min per agent on ingestion; 100k stored events queryable

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | All schemas in packages/types/src/audit.ts; Zod on all inputs/outputs |
| II. Prisma-Exclusive Data | PASS | All queries via Prisma; AuditLog model exists from EPIC 1 |
| III. Test-Driven Quality | PASS | Unit tests for costCalculator; Supertest for all routes |
| IV. Security-First | PASS | JWT on all routes; per-agent rate limiting; input sanitization; no PII logging |
| V. RBAC | PASS | CSV export restricted to admin/approver; POST /api/audit/log for agent role |
| VI. Resilient Async + SSE | PASS | SSE broadcast on ingestion; async lastActiveAt update; no BullMQ needed (sync writes) |
| VII. Monorepo Conventions | PASS | audit.routes.ts, audit.service.ts, audit.schema.ts; GovernanceClient in governance-sdk |
| VIII. Precision Values | PASS | 6-decimal USD cost; Float risk scores |

**BullMQ Exception**: The constitution says "all async work MUST go through BullMQ."
Audit log ingestion is synchronous Prisma writes (not async background work). The
non-blocking `lastActiveAt` update uses a fire-and-forget Prisma call, not a queue,
because introducing a queue for a single timestamp update adds infrastructure
complexity without benefit. If ingestion volume requires async processing in the
future, a queue can be added as a constitution-compliant enhancement.

## Project Structure

### Documentation (this feature)

```text
specs/004-audit-logging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── audit-api.md     # REST API contracts
│   └── governance-sdk.md # SDK interface contract
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/types/src/
└── audit.ts                          # Shared Zod schemas

apps/api/src/
├── utils/
│   ├── cost-calculator.ts            # Model pricing + calculateCost()
│   └── cost-calculator.test.ts       # Unit tests
├── modules/audit/
│   ├── audit.service.ts              # Prisma queries + business logic
│   ├── audit.schema.ts              # Fastify-level schema re-exports
│   ├── audit.routes.ts              # All audit routes
│   └── audit.test.ts                # Supertest integration tests
└── app.ts                           # Register audit routes

packages/governance-sdk/
├── package.json
├── tsconfig.json
└── src/
    ├── GovernanceClient.ts           # SDK class
    ├── GovernanceClient.test.ts      # Unit tests (mocked HTTP)
    └── index.ts                      # Barrel export
```

**Structure Decision**: Follows existing monorepo conventions. Backend audit
module uses the same pattern as users and agents modules. GovernanceClient
SDK is a new workspace package per constitution Principle VII.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Fire-and-forget lastActiveAt (not BullMQ) | Single timestamp update; queue overhead unjustified | BullMQ worker for 1 Prisma update is over-engineering; no retry/DLQ needed for a timestamp |
