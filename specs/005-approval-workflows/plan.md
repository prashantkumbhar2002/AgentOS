# Implementation Plan: Human-in-the-Loop Approval Workflows

**Branch**: `002-jwt-auth-rbac` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-approval-workflows/spec.md`

## Summary

Build a human-in-the-loop approval workflow where AI agents request approval before taking risky actions. The platform creates approval tickets, notifies approvers via Slack with interactive buttons (BullMQ), and waits for human decisions. Includes policy-based auto-allow/deny short-circuiting, automatic ticket expiration, real-time SSE updates, and audit trail integration.

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: Fastify v4, BullMQ, ioredis, @slack/bolt, @slack/web-api, Zod, Prisma
**Storage**: PostgreSQL 16 via Prisma v5
**Testing**: Vitest (unit) + Supertest (integration)
**Target Platform**: Linux server (Docker)
**Project Type**: Web service (monorepo workspace: apps/api)
**Performance Goals**: POST /api/approvals < 2s; ticket resolution visible to polling agents < 5s
**Constraints**: Slack notifications are best-effort (never block ticket creation); ticket expiration cleanup within 10 minutes
**Scale/Scope**: Hundreds of agents, dozens of approvers, thousands of tickets/day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | All schemas in packages/types/src/approval.ts; route inputs/outputs validated |
| II. Prisma-Exclusive Data | PASS | All DB access through Prisma; ApprovalTicket model already in schema.prisma |
| III. Test-Driven Quality | PASS | Supertest tests for all routes; Vitest for service logic; Slack/BullMQ mocked |
| IV. Security-First | PASS | JWT on all routes; RBAC on resolve endpoint; rate limiting on POST |
| V. Role-Based Access | PASS | admin/approver for resolve; any authenticated for create/list/poll |
| VI. Resilient Async + Realtime | PASS | BullMQ for Slack notifications + expiration; SSE for real-time updates |
| VII. Monorepo & File Conventions | PASS | approvals.routes.ts, approvals.service.ts, approvals.schema.ts pattern |
| VIII. Precision in Domain Values | PASS | riskScore as Float 0.0–1.0 |

**Justified Exception**: Policy evaluation module (EPIC 5) is not yet built. T4.05 will use a stub `evaluatePolicy()` that always returns `REQUIRE_APPROVAL`. This is wired to be replaced when EPIC 5 is complete.

## Project Structure

### Documentation (this feature)

```text
specs/005-approval-workflows/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── approval-api.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (new files for this feature)

```text
packages/types/src/
└── approval.ts                          # Shared Zod schemas

apps/api/src/
├── config/
│   └── env.ts                           # UPDATE: add Slack env vars
├── plugins/
│   └── slack.ts                         # Slack Bolt app + interactions handler
├── workers/
│   ├── notificationWorker.ts            # BullMQ: slack-approval-notification
│   └── approvalWorker.ts               # BullMQ: expire-pending-approvals
├── utils/
│   └── risk-label.ts                    # getRiskLabel(score) utility
└── modules/approvals/
    ├── approvals.service.ts             # Business logic
    ├── approvals.schema.ts              # Fastify schema bridge
    ├── approvals.routes.ts              # All routes
    └── approvals.test.ts                # Integration tests
```

**Structure Decision**: Follows existing monorepo conventions from EPIC 1–3. Workers are a new directory for BullMQ job processors.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| BullMQ workers (new infra) | Constitution Principle VI requires async work through BullMQ queues | Inline Slack calls would block the request and violate the principle |
| Stub policy evaluator | EPIC 5 not yet built | Hardcoding REQUIRE_APPROVAL is the safest default — no auto-allow without explicit policy |
