# Implementation Plan: Showcase Agents & Mock Data

**Branch**: `002-jwt-auth-rbac` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-showcase-agents/spec.md`

## Summary

Add two Claude-powered showcase agents (Email Draft, Research) and a mock data seeder that all route through the GovernanceClient SDK. The email agent demonstrates the full governance loop (LLM draft → approval → tool execution). The research agent demonstrates multi-step workflows (search → fetch → synthesize → approve save). The mock seeder populates dashboards with 50 audit logs, 5 approval tickets, and 3 mock agents. All exposed via 3 POST endpoints under `/api/showcase/`.

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: Fastify v4, Prisma v5, Zod, @anthropic-ai/sdk, GovernanceClient SDK
**Storage**: PostgreSQL 16 via Prisma ORM
**Testing**: Manual integration test via cURL (documented in TESTING.md)
**Target Platform**: Linux server (Docker)
**Project Type**: Web service (monorepo — Turborepo)
**Performance Goals**: Email agent < 60s, Research agent < 90s end-to-end
**Constraints**: ANTHROPIC_API_KEY required for showcase agents; mock seeder is pure DB simulation
**Scale/Scope**: Demo/showcase feature — not production workload

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | Route inputs validated with Zod; shared types in packages/types |
| II. Prisma-Exclusive Data Access | PASS | Mock seeder uses Prisma for all DB writes |
| III. Test-Driven Quality Gates | PASS | Manual integration test documented in TESTING.md with cURL commands |
| IV. Security-First | PASS | JWT auth on all endpoints; ANTHROPIC_API_KEY from env config |
| V. RBAC | PASS | Showcase routes require auth; mock seed requires admin role |
| VI. Async Processing | N/A | No queue work — showcase agents are synchronous request-response |
| VII. Monorepo Conventions | PASS | showcase.routes.ts follows module pattern; agents in showcase-agents/ |
| VIII. Domain Value Precision | PASS | Risk scores use Float (0.82, 0.35); costs use 6-decimal USD |

All gates PASS.

## Project Structure

### Documentation (this feature)

```text
specs/008-showcase-agents/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── showcase-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/src/
├── config/env.ts                         # Add ANTHROPIC_API_KEY
├── showcase-agents/
│   ├── emailDraftAgent.ts                # Email agent (5-step flow)
│   ├── researchAgent.ts                  # Research agent (8-step flow)
│   └── mockAgent.ts                      # Mock data generator
├── modules/showcase/
│   ├── showcase.schema.ts                # Zod schemas
│   └── showcase.routes.ts                # 3 POST endpoints
└── app.ts                                # Register showcase routes

apps/api/prisma/
└── seed.ts                               # Register 5 agents (2 real + 3 mock)

specs/008-showcase-agents/
└── TESTING.md                            # Manual cURL integration test
```

**Structure Decision**: Showcase agents live in a dedicated `showcase-agents/` directory (not inside `modules/`) since they are agent implementations, not REST module logic. The routes live in `modules/showcase/` following the standard module pattern.

## Complexity Tracking

No violations — no complexity justification needed.
