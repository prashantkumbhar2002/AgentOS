# AgentOS — Technical Design Document

**Project**: AgentOS — AI Agent Governance & Management Platform
**Version**: 4.0.0
**Date**: 2026-03-21 (updated)
**Branch**: `feat/enhancements/v1`

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
9. [Repository Pattern & Dependency Injection (FIX-01)](#9-repository-pattern--dependency-injection-fix-01)
10. [Error Hierarchy & Global Error Handler (FIX-02)](#10-error-hierarchy--global-error-handler-fix-02)
11. [Security Headers, Request ID & SSE Token (FIX-03)](#11-security-headers-request-id--sse-token-fix-03)
12. [N+1 Query Optimization (FIX-04)](#12-n1-query-optimization-fix-04)
13. [API Versioning (FIX-05)](#13-api-versioning-fix-05)
14. [GovernanceClient SDK](#14-governanceclient-sdk)
15. [Shared Types Package](#15-shared-types-package)
16. [Testing Strategy](#16-testing-strategy)
17. [Security & RBAC](#17-security--rbac)
18. [Configuration & Environment](#18-configuration--environment)
19. [Frontend Architecture (EPIC 8)](#19-frontend-architecture-epic-8)
20. [Constitution & Design Principles](#20-constitution--design-principles)
21. [Glossary](#21-glossary)

---

## 1. Overview

AgentOS is an AI Agent Governance & Management Platform that provides centralized control over autonomous AI agents. It enables organizations to:

- **Register and manage** AI agents with risk classification and lifecycle states
- **Audit every action** agents take — LLM calls, tool invocations, costs, latency
- **Enforce governance policies** that automatically ALLOW, DENY, or require human approval for agent actions based on risk tier and action type
- **Route high-risk decisions** through human-in-the-loop approval workflows with Slack integration and real-time notifications
- **Track costs and usage** across all agents with org-wide analytics dashboards
- **Demonstrate the platform** with two live Claude-powered showcase agents and a mock data seeder
- **Visualize everything** through a production-grade React dashboard with 8 pages, real-time SSE feed, and interactive charts

The platform consists of a Fastify REST API backend and a React SPA frontend, designed for teams operating multiple AI agents in production.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        API Gateway (Fastify v4)                      │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌─────────┐      │
│  │ Auth │ │Agents│ │ Audit │ │Approval│ │ Policy │ │Analytics│      │
│  │Routes│ │Routes│ │Routes │ │ Routes │ │ Routes │ │ Routes  │      │
│  └──┬───┘ └──┬───┘ └───┬───┘ └───┬────┘ └────┬───┘ └────┬────┘      │
│     │        │         │         │           │          │            │
│  ┌──┴────────┴─────────┴─────────┴───────────┴──────────┴────────┐   │
│  │              Service Layer (class-based, injected)             │   │
│  │  AgentService, AuditService, ApprovalService, PolicyService,  │   │
│  │  PolicyEvaluator, AnalyticsService                            │   │
│  └──────────────────────┬────────────────────────────────────────┘   │
│                         │ (depends on interfaces only)               │
│  ┌──────────────────────┴────────────────────────────────────────┐   │
│  │            Repository Interfaces (abstractions)               │   │
│  │  IAgentRepo, IAuditRepo, IApprovalRepo, IPolicyRepo,         │   │
│  │  IAnalyticsRepo                                               │   │
│  └──────────────────────┬────────────────────────────────────────┘   │
│                         │ (implemented by)                           │
│  ┌──────────────────────┴────────────────────────────────────────┐   │
│  │            Prisma Repository Implementations                  │   │
│  │  PrismaAgentRepo, PrismaAuditRepo, PrismaApprovalRepo,       │   │
│  │  PrismaPolicyRepo, PrismaAnalyticsRepo                        │   │
│  └──────────────────────┬────────────────────────────────────────┘   │
│                         │                                            │
│  ┌──────────────────────┴────────────────────────────────────────┐   │
│  │                  Prisma ORM (PostgreSQL 16)                   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────┐                                                   │
│  │ container.ts  │ ← Composition Root: wires repos → services        │
│  └───────────────┘                                                   │
│                                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐         │
│  │  JWT    │  │  SSE     │  │  BullMQ  │  │  Slack Plugin  │         │
│  │  Auth   │  │ Realtime │  │  Queue   │  │  Interactions  │         │
│  └─────────┘  └──────────┘  └──────────┘  └────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐     ┌───────────────────────────────┐
│  GovernanceClient SDK    │────▶│  Showcase Agents              │
│  (packages/governance-   │     │  - Email Draft Agent (Claude) │
│   sdk)                   │     │  - Research Agent (Claude)    │
│                          │     │  - Mock Data Seeder           │
└──────────────────────────┘     └───────────────────────────────┘
```

### Request Flow

1. Client sends HTTP request with JWT Bearer token
2. Helmet adds security headers (CSP, X-Frame-Options, HSTS, etc.)
3. Request ID assigned via `x-request-id` header (client-provided or UUID-generated)
4. Fastify rate limiter checks request count
5. `authenticate` or `requireRole` preHandler validates JWT and RBAC
6. Zod schema validates request body/query/params
7. Route handler calls service from `fastify.services.*` (injected via DI container)
8. Service executes business logic, delegates data access to repository interfaces
9. Prisma repository implementation executes actual database queries
10. On error: global error handler catches and returns typed response with `requestId`
11. SSE broadcast for real-time events (approvals created/resolved)
12. BullMQ enqueues background jobs (Slack notifications)
13. Response includes `x-request-id` header for traceability

### Governance Flow (for AI Agents)

```
Agent Action → GovernanceClient.requestApproval()
  → POST /api/v1/approvals
    → Policy Evaluator checks rules
      → ALLOW     → auto-approve, return immediately
      → DENY      → reject with PolicyBlockedError (403)
      → REQUIRE   → create ApprovalTicket
        → Slack notification (via BullMQ)
        → SSE broadcast to connected approvers
        → Agent polls GET /api/v1/approvals/:id until resolved
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
| **Auth** | JWT (@fastify/jwt) + bcrypt + jsonwebtoken (SSE tokens) | — |
| **Security** | @fastify/helmet | latest |
| **AI SDK** | @anthropic-ai/sdk | ^0.39.0 |
| **Messaging** | @slack/web-api | latest |
| **Testing** | Vitest + Supertest | v3 / v7 |
| **Realtime** | Server-Sent Events (SSE) | — |
| **Frontend Framework** | React | 18 |
| **Frontend Bundler** | Vite | 8.x |
| **Styling** | TailwindCSS + shadcn/ui | v3 |
| **Server State** | TanStack Query | v5 |
| **Client State** | Zustand | latest |
| **HTTP Client** | Axios | latest |
| **Routing** | React Router | v6 |
| **Charts** | Recharts | latest |
| **Icons** | Lucide React | latest |
| **Date Utils** | date-fns | latest |

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
│           ├── types/
│           │   └── dto.ts            # All service return DTOs (typed, no unknown)
│           ├── repositories/
│           │   ├── interfaces/       # Repository abstractions
│           │   │   ├── IAgentRepository.ts
│           │   │   ├── IAuditRepository.ts
│           │   │   ├── IApprovalRepository.ts
│           │   │   ├── IPolicyRepository.ts
│           │   │   └── IAnalyticsRepository.ts
│           │   ├── prisma/           # Prisma implementations
│           │   │   ├── PrismaAgentRepository.ts
│           │   │   ├── PrismaAuditRepository.ts
│           │   │   ├── PrismaApprovalRepository.ts
│           │   │   ├── PrismaPolicyRepository.ts
│           │   │   └── PrismaAnalyticsRepository.ts
│           │   └── mock/             # In-memory mocks for unit testing
│           │       ├── MockAgentRepository.ts
│           │       ├── MockAuditRepository.ts
│           │       ├── MockApprovalRepository.ts
│           │       └── MockPolicyRepository.ts
│           ├── errors/
│           │   ├── AppError.ts       # Base error + 8 typed subclasses
│           │   └── index.ts          # Barrel export
│           ├── plugins/
│           │   ├── auth.ts           # JWT + RBAC middleware (throws typed errors)
│           │   ├── errorHandler.ts   # Global Fastify error handler
│           │   ├── prisma.ts         # PrismaClient singleton + ServiceContainer
│           │   ├── sse.ts            # SSE fan-out manager
│           │   ├── bullmq.ts         # BullMQ notification queue
│           │   └── slack.ts          # Slack interactive endpoint
│           ├── modules/
│           │   ├── users/            # Auth (login, refresh, me)
│           │   ├── agents/           # Agent CRUD + lifecycle (class-based service)
│           │   ├── audit/            # Audit log ingestion + query (class-based service)
│           │   ├── approvals/        # Approval ticket lifecycle (class-based service)
│           │   ├── policies/         # Policy CRUD + evaluation (class-based service)
│           │   ├── analytics/        # Cost + usage analytics (class-based service)
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
│           ├── container.ts          # DI composition root (wires repos → services)
│           ├── app.ts               # Fastify app factory
│           └── server.ts            # Entry point
│   └── web/                          # React Dashboard (SPA)
│       └── src/
│           ├── components/
│           │   ├── layout/          # AppLayout, Sidebar, TopBar
│           │   ├── shared/          # StatusBadge, RiskBadge, StatCard, etc.
│           │   ├── dashboard/       # DashboardStats, AgentHealthTable, LiveFeed
│           │   ├── agents/          # AgentTable, RegisterModal, Detail tabs
│           │   ├── approvals/       # ApprovalCard, DecisionDialog, ResolvedTable
│           │   ├── audit/           # AuditTable, FilterBar, TraceDrawer
│           │   ├── analytics/       # Charts (Cost, Pie, Bar, Leaderboard)
│           │   ├── policies/        # PolicyList
│           │   └── ui/              # shadcn/ui primitives (28 components)
│           ├── hooks/               # useSSE, useAgents, useApprovals, etc.
│           ├── lib/                  # api.ts, queryClient.ts, formatters.ts
│           ├── pages/               # 8 route pages
│           ├── store/               # useAuthStore.ts (Zustand)
│           ├── App.tsx              # Router + providers
│           └── main.tsx             # Entry point
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
│   ├── 008-showcase-agents/
│   ├── 009-react-dashboard/
│   ├── 010-repository-pattern/      # FIX-01: Repository pattern refactor
│   ├── 011-error-hierarchy/         # FIX-02: Custom error hierarchy
│   ├── 012-security-headers/        # FIX-03: Security headers + SSE token
│   ├── 013-fix-n-plus-1/            # FIX-04: N+1 query optimization
│   └── 014-api-versioning/          # FIX-05: API versioning
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

All versioned endpoints require `Authorization: Bearer <JWT>`. Business endpoints are prefixed with `/api/v1/`. Auth, health, and Slack endpoints are unversioned. Old unversioned business paths (e.g., `/api/agents`) return 301 redirects to their `/api/v1/` equivalents.

### Authentication (`/api/auth`) — Unversioned

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None (rate limited: 10/15min) | Login with email+password, returns JWT |
| POST | `/api/auth/refresh` | Bearer JWT | Refresh JWT token |
| GET | `/api/auth/me` | Bearer JWT | Get current user profile |

### Agents (`/api/v1/agents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/agents` | Authenticated | Register a new agent |
| GET | `/api/v1/agents` | Authenticated | List agents (filter, paginate, search) |
| GET | `/api/v1/agents/:id` | Authenticated | Get agent details with tools and policies |
| PATCH | `/api/v1/agents/:id` | Admin | Update agent fields |
| PATCH | `/api/v1/agents/:id/status` | Admin/Approver | Transition agent status |
| DELETE | `/api/v1/agents/:id` | Admin | Soft-delete (deprecate) agent |

### Audit (`/api/v1/audit`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/audit/log` | Authenticated | Ingest an audit event |
| GET | `/api/v1/audit/logs` | Authenticated | Query logs (JSON or CSV export) |
| GET | `/api/v1/audit/traces/:traceId` | Authenticated | Get all events for a trace |
| GET | `/api/v1/audit/stats/:id` | Authenticated | Per-agent statistics |

### Approvals (`/api/v1/approvals`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/approvals` | Authenticated | Create approval ticket (policy-evaluated) |
| GET | `/api/v1/approvals` | Authenticated | List tickets (filter by status, agent) |
| GET | `/api/v1/approvals/:id` | Authenticated | Get ticket details |
| PATCH | `/api/v1/approvals/:id/decide` | Admin/Approver | Approve or deny a ticket |

### Policies (`/api/v1/policies`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/policies` | Admin | Create a named policy with rules |
| GET | `/api/v1/policies` | Authenticated | List all policies |
| GET | `/api/v1/policies/:id` | Authenticated | Get policy with rules and agents |
| PATCH | `/api/v1/policies/:id` | Admin | Update policy or its rules |
| DELETE | `/api/v1/policies/:id` | Admin | Delete policy (fails if assigned) |
| POST | `/api/v1/policies/:id/assign` | Admin | Assign policy to an agent |
| DELETE | `/api/v1/policies/:id/assign/:agentId` | Admin | Unassign policy from agent |
| POST | `/api/v1/policies/evaluate` | Authenticated | Evaluate policies for an action |

### Analytics (`/api/v1/analytics`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/analytics/costs` | Authenticated | Org cost summary (today, 7d, 30d, total, WoW change) |
| GET | `/api/v1/analytics/costs/timeline` | Authenticated | Daily cost timeline per agent (zero-filled) |
| GET | `/api/v1/analytics/usage` | Authenticated | Usage stats (runs, LLM/tool calls, approval breakdown) |
| GET | `/api/v1/analytics/agents` | Authenticated | Agent leaderboard (cost, runs, error rate, health) |
| GET | `/api/v1/analytics/models` | Authenticated | Model usage breakdown (calls, tokens, cost) |

### Showcase (`/api/v1/showcase`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/showcase/email-agent/run` | Authenticated | Run email draft agent (requires ANTHROPIC_API_KEY) |
| POST | `/api/v1/showcase/research-agent/run` | Authenticated | Run research agent (requires ANTHROPIC_API_KEY) |
| POST | `/api/v1/showcase/mock/seed` | Admin | Seed mock agents, logs, and approvals |

### System — Unversioned

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Health check |
| POST | `/api/v1/events/token` | Bearer JWT | Get short-lived SSE token (30s expiry) |
| GET | `/api/v1/events/stream?token=<sseToken>` | SSE token | SSE stream for real-time events |
| POST | `/slack/interactions` | Slack signature | Slack interactive approve/deny |

### Backward Compatibility Redirects

All old unversioned business paths return **301 Permanent Redirect** to their `/api/v1/` equivalents. Query parameters and path segments are preserved.

| Old Path | Redirects To |
|----------|-------------|
| `/api/agents/*` | `/api/v1/agents/*` |
| `/api/audit/*` | `/api/v1/audit/*` |
| `/api/approvals/*` | `/api/v1/approvals/*` |
| `/api/policies/*` | `/api/v1/policies/*` |
| `/api/analytics/*` | `/api/v1/analytics/*` |
| `/api/showcase/*` | `/api/v1/showcase/*` |
| `/api/events/*` | `/api/v1/events/*` |

**Total: 31 endpoints + 7 redirect prefixes**

---

## 7. Plugins & Middleware

### Auth Plugin (`plugins/auth.ts`)
- Registers `@fastify/jwt` with configurable secret and expiry
- Exports `authenticate` preHandler — validates Bearer JWT, throws `AuthenticationError` on failure (no string matching)
- Exports `requireRole(roles[])` preHandler — runs authenticate, then checks `request.user.role` against allowed roles, throws `AuthorizationError` on mismatch
- JWT payload shape: `{ id, email, name, role }`

### Error Handler Plugin (`plugins/errorHandler.ts`) — *Added in FIX-02*
- Registers a global `setErrorHandler` on the Fastify instance
- Handles 4 error categories:
  1. **AppError instances** — uses `statusCode` and `code` from the typed error class, logs at `warn` level
  2. **Fastify validation errors** — returns 400 with `VALIDATION_ERROR` code and validation details
  3. **JWT errors** — maps `FST_JWT_*` error codes to `AuthenticationError` responses
  4. **Unknown errors** — logs at `error` level, returns 500 with generic message in production (full message in dev)
- Every error response includes `requestId` for traceability

### Prisma Plugin (`plugins/prisma.ts`)
- Creates a singleton `PrismaClient` with dev-mode query logging
- Decorates `fastify.prisma` for use in route handlers
- Augments `FastifyInstance` with `services: ServiceContainer` (injected via `container.ts`)
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

### EPIC 8 — Frontend — React Dashboard

| Aspect | Detail |
|--------|--------|
| **User Stories** | 7 |
| **Functional Requirements** | 41 |
| **Success Criteria** | 9 |
| **Pages** | 8 (Login + 7 app pages) |
| **Components** | 40+ custom components |
| **shadcn/ui primitives** | 28 installed |

Production-grade React SPA covering the full platform:

**Pages**: Login, Dashboard, Agent Registry, Agent Detail, Approval Queue, Audit Explorer, Analytics, Policies

**Key architectural patterns**:
- All data fetching through TanStack Query hooks — no direct Axios calls in components
- Zustand auth store with localStorage persistence, wired to Axios interceptors
- SSE hook (`useSSE`) with exponential backoff reconnection, automatic query cache invalidation
- Consistent color system for agent status, risk tier, and event types across all pages
- shadcn/ui dark theme with zinc palette as base

**Key implementation files**: `api.ts`, `queryClient.ts`, `useAuthStore.ts`, `useSSE.ts`, `App.tsx`, all `pages/*.tsx`

### FIX-01 — Repository Pattern + Unit-Testable Business Logic

| Aspect | Detail |
|--------|--------|
| **Scope** | Backend architecture refactor |
| **Tasks** | 40 (R01–R40 across 6 phases) |
| **Files Created** | 19 new files |
| **Files Modified** | 13 existing files |
| **Unit Tests Added** | 54 (mock-based, no DB) |

Introduced a clean separation between business logic and data access:

1. **Repository Interfaces** — 6 abstraction interfaces (`IUserRepository`, `IAgentRepository`, `IAuditRepository`, `IApprovalRepository`, `IPolicyRepository`, `IAnalyticsRepository`) defining all data access contracts
2. **Prisma Implementations** — 6 concrete classes wrapping all Prisma queries behind the interfaces
3. **Service Refactor** — All 7 service/evaluator files converted from standalone functions to classes accepting repository interfaces via constructor injection (including `UserService`)
4. **DI Composition Root** — `container.ts` wires Prisma repos into service constructors; `fastify.decorate('services', container)` exposes them to routes
5. **Mock Repositories** — 4 in-memory Map-based mocks for pure unit testing without database
6. **Unit Tests** — 72 tests across 7 files running in ~90ms, validating all business logic without any DB or network dependency
7. **Full Prisma Isolation** — Zero `fastify.prisma` calls in any route, service, plugin, or showcase file

**Key results**:
- Zero `@prisma/client` imports in any service or route file
- Zero `fastify.prisma` usages in any route file (only in `app.ts` for container creation)
- Zero `Promise<unknown>` return types
- All service methods return typed DTOs defined in `types/dto.ts`
- Route handlers access services via `fastify.services.*` (type-safe Fastify decorator)
- Showcase/mock agents, Slack plugin, and notification worker all use repositories

**Key implementation files**: `container.ts`, `types/dto.ts`, `repositories/interfaces/*`, `repositories/prisma/*`, `repositories/mock/*`, all `*.service.ts`, all `*.unit.test.ts`

### FIX-02 — Custom Error Hierarchy + Global Error Handler

| Aspect | Detail |
|--------|--------|
| **Scope** | Error handling standardization |
| **Tasks** | 20 (across 6 phases) |
| **Files Created** | 4 new files |
| **Files Modified** | 10 existing files |

Replaced all ad-hoc error handling with a typed error hierarchy and single global Fastify error handler:

1. **Error Classes** — Base `AppError` class + 8 typed subclasses: `NotFoundError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `ConflictError`, `InvalidTransitionError`, `PolicyBlockedError`, `ExternalServiceError`
2. **Global Error Handler** — `plugins/errorHandler.ts` catches all errors, maps them to consistent JSON responses with `error`, `message`, `details`, and `requestId`
3. **Route Refactor** — All `reply.status(4xx).send()` calls across 8 route files and 2 plugins replaced with `throw new AppError(...)`
4. **Auth Plugin** — No more `error.message.includes('expired')` string matching; uses typed `AuthenticationError` with reason codes (`TOKEN_EXPIRED`, `TOKEN_INVALID`, `TOKEN_MISSING`)
5. **Zero `.catch(() => {})` patterns** — all silent error swallowing removed

**Key implementation files**: `errors/AppError.ts`, `errors/index.ts`, `plugins/errorHandler.ts`, all `*.routes.ts`, `plugins/auth.ts`

### FIX-03 — Security Headers + Request ID + SSE Token Fix

| Aspect | Detail |
|--------|--------|
| **Scope** | Security hardening |
| **Tasks** | 12 (across 6 phases) |
| **Files Created** | 2 new test files |
| **Files Modified** | 4 existing files |

Three security improvements:

1. **Security Headers** — `@fastify/helmet` adds X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Content-Security-Policy, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies. CSP customized for Tailwind (unsafe-inline styles) and SSE (crossOriginEmbedderPolicy disabled).
2. **Request Correlation ID** — Every request gets an `x-request-id` (client-provided or UUID-generated, truncated to 64 chars). Included in all logs and error responses. Returned in response headers.
3. **SSE Token Fix** — Main JWT no longer sent in SSE query string. New flow: `POST /api/v1/events/token` returns a 30-second `sseToken` (signed with separate `SSE_SECRET`), client connects to `GET /api/v1/events/stream?token=<sseToken>`. Frontend `useSSE` hook updated accordingly.

**Key implementation files**: `app.ts`, `config/env.ts`, `hooks/useSSE.ts`, `security.test.ts`, `sse-token.test.ts`

### FIX-04 — Fix N+1 Query Performance

| Aspect | Detail |
|--------|--------|
| **Scope** | Database query optimization |
| **Tasks** | 7 (across 5 phases) |
| **Files Modified** | 2 repository files |
| **Tests Added** | 3 |

Eliminated N+1 query patterns in the repository layer:

1. **Agent List** — `PrismaAgentRepository.findMany()` replaced `Promise.all(agents.map(=> auditLog.aggregate()))` (50 queries for 50 agents) with a single `auditLog.groupBy({ by: ['agentId'] })` + `Map` lookup. Reduces query count from N+1 to 2.
2. **Analytics Cost Aggregation** — `PrismaAnalyticsRepository.getCostAggregates()` replaced sequential `for` loop with `Promise.all(ranges.map(...))` for parallel execution.
3. **Verification** — Unit tests assert `groupBy` is called exactly once (not N times).

**Key implementation files**: `PrismaAgentRepository.ts`, `PrismaAnalyticsRepository.ts`, `PrismaAgentRepository.test.ts`

### FIX-05 — API Versioning

| Aspect | Detail |
|--------|--------|
| **Scope** | Route versioning + backward compatibility |
| **Tasks** | 14 (across 5 phases) |
| **Files Modified** | 9 (1 backend + 2 frontend + 6 test files) |
| **Files Created** | 1 new test file |
| **Tests Added** | 15 |

Added version prefix to all business-logic endpoints:

1. **Versioned Routes** — All business endpoints moved from `/api/agents` to `/api/v1/agents`, etc. Applies to: agents, audit, approvals, policies, analytics, showcase, events.
2. **Unversioned (stable)** — `/api/health`, `/api/auth/*`, `/slack/interactions` remain at current paths.
3. **301 Redirects** — Old unversioned paths redirect to `/api/v1/` equivalents, preserving path segments and query parameters. All HTTP methods supported.
4. **Frontend Updated** — `lib/api.ts` and `useSSE.ts` updated to use `/api/v1/` prefix.
5. **Tests Updated** — 6 integration test files + 1 new redirect test file (15 tests).

**Key implementation files**: `app.ts`, `lib/api.ts`, `hooks/useSSE.ts`, `api-versioning.test.ts`

---

## 9. Repository Pattern & Dependency Injection (FIX-01)

### 9.1 Motivation

Before FIX-01, all service functions directly accepted `PrismaClient` as a parameter. This made services tightly coupled to the database layer — every unit test required a live PostgreSQL connection, making tests slow (~3-5s per file) and fragile.

After FIX-01, services depend only on repository interfaces. Business logic is fully testable with in-memory mock repositories that run in milliseconds.

### 9.2 Repository Interfaces

All interfaces live in `apps/api/src/repositories/interfaces/`:

| Interface | Key Methods |
|-----------|-------------|
| `IUserRepository` | `findByEmail`, `findById`, `findByRole`, `findByNameContains`, `create` |
| `IAgentRepository` | `findById`, `findMany`, `findByName`, `create`, `update`, `updateStatus`, `exists`, `updateLastActiveAt` |
| `IAuditRepository` | `create`, `createMany`, `countByAgent`, `findMany`, `findByTraceId`, `getAgentStats`, `exportRows` |
| `IApprovalRepository` | `create`, `createMany`, `countByAgents`, `findById`, `findMany`, `resolve`, `expireStale`, `updateSlackMsgTs`, `getPendingCount` |
| `IPolicyRepository` | `create`, `findById`, `findMany`, `update`, `delete`, `findByName`, `getAssignedAgentCount`, `assign`, `unassign`, `findAssignment`, `getAgentPoliciesWithRules`, `getGlobalPoliciesWithRules` |
| `IAnalyticsRepository` | `getCostAggregates`, `getCostByAgentByDay`, `getUsageCounts`, `getApprovalCountsByStatus`, `getAgentMetrics`, `getModelMetrics` |

### 9.3 DTOs (`types/dto.ts`)

All service methods return explicitly typed DTOs — no `unknown`, no `any`, no raw Prisma types leaking to route handlers.

Key DTOs include: `AgentSummary`, `AgentDetail`, `AuditLogEntry`, `ApprovalTicketSummary`, `ApprovalTicketDetail`, `PolicyDetail`, `PolicyWithRules`, `CostAggregate`, `UsageCount`, `AgentMetric`, `ModelMetric`, `PaginatedResult<T>`.

### 9.4 Service Classes

All 6 services are now class-based with constructor injection:

| Service | Constructor Dependencies |
|---------|------------------------|
| `UserService` | `IUserRepository` |
| `AgentService` | `IAgentRepository`, `IAuditRepository`, `IApprovalRepository`, `IPolicyRepository` |
| `AuditService` | `IAuditRepository`, `IAgentRepository` |
| `ApprovalService` | `IApprovalRepository` |
| `PolicyService` | `IPolicyRepository`, `IAgentRepository` |
| `PolicyEvaluator` | `IPolicyRepository`, `IAgentRepository` |
| `AnalyticsService` | `IAnalyticsRepository` |

Services contain only business logic: validation, status transitions, cost calculations, health scores, policy evaluation priority, date-filling, CSV generation, etc.

### 9.5 Composition Root (`container.ts`)

```typescript
export function createContainer(prisma: PrismaClient): ServiceContainer {
  const agentRepo = new PrismaAgentRepository(prisma);
  const auditRepo = new PrismaAuditRepository(prisma);
  const approvalRepo = new PrismaApprovalRepository(prisma);
  const policyRepo = new PrismaPolicyRepository(prisma);
  const analyticsRepo = new PrismaAnalyticsRepository(prisma);
  const userRepo = new PrismaUserRepository(prisma);

  const agentService = new AgentService(agentRepo, auditRepo, approvalRepo, policyRepo);
  const auditService = new AuditService(auditRepo, agentRepo);
  const approvalService = new ApprovalService(approvalRepo);
  const policyService = new PolicyService(policyRepo, agentRepo);
  const policyEvaluator = new PolicyEvaluator(policyRepo, agentRepo);
  const analyticsService = new AnalyticsService(analyticsRepo);
  const userService = new UserService(userRepo);

  return {
    agentService, auditService, approvalService, policyService,
    policyEvaluator, analyticsService, userService,
    agentRepo, auditRepo, approvalRepo, userRepo,
  };
}
```

The container is created in `app.ts` after the Prisma plugin registers and exposed via `fastify.decorate('services', container)`. Route handlers access services as `fastify.services.agentService`, etc. Raw repository references are also exposed for showcase agents and the mock data seeder.

### 9.6 Route Wiring Pattern

Before (direct Prisma):
```typescript
fastify.get('/agents', async (request, reply) => {
  const agents = await listAgents(fastify.prisma, request.query);
  return agents;
});
```

After (DI container):
```typescript
fastify.get('/agents', async (request, reply) => {
  const { agentService } = fastify.services;
  const agents = await agentService.listAgents(request.query);
  return agents;
});
```

### 9.7 Mock Repositories for Testing

4 in-memory mock implementations (`repositories/mock/`), each using a `Map<string, T>` as the backing store. They implement the full repository interface and support pre-loading test data.

```typescript
const agentRepo = new MockAgentRepository();
const auditRepo = new MockAuditRepository();
const service = new AgentService(agentRepo, auditRepo, ...);
// Tests run in ~1ms per assertion — no DB, no network
```

### 9.8 Before/After Comparison

| Aspect | Before (FIX-01) | After (FIX-01) |
|--------|-----------------|----------------|
| **Service style** | Standalone functions taking `PrismaClient` | Classes with constructor-injected interfaces |
| **Data access** | Direct `prisma.agent.findMany()` in services | `this.agentRepo.findMany()` via interface |
| **Return types** | Raw Prisma types (`any`, `unknown`) | Typed DTOs (`AgentSummary`, `AgentDetail`, etc.) |
| **Unit testability** | Required live PostgreSQL | In-memory mocks, ~90ms for 72 tests |
| **Route coupling** | Routes imported service functions + `fastify.prisma` | Routes access `fastify.services.*` only |
| **Wiring** | Ad-hoc per route file | Single composition root (`container.ts`) |
| **`fastify.prisma` in routes** | 12 direct usages across 6 route files | 0 usages (only in `app.ts` for container creation) |

---

## 10. Error Hierarchy & Global Error Handler (FIX-02)

### 10.1 Error Class Hierarchy

All error classes live in `apps/api/src/errors/AppError.ts`:

```
AppError (base)
├── NotFoundError         404  NOT_FOUND
├── ValidationError       400  VALIDATION_ERROR
├── AuthenticationError   401  TOKEN_EXPIRED | TOKEN_INVALID | TOKEN_MISSING
├── AuthorizationError    403  FORBIDDEN
├── ConflictError         409  CONFLICT
├── InvalidTransitionError 400  INVALID_TRANSITION
├── PolicyBlockedError    403  POLICY_BLOCKED
└── ExternalServiceError  503  EXTERNAL_SERVICE_ERROR
```

Each error carries: `code` (machine-readable), `message` (human-readable), `statusCode` (HTTP), and optional `details` (structured metadata).

### 10.2 Error Response Format

All error responses follow a consistent shape:

```json
{
  "error": "NOT_FOUND",
  "message": "Agent with id 'abc-123' not found",
  "details": { "resource": "Agent", "id": "abc-123" },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 10.3 Before/After

| Aspect | Before (FIX-02) | After (FIX-02) |
|--------|-----------------|----------------|
| **Route error handling** | `reply.status(404).send({ error: 'Not found' })` scattered across routes | `throw new NotFoundError('Agent', id)` — routes have no error-formatting logic |
| **Auth errors** | `error.message.includes('expired')` string matching | `throw new AuthenticationError('TOKEN_EXPIRED')` with typed reason codes |
| **Error swallowing** | `.catch(() => {})` silently hid failures | All errors propagate to global handler |
| **Response consistency** | Mixed formats across endpoints | Uniform `{ error, message, details, requestId }` |
| **Logging** | Ad-hoc `console.log` | `warn` for 4xx, `error` for 5xx, with request path and ID |

---

## 11. Security Headers, Request ID & SSE Token (FIX-03)

### 11.1 Security Headers (Helmet)

`@fastify/helmet` is registered early in the plugin chain and adds:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `SAMEORIGIN` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` | Enforces HTTPS |
| `Content-Security-Policy` | `default-src 'self'; ...` | Controls resource loading |
| `X-DNS-Prefetch-Control` | `off` | Prevents DNS prefetching leaks |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks cross-domain policy files |

CSP customizations: `styleSrc` includes `'unsafe-inline'` (required by Tailwind), `connectSrc` includes `FRONTEND_URL`, `crossOriginEmbedderPolicy` disabled (required for SSE).

### 11.2 Request Correlation ID

Every request receives an `x-request-id`:

1. If client sends `x-request-id` header → used as-is (truncated to 64 chars)
2. If not provided → UUID v4 generated
3. Included in all log lines via Fastify's logger
4. Included in all error responses
5. Returned in response `x-request-id` header

### 11.3 SSE Token Flow

Old (insecure): Main JWT sent in query string → logged everywhere.

New (FIX-03):

```
1. Client: POST /api/v1/events/token (Bearer JWT in header)
2. Server: Signs { userId, role, type: 'sse' } with SSE_SECRET, expiresIn: 30s
3. Server: Returns { sseToken, expiresIn: 30 }
4. Client: GET /api/v1/events/stream?token=<sseToken> (immediately)
5. Server: Verifies sseToken with SSE_SECRET, checks type === 'sse'
6. Server: Establishes SSE connection
```

The `sseToken` is a separate JWT signed with `SSE_SECRET` (not the main `JWT_SECRET`), contains only `{ userId, role, type }`, and expires in 30 seconds. Even if logged, it's useless after 30s and cannot be used for API authentication.

---

## 12. N+1 Query Optimization (FIX-04)

### 12.1 Problem

`PrismaAgentRepository.findMany()` executed N+1 queries when listing agents:

```
1 query: SELECT agents (findMany)
N queries: SELECT aggregate(costUsd) WHERE agentId = ? (one per agent)
```

For 50 agents, this meant 51 database queries per list request.

### 12.2 Solution

Replaced per-agent `aggregate` calls with a single `groupBy`:

```
1 query: SELECT agents (findMany)
1 query: SELECT agentId, SUM(costUsd) GROUP BY agentId WHERE agentId IN (...)
```

Results are stored in a `Map<agentId, cost>` for O(1) lookup per agent.

Similarly, `PrismaAnalyticsRepository.getCostAggregates()` replaced a sequential `for` loop with `Promise.all()` to parallelize independent aggregate queries.

---

## 13. API Versioning (FIX-05)

### 13.1 Versioning Strategy

All business-logic endpoints are prefixed with `/api/v1/`. Stable infrastructure endpoints remain unversioned.

| Category | Prefix | Endpoints |
|----------|--------|-----------|
| **Versioned** | `/api/v1/` | agents, audit, approvals, policies, analytics, showcase, events |
| **Unversioned** | `/api/` | auth, health |
| **Webhook** | `/slack/` | interactions |

### 13.2 Backward Compatibility

301 Permanent Redirects are registered for all old unversioned paths:

- Applies to all HTTP methods (GET, POST, PATCH, DELETE)
- Preserves path segments: `/api/agents/abc` → `/api/v1/agents/abc`
- Preserves query parameters: `/api/agents?page=2` → `/api/v1/agents?page=2`

### 13.3 Frontend Changes

Only 2 files updated (centralized API configuration):

- `apps/web/src/lib/api.ts` — all 24 versioned paths updated
- `apps/web/src/hooks/useSSE.ts` — SSE token and stream paths updated

Auth paths (`/api/auth/*`) remain unchanged in the frontend.

---

## 14. GovernanceClient SDK

The SDK (`packages/governance-sdk`) is the interface between AI agents and the AgentOS platform. Every agent action flows through this client.

> **Note**: The GovernanceClient SDK is not affected by the FIX-01 refactor — it communicates with the API via HTTP, independent of internal architecture.

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
| `logEvent(payload)` | POST to `/api/v1/audit/log` — fire-and-forget audit event |
| `createMessage(params)` | Wraps `anthropic.messages.create()`, auto-logs `llm_call` event with tokens, cost, latency, success/failure |
| `callTool(name, inputs, fn)` | Wraps arbitrary async function, auto-logs `tool_call` event with latency and success/failure |
| `requestApproval(params)` | POST to `/api/v1/approvals`, polls until resolved or timeout. Returns `{ decision, ticketId }` |

### Approval Polling

`requestApproval` creates a ticket and polls `GET /api/v1/approvals/:id` every `pollIntervalMs` (default 3s) until the status changes from PENDING or `maxWaitMs` (default 30min) elapses. Returns the final decision: `APPROVED`, `DENIED`, `EXPIRED`, `AUTO_APPROVED`, or `ERROR`.

---

## 15. Shared Types Package

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

## 16. Testing Strategy

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
| `policies.evaluator.test.ts` | Service | 11 | Evaluator: DENY/ALLOW/REQUIRE, wildcards, priority (Prisma-backed) |
| `analytics.test.ts` | Integration | 16 | All 5 analytics endpoints |
| `analytics.service.test.ts` | Service | 17 | Aggregation functions, date ranges, sorting (Prisma-backed) |
| `health-score.test.ts` | Unit | 10 | Health score weighting, bounds |
| `cost-calculator.test.ts` | Unit | 8 | Per-model cost calculation |
| `GovernanceClient.test.ts` | Unit | 6 | SDK methods, mocked fetch |
| `agents.service.unit.test.ts` | Unit (mock) | 15 | AgentService: status transitions, CRUD, pagination, stats |
| `audit.service.unit.test.ts` | Unit (mock) | 7 | AuditService: createLog, queryLogs, traces, stats, CSV |
| `approvals.service.unit.test.ts` | Unit (mock) | 10 | ApprovalService: create, resolve, expire, list |
| `policies.service.unit.test.ts` | Unit (mock) | 11 | PolicyService: CRUD, assign, duplicate guard, delete guard |
| `policies.evaluator.unit.test.ts` | Unit (mock) | 11 | PolicyEvaluator: DENY wins, REQUIRE default, wildcards, conditions |
| `AppError.test.ts` | Unit | 20 | Error class hierarchy: statusCode, code, message, name, details *(FIX-02)* |
| `errorHandler.test.ts` | Unit | 8 | Global handler: AppError, Zod, JWT, unknown errors, requestId *(FIX-02)* |
| `security.test.ts` | Unit | 10 | Security headers + request ID presence/passthrough/truncation *(FIX-03)* |
| `sse-token.test.ts` | Unit | 7 | SSE token endpoint + stream auth with valid/invalid/expired tokens *(FIX-03)* |
| `PrismaAgentRepository.test.ts` | Unit | 3 | N+1 fix: groupBy called once, empty list skip, default to 0 *(FIX-04)* |
| `api-versioning.test.ts` | Unit | 15 | 301 redirects, path/query preservation, unversioned endpoints *(FIX-05)* |

**Total: 22 test files, 277 test cases**

### Test Categories

- **Integration tests** (7 files, 108 cases): Use Supertest against the full Fastify app with a real test database. Each test file seeds its own data and cleans up.
- **Service tests** (2 files, 28 cases): Test business logic with Prisma repository implementations against a real database but no HTTP layer.
- **Unit tests — mock repos** (5 files, 54 cases): Pure business logic tests using in-memory mock repositories. No database, no network. Run in ~89ms total. *(Added in FIX-01)*
- **Unit tests — infrastructure** (5 files, 45 cases): Error hierarchy, global handler, security headers, SSE token auth, redirect tests. *(Added in FIX-02/03/05)*
- **Unit tests — repository** (1 file, 3 cases): Repository-level N+1 fix verification. *(Added in FIX-04)*
- **Unit tests — pure functions** (3 files, 24 cases): Pure function tests (health score, cost calculator, SDK).

### Test Isolation

- Each integration test file creates its own Fastify instance via `buildApp()`
- Database state is cleaned in `beforeAll`/`afterAll`/`afterEach` hooks
- Tests use unique identifiers to avoid cross-test interference

---

## 17. Security & RBAC

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

### Security Headers *(Added in FIX-03)*

All responses include security headers via `@fastify/helmet`:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=15552000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'; ...`
- `X-DNS-Prefetch-Control: off`
- `X-Permitted-Cross-Domain-Policies: none`

### Request Correlation *(Added in FIX-03)*

- Every request has an `x-request-id` (client-provided or auto-generated UUID)
- Included in all log lines and error responses
- Returned in response headers for client-side tracing

### Security Constraints

- CORS restricted to `FRONTEND_URL` in production
- No full secret/PII payloads in audit logs
- No hardcoded secrets — all via environment variables
- No stack traces in production 500 responses
- Slack signatures verified via HMAC-SHA256
- SSE uses dedicated short-lived tokens (30s) — main JWT never in query strings *(FIX-03)*
- Typed error hierarchy prevents accidental information leakage *(FIX-02)*

---

## 18. Configuration & Environment

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
| `SSE_SECRET` | (auto-generated default) | SSE token signing secret (min 32 chars) *(FIX-03)* |

### Seed Data

Running `npx prisma db seed` creates:

| Entity | Items |
|--------|-------|
| **Users** | admin@agentos.dev (admin), approver@agentos.dev (approver), viewer@agentos.dev (viewer) |
| **Agents** | Email Draft Agent (HIGH), Research Agent (MEDIUM), Mock CRM Agent (MEDIUM), Mock Analytics Agent (LOW), Mock Compliance Agent (CRITICAL) |
| **Policies** | External Email Approval (REQUIRE for send_email), Delete Protection (DENY for delete_record/CRITICAL), Low Risk Auto-Allow (ALLOW for */LOW) |
| **Assignments** | "External Email Approval" → "Email Draft Agent" |

---

## 19. Frontend Architecture (EPIC 8)

### 15.1 Tech Stack & Build

| Concern | Choice |
|---------|--------|
| **Framework** | React 18 (SPA) |
| **Bundler** | Vite 8.x |
| **Styling** | TailwindCSS v3 + shadcn/ui (zinc dark theme) |
| **Server State** | TanStack Query v5 |
| **Client State** | Zustand (persisted to localStorage) |
| **HTTP** | Axios with JWT request interceptor + 401 response interceptor |
| **Routing** | React Router v6 with protected route wrapper |
| **Charts** | Recharts (LineChart, PieChart, BarChart) |
| **Icons** | Lucide React |
| **Dates** | date-fns (formatDistanceToNow, format) |
| **Utilities** | clsx + tailwind-merge (via `cn()` helper) |

### 15.2 Project Structure

```
apps/web/src/
├── components/
│   ├── layout/           AppLayout, Sidebar, TopBar
│   ├── shared/           StatusBadge, RiskBadge, EventBadge, StatCard,
│   │                     EmptyState, ErrorState, HealthBar, ConfirmDialog
│   ├── dashboard/        DashboardStats, AgentHealthTable, LiveActivityFeed
│   ├── agents/           AgentFilterBar, AgentTable, RegisterAgentModal,
│   │                     AgentHeader, AgentStats, 5 detail tabs
│   ├── approvals/        ApprovalCard, ApprovalDecisionDialog, ResolvedTable
│   ├── audit/            AuditFilterBar, AuditTable, TraceDrawer
│   ├── analytics/        CostSummaryCards, CostTimelineChart,
│   │                     ApprovalPieChart, ModelUsageChart, LeaderboardTable
│   ├── policies/         PolicyList
│   └── ui/               28 shadcn/ui primitives (Button, Card, Dialog, etc.)
├── hooks/
│   ├── useSSE.ts         SSE connection with exponential backoff
│   ├── useAgents.ts      TanStack Query hooks for agent CRUD
│   ├── useApprovals.ts   Approval list + decision mutations
│   ├── useAuditLogs.ts   Audit query + CSV export
│   ├── useAnalytics.ts   5 analytics query hooks
│   └── usePolicies.ts    Policy list + detail
├── lib/
│   ├── api.ts            Axios instance + typed API functions per module
│   ├── queryClient.ts    QueryClient + key factories
│   ├── formatters.ts     formatUsd, formatRelativeTime, formatDuration, formatTokens
│   └── utils.ts          cn() helper
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── AgentsPage.tsx
│   ├── AgentDetailPage.tsx
│   ├── ApprovalsPage.tsx
│   ├── AuditPage.tsx
│   ├── AnalyticsPage.tsx
│   └── PoliciesPage.tsx
├── store/
│   └── useAuthStore.ts   Zustand auth state with persist middleware
├── App.tsx               Router + QueryClientProvider + Toaster
└── main.tsx              Entry point
```

### 15.3 Data Flow Architecture

```
User Action → Component → useMutation/useQuery (TanStack)
                              ↓
                         lib/api.ts (Axios)
                              ↓ (request interceptor adds JWT)
                         Fastify API
                              ↓
                         Response
                              ↓ (401 → interceptor clears auth, redirect /login)
                         TanStack Cache → Re-render
```

**SSE Flow** *(updated in FIX-03)*:
```
useSSE hook → POST /api/v1/events/token (Bearer JWT)
                  ↓
           Receive { sseToken, expiresIn: 30 }
                  ↓
           EventSource(GET /api/v1/events/stream?token=<sseToken>)
                  ↓
           Parse event type
                  ↓
           queryClient.invalidateQueries(['approvals' | 'agents' | 'audit'])
                  ↓
           Component auto-refetches via TanStack Query
```

### 15.4 State Management

**Server State (TanStack Query)**:
- `staleTime: 30s` — data considered fresh for 30 seconds
- `gcTime: 5min` — unused cache garbage collected after 5 minutes
- `retry: 1` — single retry on failure
- Key factories for consistent cache management:
  - `agentKeys.all` / `agentKeys.detail(id)` / `agentKeys.list(filters)`
  - `approvalKeys.all` / `approvalKeys.detail(id)` / `approvalKeys.list(filters)`
  - `auditKeys.all` / `auditKeys.list(filters)` / `auditKeys.trace(traceId)` / `auditKeys.agentStats(agentId)`
  - `analyticsKeys.costs` / `analyticsKeys.timeline(range)` / `analyticsKeys.usage` / `analyticsKeys.leaderboard` / `analyticsKeys.models`
  - `policyKeys.all` / `policyKeys.detail(id)` / `policyKeys.list()`

**Client State (Zustand)**:
- `useAuthStore`: `{ user, token, isAuthenticated, login(), logout() }`
- Persisted to `localStorage` key `"auth-storage"`
- On `login()`: calls `POST /api/auth/login`, stores token, fetches `GET /api/auth/me`
- On `logout()`: clears state, redirects to `/login`

### 15.5 Authentication Flow

1. User submits email/password on `LoginPage`
2. `useAuthStore.login()` calls `POST /api/auth/login` → receives JWT
3. Stores `{ user, token }` in Zustand (persisted to localStorage)
4. Axios request interceptor reads token from store, attaches `Authorization: Bearer <token>`
5. On any 401 response: interceptor calls `logout()`, redirects to `/login`
6. `ProtectedRoute` component checks `isAuthenticated`, redirects unauthenticated users

### 15.6 SSE (Server-Sent Events) Integration

The `useSSE` hook provides live updates across the dashboard:

| Event Type | Query Invalidation | UI Effect |
|------------|-------------------|-----------|
| `approval.*` | `['approvals']` | New card in approval queue, remove resolved |
| `agent.*` | `['agents']` | Status updates in agent table |
| `audit.*` | `['audit']` | New entries in audit explorer |

**Reconnection Strategy**: Exponential backoff starting at 2s, doubling each attempt, capped at 30s. Event buffer limited to 50 entries (FIFO).

### 15.7 Routing

| Path | Page | Auth Required | Role |
|------|------|--------------|------|
| `/login` | LoginPage | No | — |
| `/` | DashboardPage | Yes | Any |
| `/agents` | AgentsPage | Yes | Any |
| `/agents/:id` | AgentDetailPage | Yes | Any |
| `/approvals` | ApprovalsPage | Yes | Any |
| `/audit` | AuditPage | Yes | Any |
| `/analytics` | AnalyticsPage | Yes | Any |
| `/policies` | PoliciesPage | Yes | Any |

Admin-only features (edit agent, register agent, export CSV) are conditionally rendered based on `user.role`.

### 15.8 Color System

**Agent Status**:
| Status | Color | Tailwind Class |
|--------|-------|---------------|
| DRAFT | Slate | `bg-slate-500/20 text-slate-400` |
| APPROVED | Blue | `bg-blue-500/20 text-blue-400` |
| ACTIVE | Green | `bg-green-500/20 text-green-400` |
| SUSPENDED | Amber | `bg-amber-500/20 text-amber-400` |
| DEPRECATED | Red | `bg-red-500/20 text-red-400` |

**Risk Tier**:
| Tier | Color | Tailwind Class |
|------|-------|---------------|
| LOW | Green | `bg-green-500/20 text-green-400` |
| MEDIUM | Yellow | `bg-yellow-500/20 text-yellow-400` |
| HIGH | Orange | `bg-orange-500/20 text-orange-400` |
| CRITICAL | Red | `bg-red-500/20 text-red-400` |

**Event Type**:
| Event | Color | Icon |
|-------|-------|------|
| llm_call | Blue | Brain |
| tool_call | Violet | Wrench |
| approval_requested | Orange | Clock |
| approval_resolved | Green | CheckCircle |
| action_blocked | Red | XCircle |

### 15.9 Page Details

**Dashboard** — 3-panel layout:
- Top: 4 StatCards (Total Agents, Active Agents, Pending Approvals with pulse, Today's Cost)
- Left (60%): Sortable Agent Health Table with HealthBar, clickable rows → Agent Detail
- Right (40%): Live Activity Feed (SSE, auto-scroll, max 50, color-coded EventBadges)

**Agent Registry** — Filter + Table + Modal:
- Filter bar: status, risk tier, environment dropdowns, owner team input, search
- Sortable table with inline StatusBadge, RiskBadge
- 3-step registration modal: Basic Info → Tools → Risk Assessment

**Agent Detail** — Header + Stats + 5 Tabs:
- Header: name, badges, edit button (admin)
- 4 mini StatCards: runs, cost, latency, health
- Tabs: Overview (tools + policies), Traces (grouped by traceId accordion), Approvals (history table), Policies (assigned list), Settings (edit form + status controls, admin only)

**Approval Queue** — 2-column layout:
- Left: pending ApprovalCards sorted by urgency, pulsing red border < 5min, Approve/Deny buttons → ConfirmDialog with comment input
- Right: resolved tickets table
- Real-time via SSE

**Audit Explorer** — Filter + Table + Drawer:
- Filter bar: agent, event type, date range, trace ID search
- Paginated sortable table with CSV export (admin/approver)
- Click row → TraceDrawer (side sheet) with timeline view

**Analytics** — Charts dashboard:
- Time range selector (7d / 30d / 90d)
- Cost summary cards with trend arrows
- Multi-line cost timeline chart (Recharts LineChart, per agent)
- Approval outcome pie chart (Recharts PieChart)
- Model usage bar chart (Recharts BarChart)
- Agent leaderboard sortable table

**Policies** — Read-only list:
- Expandable policy cards showing rules, action types, risk tiers, effects

### 15.10 shadcn/ui Components Used

28 primitives installed and configured with dark theme:

`Accordion`, `AlertDialog`, `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `Form`, `Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Sonner (Toaster)`, `Switch`, `Table`, `Tabs`, `Textarea`, `Toggle`, `Tooltip`

### 15.11 API Client Functions

`apps/web/src/lib/api.ts` exports typed functions organized by module:

| Module | Functions |
|--------|-----------|
| `authApi` | `login(email, password)`, `me()`, `refresh()` |
| `agentsApi` | `list(params)`, `getById(id)`, `create(data)`, `update(id, data)`, `updateStatus(id, status)`, `remove(id)` |
| `approvalsApi` | `list(params)`, `getById(id)`, `decide(id, decision, comment)` |
| `auditApi` | `list(params)`, `getTrace(traceId)`, `getAgentStats(agentId)`, `exportCsv(params)` |
| `policiesApi` | `list()`, `getById(id)` |
| `analyticsApi` | `getCosts(params)`, `getCostTimeline(params)`, `getUsage(params)`, `getAgentLeaderboard(params)`, `getModelUsage(params)` |
| `showcaseApi` | `runEmailAgent(task)`, `runResearchAgent(topic)`, `seedMockData()` |

---

## 20. Constitution & Design Principles

The project follows 8 non-negotiable principles defined in the constitution:

### I. TypeScript Strict + Zod
- No `any` types — strict mode enforced
- All Fastify inputs/outputs validated with Zod
- Shared schemas in `packages/types` with `*Schema` naming convention
- Environment variables validated on startup

### II. Prisma-Exclusive Data Access (via Repository Pattern)
- No raw SQL or alternative ORMs
- PascalCase model names
- Migrations via `prisma migrate dev` (never `db push` in production)
- PostgreSQL 16 only
- All Prisma access encapsulated in repository implementations — services never import `@prisma/client` directly
- Business logic services depend on repository interfaces for testability

### III. Test-Driven Quality Gates
- Every route has happy-path + error Supertest integration tests
- Business logic unit-tested with Vitest using mock repositories (no DB required)
- External services mocked in tests
- Isolated test database with transactional cleanup for integration tests
- 120 pure unit tests run in ~1.5s (mock repos, error classes, security, SSE, N+1, versioning); 136 total integration/service tests with DB

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

## 21. Glossary

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
| **TanStack Query** | Server-state management library; handles caching, refetching, mutations |
| **Zustand** | Lightweight client-state store used for auth persistence |
| **shadcn/ui** | Copy-paste UI component library built on Radix UI + Tailwind |
| **Query Key Factory** | Pattern for generating consistent TanStack Query cache keys per domain |
| **Protected Route** | React Router wrapper that redirects unauthenticated users to /login |
| **useSSE Hook** | Custom React hook managing EventSource connection with reconnection logic |
| **Repository Interface** | Abstraction defining data access methods; services depend on interfaces, not implementations |
| **Prisma Repository** | Concrete implementation of a repository interface using Prisma ORM queries |
| **Mock Repository** | In-memory Map-based implementation of a repository interface for unit testing |
| **Composition Root** | `container.ts` — the single place where all repositories and services are wired together |
| **Service Container** | TypeScript interface exposing all service instances; decorated on `fastify.services` |
| **DTO** | Data Transfer Object — typed return structure from services to routes (no raw Prisma types) |
| **Constructor Injection** | Pattern where dependencies are passed to a class constructor rather than imported globally |
| **AppError** | Base error class for the typed error hierarchy; all business errors extend this |
| **Global Error Handler** | Fastify `setErrorHandler` plugin that catches all errors and returns consistent JSON responses |
| **Request ID** | UUID correlation identifier (`x-request-id`) attached to every request for log traceability |
| **Helmet** | `@fastify/helmet` plugin that sets security HTTP headers (CSP, HSTS, X-Frame-Options, etc.) |
| **SSE Token** | Short-lived JWT (30s, signed with `SSE_SECRET`) used for SSE connection authentication |
| **N+1 Query** | Anti-pattern where a list query triggers N additional queries (one per item); fixed with `groupBy` |
| **API Versioning** | Route prefix strategy (`/api/v1/`) enabling future breaking changes without disrupting existing consumers |
| **301 Redirect** | Permanent redirect from old unversioned paths to versioned equivalents for backward compatibility |

---

*Document generated from codebase analysis on 2026-03-21. Updated 2026-03-21 with FIX-01 through FIX-05. Covers EPICs 2, 4, 5, 6, 7, 8 + FIX-01 (Repository Pattern) + FIX-02 (Error Hierarchy) + FIX-03 (Security Headers) + FIX-04 (N+1 Fix) + FIX-05 (API Versioning).*
