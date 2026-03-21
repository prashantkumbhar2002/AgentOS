# AgentOS — Technical Design Document

**Project**: AgentOS — AI Agent Governance & Management Platform
**Version**: 1.0.0
**Date**: 2026-03-21
**Branch**: `002-jwt-auth-rbac`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Data Model](#5-data-model)
6. [API Reference](#6-api-reference)
7. [Plugins & Middleware](#7-plugins--middleware)
8. [Feature Breakdown by EPIC](#8-feature-breakdown-by-epic)
9. [GovernanceClient SDK](#9-governanceclient-sdk)
10. [Shared Types Package](#10-shared-types-package)
11. [Testing Strategy](#11-testing-strategy)
12. [Security & RBAC](#12-security--rbac)
13. [Configuration & Environment](#13-configuration--environment)
14. [Constitution & Design Principles](#14-constitution--design-principles)
15. [Glossary](#15-glossary)

---

## 1. Overview

AgentOS is an AI Agent Governance & Management Platform that provides centralized control over autonomous AI agents. It enables organizations to:

- **Register and manage** AI agents with risk classification and lifecycle states
- **Audit every action** agents take — LLM calls, tool invocations, costs, latency
- **Enforce governance policies** that automatically ALLOW, DENY, or require human approval for agent actions based on risk tier and action type
- **Route high-risk decisions** through human-in-the-loop approval workflows with Slack integration and real-time notifications
- **Track costs and usage** across all agents with org-wide analytics dashboards
- **Demonstrate the platform** with two live Claude-powered showcase agents and a mock data seeder

The platform is API-first (no frontend in current scope) and designed for teams operating multiple AI agents in production.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway (Fastify v4)                 │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ Auth │ │Agents│ │ Audit │ │Approval│ │ Policy │ │Analytics│ │
│  │Routes│ │Routes│ │Routes │ │ Routes │ │ Routes │ │ Routes  │ │
│  └──┬───┘ └──┬───┘ └───┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ │
│     │        │         │         │           │          │       │
│  ┌──┴────────┴─────────┴─────────┴───────────┴──────────┴──┐   │
│  │                    Service Layer                         │   │
│  │  (approvals.service, policies.service, policies.evaluator│   │
│  │   analytics.service, agents.service)                     │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────┴──────────────────────────────────┐   │
│  │                  Prisma ORM (PostgreSQL 16)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  JWT    │  │  SSE     │  │  BullMQ  │  │  Slack Plugin  │  │
│  │  Auth   │  │ Realtime │  │  Queue   │  │  Interactions  │  │
│  └─────────┘  └──────────┘  └──────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐     ┌──────────────────────────────┐
│  GovernanceClient SDK    │────▶│  Showcase Agents             │
│  (packages/governance-   │     │  - Email Draft Agent (Claude) │
│   sdk)                   │     │  - Research Agent (Claude)    │
│                          │     │  - Mock Data Seeder           │
└──────────────────────────┘     └──────────────────────────────┘
```

### Request Flow

1. Client sends HTTP request with JWT Bearer token
2. Fastify rate limiter checks request count
3. `authenticate` or `requireRole` preHandler validates JWT and RBAC
4. Zod schema validates request body/query/params
5. Service layer executes business logic via Prisma
6. SSE broadcast for real-time events (approvals created/resolved)
7. BullMQ enqueues background jobs (Slack notifications)

### Governance Flow (for AI Agents)

```
Agent Action → GovernanceClient.requestApproval()
  → POST /api/approvals
    → Policy Evaluator checks rules
      → ALLOW     → auto-approve, return immediately
      → DENY      → reject with 403, log event
      → REQUIRE   → create ApprovalTicket
        → Slack notification (via BullMQ)
        → SSE broadcast to connected approvers
        → Agent polls GET /api/approvals/:id until resolved
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | 20+ |
| **Language** | TypeScript | 5.x (strict mode) |
| **Monorepo** | Turborepo | latest |
| **API Framework** | Fastify | v4 |
| **ORM** | Prisma | v5 |
| **Database** | PostgreSQL | 16 |
| **Queue** | BullMQ | latest |
| **Cache/Broker** | Redis (ioredis) | latest |
| **Validation** | Zod | latest |
| **Auth** | JWT (@fastify/jwt) + bcrypt | — |
| **AI SDK** | @anthropic-ai/sdk | ^0.39.0 |
| **Messaging** | @slack/web-api | latest |
| **Testing** | Vitest + Supertest | v3 / v7 |
| **Realtime** | Server-Sent Events (SSE) | — |

### Non-Negotiable Constraints

- No raw SQL — Prisma only
- No `any` — TypeScript strict mode
- All inputs validated with Zod
- Shared types in `packages/types` — never duplicated in `apps/`
- No WebSockets — SSE only for realtime

---

## 4. Monorepo Structure

```
AgentOS/
├── apps/
│   └── api/                          # Fastify API server
│       ├── prisma/
│       │   ├── schema.prisma         # Database schema
│       │   └── seed.ts               # Seed data (users, agents, policies)
│       └── src/
│           ├── config/
│           │   └── env.ts            # Zod-validated environment config
│           ├── plugins/
│           │   ├── auth.ts           # JWT + RBAC middleware
│           │   ├── prisma.ts         # PrismaClient singleton
│           │   ├── sse.ts            # SSE fan-out manager
│           │   ├── bullmq.ts         # BullMQ notification queue
│           │   └── slack.ts          # Slack interactive endpoint
│           ├── modules/
│           │   ├── users/            # Auth (login, refresh, me)
│           │   ├── agents/           # Agent CRUD + lifecycle
│           │   ├── audit/            # Audit log ingestion + query
│           │   ├── approvals/        # Approval ticket lifecycle
│           │   ├── policies/         # Policy CRUD + evaluation
│           │   ├── analytics/        # Cost + usage analytics
│           │   └── showcase/         # Demo agent trigger routes
│           ├── showcase-agents/
│           │   ├── emailDraftAgent.ts   # Claude-powered email agent
│           │   ├── researchAgent.ts     # Claude-powered research agent
│           │   └── mockAgent.ts         # Mock data generator
│           ├── utils/
│           │   ├── risk-label.ts     # Risk score → tier label
│           │   ├── health-score.ts   # Agent health score calculator
│           │   └── cost-calculator.ts # Per-model cost calculation
│           ├── workers/
│           │   └── notification.worker.ts  # BullMQ Slack worker
│           ├── app.ts               # Fastify app factory
│           └── server.ts            # Entry point
├── packages/
│   ├── types/                       # Shared Zod schemas + TS types
│   │   └── src/
│   │       ├── auth.ts
│   │       ├── agent.ts
│   │       ├── audit.ts
│   │       ├── approval.ts
│   │       ├── policy.ts
│   │       ├── analytics.ts
│   │       └── index.ts             # Re-exports everything
│   └── governance-sdk/              # Agent-side SDK
│       └── src/
│           ├── GovernanceClient.ts
│           └── index.ts
├── specs/                           # Feature specifications
│   ├── 005-approval-workflows/
│   ├── 006-policy-engine/
│   ├── 007-analytics-cost-tracking/
│   └── 008-showcase-agents/
└── docs/
    └── TECHNICAL_DESIGN.md          # This document
```

---

## 5. Data Model

### Enums

| Enum | Values |
|------|--------|
| `RiskTier` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `Environment` | `DEV`, `STAGING`, `PROD` |
| `AgentStatus` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `DEPRECATED` |
| `ApprovalStatus` | `PENDING`, `APPROVED`, `DENIED`, `EXPIRED`, `AUTO_APPROVED` |
| `PolicyEffect` | `ALLOW`, `DENY`, `REQUIRE_APPROVAL` |

### Entity Relationship Diagram

```
User ──────────────────┐
  │                    │ (resolvedBy)
  │                    ▼
  │              ApprovalTicket
  │                    ▲
  │                    │ (agent)
  │    ┌───────────────┤
  │    │               │
  │    ▼               │
  │  Agent ────────── AuditLog
  │    │
  │    ├── AgentTool
  │    │
  │    └── AgentPolicy ──── Policy ──── PolicyRule
```

### Models

#### User
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| email | String | Unique |
| passwordHash | String | bcrypt hash |
| name | String | Display name |
| role | String | Default "viewer" |
| createdAt | DateTime | Auto-set |

#### Agent
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| name | String | Agent name |
| description | String | Agent purpose |
| ownerTeam | String | Responsible team |
| llmModel | String | e.g. "claude-sonnet-4-5" |
| riskTier | RiskTier | LOW/MEDIUM/HIGH/CRITICAL |
| environment | Environment | DEV/STAGING/PROD |
| status | AgentStatus | Default DRAFT |
| approvedBy | String? | Who approved activation |
| tags | String[] | Searchable tags |
| createdAt | DateTime | Auto-set |
| updatedAt | DateTime | Auto-updated |
| lastActiveAt | DateTime? | Last activity timestamp |

#### AgentTool
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| agentId | String | FK → Agent |
| name | String | Tool identifier |
| description | String | Tool purpose |

#### AuditLog
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| agentId | String | FK → Agent |
| traceId | String | Groups related events |
| event | String | llm_call, tool_call, approval_requested, etc. |
| model | String? | LLM model used |
| toolName | String? | Tool invoked |
| inputs | Json? | Tool/LLM inputs |
| outputs | Json? | Tool/LLM outputs |
| inputTokens | Int? | LLM input tokens |
| outputTokens | Int? | LLM output tokens |
| costUsd | Float? | Cost in USD (6 decimals) |
| latencyMs | Int? | Execution time |
| success | Boolean | Default true |
| errorMsg | String? | Error details |
| metadata | Json? | Arbitrary metadata |
| createdAt | DateTime | Auto-set |

**Indexes**: `agentId`, `traceId`, `createdAt`, `event`

#### ApprovalTicket
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| agentId | String | FK → Agent |
| actionType | String | e.g. "send_email", "delete_record" |
| payload | Json | Action details |
| riskScore | Float | 0.0–1.0 |
| reasoning | String | Why approval is needed |
| status | ApprovalStatus | Default PENDING |
| resolvedById | String? | FK → User |
| resolvedAt | DateTime? | When resolved |
| expiresAt | DateTime | Auto-expire deadline |
| slackMsgTs | String? | Slack message timestamp |
| createdAt | DateTime | Auto-set |

**Indexes**: `status`, `agentId`

#### Policy
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| name | String | Unique name |
| description | String | Policy purpose |
| isActive | Boolean | Default true |
| createdAt | DateTime | Auto-set |

#### PolicyRule
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | Primary key |
| policyId | String | FK → Policy |
| actionType | String | "*" for wildcard |
| riskTiers | RiskTier[] | Which tiers this applies to |
| effect | PolicyEffect | ALLOW/DENY/REQUIRE_APPROVAL |
| conditions | Json? | Additional match criteria |

#### AgentPolicy
| Field | Type | Notes |
|-------|------|-------|
| agentId | String | Composite PK |
| policyId | String | Composite PK |

---

## 6. API Reference

All endpoints (except `/api/auth/login` and `/api/health`) require `Authorization: Bearer <JWT>`.

### Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None (rate limited: 10/15min) | Login with email+password, returns JWT |
| POST | `/api/auth/refresh` | Bearer JWT | Refresh JWT token |
| GET | `/api/auth/me` | Bearer JWT | Get current user profile |

### Agents (`/api/agents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/agents` | Authenticated | Register a new agent |
| GET | `/api/agents` | Authenticated | List agents (filter, paginate, search) |
| GET | `/api/agents/:id` | Authenticated | Get agent details with tools and policies |
| PATCH | `/api/agents/:id` | Admin | Update agent fields |
| PATCH | `/api/agents/:id/status` | Admin/Approver | Transition agent status |
| DELETE | `/api/agents/:id` | Admin | Soft-delete (deprecate) agent |

### Audit (`/api/audit`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/audit/log` | Authenticated | Ingest an audit event |
| GET | `/api/audit/logs` | Authenticated | Query logs (JSON or CSV export) |
| GET | `/api/audit/traces/:traceId` | Authenticated | Get all events for a trace |
| GET | `/api/audit/stats/:id` | Authenticated | Per-agent statistics |

### Approvals (`/api/approvals`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/approvals` | Authenticated | Create approval ticket (policy-evaluated) |
| GET | `/api/approvals` | Authenticated | List tickets (filter by status, agent) |
| GET | `/api/approvals/:id` | Authenticated | Get ticket details |
| PATCH | `/api/approvals/:id/decide` | Admin/Approver | Approve or deny a ticket |

### Policies (`/api/policies`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/policies` | Admin | Create a named policy with rules |
| GET | `/api/policies` | Authenticated | List all policies |
| GET | `/api/policies/:id` | Authenticated | Get policy with rules and agents |
| PATCH | `/api/policies/:id` | Admin | Update policy or its rules |
| DELETE | `/api/policies/:id` | Admin | Delete policy (fails if assigned) |
| POST | `/api/policies/:id/assign` | Admin | Assign policy to an agent |
| DELETE | `/api/policies/:id/assign/:agentId` | Admin | Unassign policy from agent |
| POST | `/api/policies/evaluate` | Authenticated | Evaluate policies for an action |

### Analytics (`/api/analytics`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/costs` | Authenticated | Org cost summary (today, 7d, 30d, total, WoW change) |
| GET | `/api/analytics/costs/timeline` | Authenticated | Daily cost timeline per agent (zero-filled) |
| GET | `/api/analytics/usage` | Authenticated | Usage stats (runs, LLM/tool calls, approval breakdown) |
| GET | `/api/analytics/agents` | Authenticated | Agent leaderboard (cost, runs, error rate, health) |
| GET | `/api/analytics/models` | Authenticated | Model usage breakdown (calls, tokens, cost) |

### Showcase (`/api/showcase`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/showcase/email-agent/run` | Authenticated | Run email draft agent (requires ANTHROPIC_API_KEY) |
| POST | `/api/showcase/research-agent/run` | Authenticated | Run research agent (requires ANTHROPIC_API_KEY) |
| POST | `/api/showcase/mock/seed` | Admin | Seed mock agents, logs, and approvals |

### System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Health check |
| GET | `/api/events/stream?token=<JWT>` | JWT via query | SSE stream for real-time events |
| POST | `/slack/interactions` | Slack signature | Slack interactive approve/deny |

**Total: 30 endpoints**

---

## 7. Plugins & Middleware

### Auth Plugin (`plugins/auth.ts`)
- Registers `@fastify/jwt` with configurable secret and expiry
- Exports `authenticate` preHandler — validates Bearer JWT, returns 401 on failure
- Exports `requireRole(roles[])` preHandler — runs authenticate, then checks `request.user.role` against allowed roles, returns 403 on mismatch
- JWT payload shape: `{ id, email, name, role }`

### Prisma Plugin (`plugins/prisma.ts`)
- Creates a singleton `PrismaClient` with dev-mode query logging
- Decorates `fastify.prisma` for use in all route handlers
- Disconnects on server close

### SSE Plugin (`plugins/sse.ts`)
- In-memory fan-out manager for Server-Sent Events
- API: `addClient(reply)`, `removeClient(id)`, `broadcast(event)`, `clientCount()`
- 30-second heartbeat ping to keep connections alive
- Cleans up on server close

### BullMQ Plugin (`plugins/bullmq.ts`)
- Creates a `notifications` queue backed by Redis
- Decorates `fastify.notificationQueue`
- Used by approvals module to enqueue Slack notification jobs
- Exports `getRedisConnection()` for workers

### Slack Plugin (`plugins/slack.ts`)
- Optional — skips registration if `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` are not set
- Registers `POST /slack/interactions` at app root
- Verifies Slack request signatures (HMAC-SHA256)
- Resolves approval tickets from Slack button actions
- Depends on `prisma` and `sse` plugins

---

## 8. Feature Breakdown by EPIC

### EPIC 2 — JWT Auth & RBAC (Foundation)

The base layer upon which all other EPICs build.

- **JWT authentication** with login, token refresh, and user profile
- **RBAC** with 4 roles: `admin`, `approver`, `viewer`, `agent`
- **Agent CRUD** with full lifecycle (DRAFT → ACTIVE → DEPRECATED)
- **Audit log ingestion** with trace grouping, CSV export, per-agent stats
- **Seed data**: 3 users (admin, approver, viewer), 2 agents, 3 policies

### EPIC 4 — Approval Workflows

| Aspect | Detail |
|--------|--------|
| **User Stories** | 7 |
| **Functional Requirements** | 22 |
| **Success Criteria** | 9 |

Core governance mechanism. When an agent requests approval:
1. Policy evaluator checks rules → auto-allow, deny, or create PENDING ticket
2. PENDING tickets get 30-minute expiry, Slack notification (via BullMQ), SSE broadcast
3. Admins/approvers resolve tickets via API or Slack buttons
4. Background worker expires stale tickets
5. Agents poll for resolution via GovernanceClient SDK

**Key implementation files**: `approvals.service.ts`, `approvals.routes.ts`, `notification.worker.ts`

### EPIC 5 — Policy Engine

| Aspect | Detail |
|--------|--------|
| **User Stories** | 5 |
| **Functional Requirements** | 23 |
| **Success Criteria** | 7 |

Rule-based policy system. Policies contain rules that match on `actionType` + `riskTier`:
- **Evaluation priority**: DENY > REQUIRE_APPROVAL > ALLOW
- **Scope**: Agent-specific policies checked first, then global policies
- **Wildcard**: `actionType: "*"` matches any action
- **Safe default**: If no rules match → REQUIRE_APPROVAL
- **Conditions**: JSON-based extra match criteria on rules
- **Assignments**: Policies can be assigned/unassigned to specific agents

**Key implementation files**: `policies.evaluator.ts` (pure function), `policies.service.ts`, `policies.routes.ts`

### EPIC 6 — Analytics & Cost Tracking

| Aspect | Detail |
|--------|--------|
| **User Stories** | 5 |
| **Functional Requirements** | 18 |
| **Success Criteria** | 7 |

Read-only analytics aggregated from existing AuditLog and ApprovalTicket data:
- **Cost summary**: today, 7d, 30d, total, week-over-week change percentage
- **Cost timeline**: daily per-agent cost series, zero-filled for missing days
- **Usage stats**: total runs, LLM/tool call counts, avg run cost, approval breakdown
- **Agent leaderboard**: sortable by cost, runs, error rate, latency, health score
- **Model usage**: per-model call count, token totals, cost totals

Uses Prisma `groupBy` and `aggregate` — no raw SQL, no new persistence models.

**Key implementation files**: `analytics.service.ts`, `analytics.routes.ts`

### EPIC 7 — Showcase Agents & Mock Data

| Aspect | Detail |
|--------|--------|
| **User Stories** | 4 |
| **Functional Requirements** | 18 |
| **Success Criteria** | 7 |

Demonstrates the full governance loop:

**Email Draft Agent** (5-step flow):
1. Receive task → 2. LLM drafts email (Claude) → 3. Extract subject/body → 4. Request approval (riskScore 0.82) → 5. If approved, simulate send; if denied, log blocked

**Research Agent** (8-step flow):
1. Receive topic → 2. LLM plans 2 search queries → 3-4. Execute web searches (Anthropic web_search tool) → 5. Fetch top result → 6. LLM synthesizes report → 7. Request approval to save (riskScore 0.35) → 8. If approved, simulate save

**Mock Data Seeder**:
- Creates 3 mock agents (CRM/Analytics/Compliance)
- Generates 50 audit logs across 15 traces over 7 days
- Creates 5 approval tickets (2 approved, 1 denied, 2 pending)
- Idempotent — safe to run multiple times

**Key implementation files**: `emailDraftAgent.ts`, `researchAgent.ts`, `mockAgent.ts`, `showcase.routes.ts`

---

## 9. GovernanceClient SDK

The SDK (`packages/governance-sdk`) is the interface between AI agents and the AgentOS platform. Every agent action flows through this client.

### Configuration

```typescript
interface GovernanceClientConfig {
  platformUrl: string;   // e.g. "http://localhost:3000"
  agentId: string;       // Registered agent UUID
  apiKey: string;        // JWT token for authentication
}
```

### Public API

| Method | Purpose |
|--------|---------|
| `constructor(config)` | Creates client, generates unique `traceId` |
| `traceId: string` | Readonly UUID grouping all events in this session |
| `logEvent(payload)` | POST to `/api/audit/log` — fire-and-forget audit event |
| `createMessage(params)` | Wraps `anthropic.messages.create()`, auto-logs `llm_call` event with tokens, cost, latency, success/failure |
| `callTool(name, inputs, fn)` | Wraps arbitrary async function, auto-logs `tool_call` event with latency and success/failure |
| `requestApproval(params)` | POST to `/api/approvals`, polls until resolved or timeout. Returns `{ decision, ticketId }` |

### Approval Polling

`requestApproval` creates a ticket and polls `GET /api/approvals/:id` every `pollIntervalMs` (default 3s) until the status changes from PENDING or `maxWaitMs` (default 30min) elapses. Returns the final decision: `APPROVED`, `DENIED`, `EXPIRED`, `AUTO_APPROVED`, or `ERROR`.

---

## 10. Shared Types Package

`packages/types` contains all Zod schemas and inferred TypeScript types, organized by domain. No type definitions are duplicated in `apps/`.

### Exported Schemas by Domain

| Domain | Schemas |
|--------|---------|
| **Auth** | `RoleEnum`, `LoginSchema`, `UserSchema`, `AuthUserSchema`, `AuthResponseSchema`, `ErrorResponseSchema` |
| **Agent** | `RiskTierSchema`, `EnvironmentSchema`, `AgentStatusSchema`, `AgentToolSchema`, `CreateAgentSchema`, `UpdateAgentSchema`, `UpdateAgentStatusSchema`, `AgentListQuerySchema`, `AgentIdParamsSchema`, `AgentSummarySchema`, `AgentStatsSchema`, `AgentDetailSchema` |
| **Audit** | `AuditEventTypeSchema`, `AuditEventSchema`, `AuditQuerySchema`, `AuditLogSchema`, `TraceIdParamsSchema`, `TopToolSchema`, `AgentStatsResponseSchema` |
| **Approval** | `ApprovalStatusSchema`, `CreateApprovalSchema`, `ApprovalDecisionSchema`, `ApprovalTicketSchema`, `ApprovalQuerySchema`, `ApprovalIdParamsSchema` |
| **Policy** | `PolicyEffectSchema`, `PolicyRuleInputSchema`, `CreatePolicySchema`, `UpdatePolicySchema`, `PolicyIdParamsSchema`, `PolicyListQuerySchema`, `PolicyAssignSchema`, `PolicyUnassignParamsSchema`, `PolicyEvaluationRequestSchema`, `PolicyEvaluationResultSchema` |
| **Analytics** | `DateRangeQuerySchema`, `CostTimelineQuerySchema`, `AgentLeaderboardQuerySchema`, `CostSummarySchema`, `CostTimelineSeriesSchema`, `CostTimelineSchema`, `UsageStatsSchema`, `AgentLeaderboardEntrySchema`, `AgentLeaderboardSchema`, `ModelUsageEntrySchema`, `ModelUsageSchema` |

Each schema has a corresponding exported TypeScript type (e.g., `CreateAgentInput = z.infer<typeof CreateAgentSchema>`).

---

## 11. Testing Strategy

### Framework

- **Runner**: Vitest v3
- **HTTP Testing**: Supertest v7
- **Execution**: `turbo run test` (fans out to all workspaces)

### Test Files

| File | Type | Cases | Module |
|------|------|------:|--------|
| `users.test.ts` | Integration | 13 | Auth (login, refresh, me, RBAC) |
| `agents.test.ts` | Integration | 25 | Agent CRUD, status transitions, RBAC |
| `audit.test.ts` | Integration | 16 | Audit log ingestion, query, CSV export, traces |
| `approvals.test.ts` | Integration | 18 | Approval lifecycle, decide, policy evaluation |
| `policies.test.ts` | Integration | 20 | Policy CRUD, assign/unassign, evaluate |
| `policies.evaluator.test.ts` | Service | 11 | Pure evaluator: DENY/ALLOW/REQUIRE, wildcards, priority |
| `analytics.test.ts` | Integration | 16 | All 5 analytics endpoints |
| `analytics.service.test.ts` | Service | 17 | Aggregation functions, date ranges, sorting |
| `health-score.test.ts` | Unit | 10 | Health score weighting, bounds |
| `cost-calculator.test.ts` | Unit | 8 | Per-model cost calculation |
| `GovernanceClient.test.ts` | Unit | 6 | SDK methods, mocked fetch |

**Total: 11 test files, 160 test cases**

### Test Categories

- **Integration tests** (7 files, 108 cases): Use Supertest against the full Fastify app with a real test database. Each test file seeds its own data and cleans up.
- **Service tests** (2 files, 28 cases): Test business logic against Prisma with a real database but no HTTP layer.
- **Unit tests** (3 files, 24 cases): Pure function tests with mocked dependencies.

### Test Isolation

- Each integration test file creates its own Fastify instance via `buildApp()`
- Database state is cleaned in `beforeAll`/`afterAll`/`afterEach` hooks
- Tests use unique identifiers to avoid cross-test interference

---

## 12. Security & RBAC

### Authentication

- **Method**: JWT (JSON Web Token) via `@fastify/jwt`
- **Token lifetime**: 8 hours (configurable via `JWT_EXPIRES_IN`)
- **Password hashing**: bcrypt with configurable rounds
- **Login**: Email + password only (no OAuth, no SSO)

### Rate Limiting

| Scope | Limit |
|-------|-------|
| Global | 100 requests / minute |
| Login endpoint | 10 requests / 15 minutes |
| Audit log ingestion | Per-agent rate limiting |

### RBAC Matrix

| Endpoint | admin | approver | viewer | agent (SDK) |
|----------|:-----:|:--------:|:------:|:-----------:|
| Login/Refresh/Me | Y | Y | Y | Y |
| Agent CRUD | Y | read | read | — |
| Agent Status | Y | limited | — | — |
| Audit Log/Query | Y | Y | Y | write only |
| Approvals Create | Y | Y | Y | Y |
| Approvals Decide | Y | Y | — | — |
| Policy CRUD | Y | — | — | — |
| Policy Evaluate | Y | Y | Y | Y |
| Analytics | Y | Y | Y | — |
| Showcase Run | Y | Y | Y | — |
| Mock Seed | Y | — | — | — |

### Security Constraints

- CORS restricted to `FRONTEND_URL` in production
- No full secret/PII payloads in audit logs
- No hardcoded secrets — all via environment variables
- No stack traces in production 500 responses
- Slack signatures verified via HMAC-SHA256

---

## 13. Configuration & Environment

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/agentos` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-secret-key-at-least-32-characters` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment mode |
| `JWT_EXPIRES_IN` | `8h` | Token expiry duration |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for BullMQ |
| `SLACK_BOT_TOKEN` | — | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | — | Slack request verification |
| `SLACK_CHANNEL_ID` | — | Slack channel for notifications |
| `ANTHROPIC_API_KEY` | — | Required for showcase agents only |

### Seed Data

Running `npx prisma db seed` creates:

| Entity | Items |
|--------|-------|
| **Users** | admin@agentos.dev (admin), approver@agentos.dev (approver), viewer@agentos.dev (viewer) |
| **Agents** | Email Draft Agent (HIGH), Research Agent (MEDIUM), Mock CRM Agent (MEDIUM), Mock Analytics Agent (LOW), Mock Compliance Agent (CRITICAL) |
| **Policies** | External Email Approval (REQUIRE for send_email), Delete Protection (DENY for delete_record/CRITICAL), Low Risk Auto-Allow (ALLOW for */LOW) |
| **Assignments** | "External Email Approval" → "Email Draft Agent" |

---

## 14. Constitution & Design Principles

The project follows 8 non-negotiable principles defined in the constitution:

### I. TypeScript Strict + Zod
- No `any` types — strict mode enforced
- All Fastify inputs/outputs validated with Zod
- Shared schemas in `packages/types` with `*Schema` naming convention
- Environment variables validated on startup

### II. Prisma-Exclusive Data Access
- No raw SQL or alternative ORMs
- PascalCase model names
- Migrations via `prisma migrate dev` (never `db push` in production)
- PostgreSQL 16 only

### III. Test-Driven Quality Gates
- Every route has happy-path + error Supertest integration tests
- Business logic unit-tested with Vitest
- External services mocked in tests
- Isolated test database with transactional cleanup

### IV. Security-First
- Rate limits on all endpoints (100/min global, 10/15min on login)
- CORS locked to FRONTEND_URL in production
- JWT + bcrypt authentication
- No PII in logs, no hardcoded secrets

### V. RBAC
- 4 roles: admin, approver, viewer, agent
- Role checks after JWT verification
- No role escalation without admin action

### VI. Resilient Async + Realtime
- BullMQ for background jobs with retries, backoff, DLQ
- SSE for real-time updates (no WebSockets)
- Clean connection teardown on close

### VII. Monorepo Conventions
- Turborepo with `apps/api`, `apps/web`, `packages/types`, `packages/governance-sdk`
- Fastify plugin pattern for middleware
- Module-based route organization

### VIII. Domain Value Precision
- USD costs to 6 decimal places
- Risk scores as 0.0–1.0 floats
- Consistent enum usage across schema and application

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **Agent** | An AI system registered on the platform with a risk tier and lifecycle status |
| **Trace** | A UUID grouping all events from a single agent execution session |
| **AuditLog** | A record of an agent action (LLM call, tool call, approval event) |
| **ApprovalTicket** | A governance checkpoint requiring human decision for a risky action |
| **Policy** | A named set of rules that determine how agent actions are governed |
| **PolicyRule** | A single rule matching actionType + riskTier to an effect (ALLOW/DENY/REQUIRE) |
| **GovernanceClient** | SDK used by agents to interact with the platform (log, call LLM, request approval) |
| **Risk Tier** | Classification of agent danger level: LOW, MEDIUM, HIGH, CRITICAL |
| **Health Score** | Composite metric (0-100) combining error rate, latency, cost, and activity |
| **SSE** | Server-Sent Events — one-way realtime push from server to browser |
| **BullMQ** | Redis-backed job queue for background processing (Slack notifications) |

---

*Document generated from codebase analysis on 2026-03-21. Covers EPICs 2, 4, 5, 6, 7.*
