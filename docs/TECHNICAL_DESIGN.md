# AgentOS — Technical Design Document

**Project**: AgentOS — AI Agent Governance & Management Platform
**Version**: 5.3.0
**Date**: 2026-04-27 (updated for v2.1 → v2.3 hardening)
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
14. [GovernanceClient SDK v2](#14-governanceclient-sdk-v2)
15. [v2.1 → v2.3 Hardening (Production Readiness)](#15-v21--v23-hardening-production-readiness)
16. [Shared Types Package](#16-shared-types-package)
17. [Testing Strategy](#17-testing-strategy)
18. [Security & RBAC](#18-security--rbac)
19. [Configuration & Environment](#19-configuration--environment)
20. [Frontend Architecture (EPIC 8)](#20-frontend-architecture-epic-8)
21. [Constitution & Design Principles](#21-constitution--design-principles)
22. [Glossary](#22-glossary)

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
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌─────────┐       │
│  │ Auth │ │Agents│ │ Audit │ │Approval│ │ Policy │ │Analytics│       │
│  │Routes│ │Routes│ │Routes │ │ Routes │ │ Routes │ │ Routes  │       │
│  └──┬───┘ └──┬───┘ └───┬───┘ └───┬────┘ └────┬───┘ └────┬────┘       │
│     │        │         │         │           │          │            │
│  ┌──┴────────┴─────────┴─────────┴───────────┴──────────┴────────┐   │
│  │              Service Layer (class-based, injected)            │   │
│  │  AgentService, AuditService, ApprovalService, PolicyService,  │   │
│  │  PolicyEvaluator, AnalyticsService                            │   │
│  └──────────────────────┬────────────────────────────────────────┘   │
│                         │ (depends on interfaces only)               │
│  ┌──────────────────────┴────────────────────────────────────────┐   │
│  │            Repository Interfaces (abstractions)               │   │
│  │  IAgentRepo, IAuditRepo, IApprovalRepo, IPolicyRepo,          │   │
│  │  IAnalyticsRepo                                               │   │
│  └──────────────────────┬────────────────────────────────────────┘   │
│                         │ (implemented by)                           │
│  ┌──────────────────────┴────────────────────────────────────────┐   │
│  │            Prisma Repository Implementations                  │   │
│  │  PrismaAgentRepo, PrismaAuditRepo, PrismaApprovalRepo,        │   │
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

┌───────────────────────────────────┐     ┌───────────────────────────────────────┐
│  GovernanceClient SDK v2          │────▶│  Showcase Agents                      │
│  (packages/governance-sdk)        │     │  - Email Draft Agent (Anthropic)      │
│                                   │     │  - Research Agent (Anthropic)         │
│  Core: wrapLLMCall, wrapLLMStream │     │  - Local Email Agent (Ollama)         │
│  EventBuffer (batch flush)        │     │  - Multi-Provider Agent (any LLM)     │
│  SpanManager (trace tree)         │     │  - Mock Data Seeder                   │
│  PolicyGate (pre-check)           │     └───────────────────────────────────────┘
│  CostBudget (spend limits)        │
│  CircuitBreaker (resilience)      │     ┌───────────────────────────────────────┐
│  SSE Approvals (push + polling)   │     │  Framework Adapters (optional)        │
│                                   │     │  - Anthropic adapter                  │
│  Adapters:                        │     │  - OpenAI adapter                     │
│  anthropic, openai, langchain     │     │  - LangChain callback handler         │
└───────────────────────────────────┘     └───────────────────────────────────────┘
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
Agent Action → GovernanceClient.callTool(name, inputs, fn, { riskScore })
  → POST /api/v1/policies/check (pre-execution policy gate)
    → ALLOW     → execute fn(), log tool_call event via EventBuffer
    → DENY      → throw PolicyDeniedError (tool never executes)
    → REQUIRE   → requestApproval()
      → POST /api/v1/approvals → create ApprovalTicket
        → Slack notification (via BullMQ)
        → SSE broadcast to connected approvers
        → SDK tries SSE push (GET /api/v1/events/agent-stream)
        → Falls back to polling GET /api/v1/approvals/:id
      → APPROVED → execute fn(), log tool_call event
      → DENIED   → throw PolicyDeniedError
```

All audit events are buffered in-memory and flushed in batches to `POST /api/v1/audit/batch` (non-blocking). Events include `spanId` and `parentSpanId` for hierarchical trace trees.

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
| **AI SDK** | @anthropic-ai/sdk (optional), openai (optional) | ^0.39.0 / ^4.0.0 |
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
│           │   ├── emailDraftAgent.ts      # Anthropic adapter + policy-gated tools
│           │   ├── researchAgent.ts        # Nested spans + Anthropic adapter
│           │   ├── localEmailAgent.ts      # Ollama via generic wrapLLMCall
│           │   ├── multiProviderAgent.ts   # Multi-provider (Anthropic + any LLM)
│           │   └── mockAgent.ts            # Mock data generator
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
│   └── governance-sdk/              # Agent-side SDK (v2 — provider-agnostic)
│       └── src/
│           ├── GovernanceClient.ts  # Core: wrapLLMCall, wrapLLMStream, callTool, withSpan
│           ├── EventBuffer.ts       # Non-blocking batch event flushing
│           ├── SpanManager.ts       # Hierarchical trace span management
│           ├── CircuitBreaker.ts    # Platform resilience (retry + circuit-break)
│           ├── adapters/
│           │   ├── anthropic.ts     # Automatic governance for Anthropic SDK
│           │   ├── openai.ts        # Automatic governance for OpenAI SDK
│           │   └── langchain.ts     # LangChain callback handler for auto-logging
│           ├── GovernanceClient.test.ts
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
| budgetUsd | Float? | Rolling 30-day spend cap in USD; enforced server-side on audit ingest *(v2.2)* |
| apiKeyHash | String? | HMAC-SHA256 of the agent's API key (full key never stored) *(v2.1)* |
| apiKeyHint | String? | Last 4 characters of the API key, shown in the dashboard *(v2.1)* |

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
| spanId | String? | Unique span identifier *(v2)* |
| parentSpanId | String? | Parent span for hierarchical traces *(v2)* |
| event | String | `llm_call`, `tool_call`, `approval_requested`, `approval_resolved`, `action_blocked`, `action_taken`, `span_failed` *(v2.3)* |
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

**Indexes**: `agentId`, `traceId`, `createdAt`, `event`, `spanId` *(v2)*

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
| POST | `/api/v1/agents/:id/api-key` | Admin | (Re)generate an agent API key — returns full key once + last-4 hint *(v2.1)* |
| DELETE | `/api/v1/agents/:id` | Admin | Soft-delete (deprecate) agent |

### Audit (`/api/v1/audit`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/audit/log` | Agent or User | Ingest an audit event; **402 `BUDGET_EXCEEDED`** if agent's 30-day spend would exceed `budgetUsd` *(v2.2)* |
| POST | `/api/v1/audit/batch` | Agent or User | Ingest a batch; agents validated in **one** `findInfoByIds` query, budgets enforced per-agent *(v2.2)* |
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
| POST | `/api/v1/policies/check` | Agent or User | Lightweight policy check (SDK pre-execution gate); accepts agent API keys *(v2 + v2.1 auth fix)* |

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
| POST | `/api/v1/showcase/multi-provider/run` | Authenticated | Run multi-provider agent *(v2)* |
| POST | `/api/v1/showcase/mock/seed` | Admin | Seed mock agents, logs, and approvals |

### System — Unversioned

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Health check |
| POST | `/api/v1/events/token` | Bearer JWT | Get short-lived SSE token (30s expiry) |
| GET | `/api/v1/events/stream?token=<sseToken>` | SSE token | SSE stream for real-time events |
| GET | `/api/v1/events/agent-stream?token=<sseToken>&ticketId=<id>` | SSE token | Agent-scoped SSE for approval push notifications *(v2)* |
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

**Total: 35 endpoints + 7 redirect prefixes**

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

Demonstrates the full governance loop. **All showcase agents were rewritten for SDK v2.**

**Email Draft Agent** *(rewritten — uses Anthropic adapter + policy-gated tools)*:
1. `withSpan("email-draft")` wraps the entire workflow
2. `createAnthropicAdapter` wraps LLM call with automatic governance logging
3. `callTool("send_email", ..., { riskScore: 0.82 })` pre-checks policy, requests approval if needed
4. Budget and resilience configured

**Research Agent** *(rewritten — nested spans + Anthropic adapter)*:
1. Outer `withSpan("research-workflow")` + nested spans for each step
2. `createAnthropicAdapter` for all LLM calls
3. Policy-gated `callTool` for web searches and report saving
4. Full hierarchical trace tree in TraceDrawer

**Local Email Agent** *(new — Ollama via generic wrapLLMCall)*:
- Demonstrates SDK v2 with a local LLM (Ollama) using `wrapLLMCall`
- No vendor SDK required — just an HTTP fetch call wrapped in governance

**Multi-Provider Agent** *(new — Anthropic + any LLM in one trace)*:
- Uses both `createAnthropicAdapter` and raw `wrapLLMCall` in the same trace
- Shows how different providers coexist under a single governance context

**Mock Data Seeder**:
- Creates 3 mock agents (CRM/Analytics/Compliance)
- Generates 50 audit logs across 15 traces over 7 days
- Creates 5 approval tickets (2 approved, 1 denied, 2 pending)
- Idempotent — safe to run multiple times

**Key implementation files**: `emailDraftAgent.ts`, `researchAgent.ts`, `localEmailAgent.ts`, `multiProviderAgent.ts`, `mockAgent.ts`, `showcase.routes.ts`

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
├── NotFoundError              404  NOT_FOUND
├── ValidationError            400  VALIDATION_ERROR
├── AuthenticationError        401  TOKEN_EXPIRED | TOKEN_INVALID | TOKEN_MISSING
├── InvalidCredentialsError    401  INVALID_CREDENTIALS    (v2.2 — login enumeration fix)
├── AuthorizationError         403  FORBIDDEN
├── ConflictError              409  CONFLICT
├── InvalidTransitionError     400  INVALID_TRANSITION
├── PolicyBlockedError         403  POLICY_BLOCKED
├── BudgetExceededError        402  BUDGET_EXCEEDED        (v2.2 — server-side budgets)
└── ExternalServiceError       503  EXTERNAL_SERVICE_ERROR
```

Each error carries: `code` (machine-readable), `message` (human-readable), `statusCode` (HTTP), and optional `details` (structured metadata).

**`InvalidCredentialsError`** is intentionally distinct from `AuthenticationError`. The login route uses it for **both** "user not found" and "wrong password" so the response is identical — preventing user enumeration. `AuthenticationError`'s reason codes (`TOKEN_*`) are only meaningful after a token has been issued, and reusing them on `/login` was misleading operators reading audit logs.

**`BudgetExceededError`** uses HTTP **402 (Payment Required)** to tell the SDK this is a hard cap, not a transient outage — retrying will not help. Its `details` carry `{ agentId, currentUsd, budgetUsd, windowDays }`.

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

## 14. GovernanceClient SDK v2

The SDK (`packages/governance-sdk`) is the interface between AI agents and the AgentOS platform. **v2 is a breaking rewrite** that removes Anthropic vendor lock-in and introduces non-blocking logging, hierarchical traces, pre-execution policy gating, cost budgets, resilience patterns, and streaming support. v2.1 → v2.3 then hardened it for production — see [Section 15](#15-v21--v23-hardening-production-readiness) for the deltas.

### 14.1 Design Goals (v2)

| Goal | Solution |
|------|----------|
| Provider-agnostic | `wrapLLMCall` / `wrapLLMStream` accept any async function |
| Non-blocking logging | `EventBuffer` queues events and batch-flushes to `/api/v1/audit/batch`; requeues on failure with backoff *(v2.1)* |
| Crash-safe shutdown | `beforeExit` / `SIGINT` / `SIGTERM` auto-flush via `autoShutdown` *(v2.1)* |
| Hierarchical traces | `SpanManager` assigns `spanId` / `parentSpanId` via `withSpan()`; failed spans tagged *(v2.3)* |
| Per-trace isolation on shared clients | `withTrace(fn, traceId?)` via `AsyncLocalStorage` *(v2.1)* |
| Pre-execution policy gating | `callTool` calls `POST /api/v1/policies/check` before executing (accepts agent API keys *(v2.1)*) |
| Push-based approvals | SSE via `/api/v1/events/agent-stream` with `sseConnectTimeoutMs` polling fallback *(v2.3)* |
| Typed error UX | `isPolicyDeniedError` / `isApprovalRequestError` type-guards; public `ticketId` / `kind` fields *(v2.1 + v2.2)* |
| Cost budgets | Client-side `BudgetConfig` + server-side rolling 30-day cap returning HTTP 402 *(v2.2)* |
| Resilience | Per-route `CircuitBreakerRegistry` + full-jitter exponential backoff *(v2.3)* |
| Streaming | `wrapLLMStream` collects chunks, logs on stream completion (Anthropic + OpenAI adapters expose it directly) |
| Observability | `getMetrics()` returns cost / buffer / breaker / trace snapshot *(v2.3)* |
| Framework adapters | Optional Anthropic (incl. stream), OpenAI (incl. stream + embeddings), LangChain (per-runId isolated) |

### 14.2 Configuration

```typescript
interface GovernanceClientConfig {
  platformUrl: string;                 // e.g. "http://localhost:3000"
  agentId: string;                     // Registered agent UUID
  apiKey: string;                      // Agent API key (HMAC-hashed server-side)
  budget?: BudgetConfig;               // Cost budget limits
  resilience?: ResilienceConfig;       // Retry / breaker / fail-open behaviour
  bufferMaxSize?: number;              // Batch size before forced flush (default 20)
  bufferFlushIntervalMs?: number;      // Periodic flush interval (default 5_000)
  bufferMaxQueueSize?: number;         // Hard queue cap; oldest dropped on overflow
  bufferMaxFlushAttempts?: number;     // Retries per batch before drop (default 5) — v2.1
  autoShutdown?: boolean;              // Wire beforeExit / SIGINT / SIGTERM (default true) — v2.1
  sseConnectTimeoutMs?: number;        // SSE → polling fallback timeout (default 2_500) — v2.3
}

interface BudgetConfig {
  maxCostUsd: number;
  warnAtUsd?: number;
  onBudgetExceeded?: 'throw' | 'warn' | 'log';
}

interface ResilienceConfig {
  onPlatformUnavailable?: 'fail-open' | 'fail-closed';
  retryAttempts?: number;              // Total attempts incl. first call (default 1)
  retryDelayMs?: number;               // Base delay; actual = full-jitter(min(retryMaxMs, base * 2^n)) — v2.3
  retryMaxMs?: number;                 // Cap on per-retry backoff window (default 30_000) — v2.3
  circuitBreakerThreshold?: number;    // Failures before per-route breaker opens (default 5)
  circuitBreakerCooldownMs?: number;   // Open → half-open cooldown (default 30_000)
}
```

### 14.3 Public API

| Method | Purpose |
|--------|---------|
| `constructor(config)` | Creates client; generates default `traceId`; wires `EventBuffer`, `SpanManager`, `CircuitBreakerRegistry`; installs exit handlers if `autoShutdown` (default `true`) |
| `traceId: string` | Active traceId (per-trace inside `withTrace`, otherwise the long-lived default) |
| `newTraceId(): string` | Mint a fresh UUID without entering it — for cross-boundary correlation *(v2.1)* |
| `withTrace(fn, traceId?)` | Run `fn` inside an isolated trace context using `AsyncLocalStorage` *(v2.1)* |
| `wrapLLMCall<T>(fn, metadata)` | Wraps **any** async LLM call; auto-logs `llm_call` with provider, model, tokens, cost, latency, success |
| `wrapLLMStream<TChunk>(fn, onComplete)` | Wraps **any** streaming LLM call; yields chunks to the caller, logs once after stream completes (or errors) |
| `callTool(name, inputs, fn, options?)` | Pre-execution policy check → approval if needed → execute → log `tool_call` (or `action_blocked` on `ApprovalRequestError`) |
| `checkPolicy(actionType, riskScore?)` | `POST /api/v1/policies/check` — returns `{ effect }`, fails open or closed per `ResilienceConfig` |
| `requestApproval(params)` | Creates ticket; tries SSE push (with `sseConnectTimeoutMs` cap), falls back to polling. Throws `PolicyDeniedError` on deny / expiry, `ApprovalRequestError` on transport failures |
| `withSpan<T>(name, fn)` | Named span scope. On rejection emits a `span_failed` audit event before re-throwing *(v2.3)* |
| `startSpan(name) / endSpan()` | Manual span control (prefer `withSpan`) |
| `logEvent(payload)` | Non-blocking ad-hoc audit event — `agentId`, `traceId`, `spanId`, `parentSpanId` stamped from ambient context |
| `currentCost: number` | Cumulative spend tracked client-side |
| `getMetrics()` | O(1) snapshot: `{ cost, buffer, breakers, traceId }` — for `/healthz` / Prometheus *(v2.3)* |
| `shutdown()` | Best-effort flush + uninstall exit handlers. Idempotent |

### 14.4 Key Modules

#### EventBuffer (`EventBuffer.ts`) — *hardened in v2.1*

Non-blocking event queue that batches audit events and flushes them asynchronously to `POST /api/v1/audit/batch`.

- Events are appended to an in-memory array (batch trigger: `bufferMaxSize`, default 20)
- Periodic flush timer fires every `bufferFlushIntervalMs` (default 5_000)
- Hard cap of `bufferMaxQueueSize` (default `50 × bufferMaxSize`); oldest dropped on overflow with a counter incremented (visible via `getMetrics().buffer.dropped`)
- **v2.1: requeue on flush failure.** Failed batches are pushed back onto the queue and retried up to `bufferMaxFlushAttempts` times (default 5) with exponential backoff. Only after exhausting retries are events permanently dropped.
- **v2.1: auto-flush on shutdown.** When `autoShutdown` is `true` (the default in Node), `beforeExit` / `SIGINT` / `SIGTERM` trigger a best-effort drain. Tests and short-lived scripts should still `await gov.shutdown()` to be safe.
- Completely non-blocking on the hot path: `wrapLLMCall`, `callTool`, `withSpan`, etc. return as soon as the event is queued.

#### SpanManager (`SpanManager.ts`)

Manages hierarchical trace spans for complex agent workflows.

- `withSpan(name, fn)` creates a new span with a unique `spanId`
- Nested `withSpan` calls automatically set `parentSpanId` to the enclosing span's ID
- All events logged within a span context inherit `spanId` and `parentSpanId`
- **v2.1: `runInIsolatedStack`** is invoked from `withTrace` so concurrent traces don't share a span stack on a long-lived client
- **v2.3: failed-span tagging.** When `withSpan`'s `fn` rejects, an extra `span_failed` audit event is emitted carrying `{ event: 'span_failed', latencyMs, success: false, errorMsg, metadata: { spanName } }` before the original error is re-thrown — so the dashboard can render a "Failed (3.2s)" badge without scanning every child event.

Example trace tree:
```
root-span (email-draft-workflow)
├── llm-call-span (draft-email)
├── tool-call-span (send_email)
│   └── approval-span (approval_requested)
└── llm-call-span (summarize)
```

#### CircuitBreakerRegistry (`CircuitBreaker.ts`) — *redesigned in v2.3*

Protects agents from platform outages with **per-route** resilience behaviour.

```
CircuitBreakerRegistry
  └─ key derived by routeKeyFromUrl(url) → e.g. "api.x|audit", "api.x|policies"
       └─ CircuitBreaker (CLOSED → OPEN → HALF-OPEN)
```

| State | Behaviour |
|-------|-----------|
| CLOSED (healthy) | Requests pass through normally |
| OPEN (tripped) | Requests are short-circuited; behaviour depends on `onPlatformUnavailable` |
| HALF-OPEN | After cooldown, one request is let through to test recovery |

- **Per-route isolation.** A failing `/audit/batch` no longer trips the breaker on `/policies/check` — each (host, first-path-segment) gets its own breaker. `routeKeyFromUrl` is exported from `@agentos/governance-sdk` for tests and tooling.
- **Retries.** Up to `retryAttempts` total attempts (default 1, no retry).
- **Backoff.** Full-jitter exponential backoff: actual sleep = `random(0, min(retryMaxMs, retryDelayMs × 2^attempt))`. Decorrelates retry storms across many client instances.
- **5xx counts as failure.** A 5xx response is treated as a breaker failure even though the HTTP transport succeeded — the platform is still degraded.
- `fail-open`: agent continues executing without governance (logs a warning).
- `fail-closed`: agent operations throw `Error('Platform unavailable')` until platform recovers.
- `getMetrics().breakers` returns the live state of every breaker (failures, openedAt, isOpen).

### 14.5 Pre-Execution Policy Gating

Unlike v1 (where policies were only checked at approval time), v2 checks policies **before** a tool executes:

```
callTool("send_email", inputs, sendFn, { riskScore: 0.8 })
  1. POST /api/v1/policies/check { agentId, actionType: "send_email" }
  2. Response: { effect: "DENY" }       → throw PolicyDeniedError (tool never runs)
     Response: { effect: "ALLOW" }      → execute sendFn(), log result
     Response: { effect: "REQUIRE..." } → requestApproval() → wait → execute or throw
```

This prevents wasted LLM calls and side effects from actions that would be denied anyway.

### 14.6 Approval Flow (v2)

`requestApproval` attempts SSE push-based notifications before falling back to polling:

1. `POST /api/v1/approvals` creates the ticket. Failures here throw a typed `ApprovalRequestError` with `kind` ∈ `{NETWORK, AUTH, FORBIDDEN, NOT_FOUND, RATE_LIMITED, SERVER, INVALID_RESPONSE, UNKNOWN}` *(v2.2)*.
2. SDK fetches a short-lived `sseToken` and opens `GET /api/v1/events/agent-stream?token=<sseToken>&ticketId=<id>`.
3. Server pushes `approval.resolved` for **the ticket's owning agent only** (the SSE plugin honours per-client filters added in v2.1, so the agent stream is scoped, not a firehose).
4. If SSE doesn't connect within `sseConnectTimeoutMs` (default 2.5s — *configurable in v2.3*), falls back to polling `GET /api/v1/approvals/:id` every `pollIntervalMs` (default 3s).
5. Timeout after `maxWaitMs` (default 30 min). On timeout/expiry/deny, throws `PolicyDeniedError` with the corresponding `kind` (`APPROVAL_TIMEOUT`, `APPROVAL_EXPIRED`, `APPROVAL_DENIED`) and the public `ticketId` field *(v2.1 — replaces the old "regex the error message" UX)*.

### 14.7 Cost Budget Enforcement

Two layers, both active by default:

**Client-side (per process)**
- Each `wrapLLMCall` / `wrapLLMStream`'s `costUsd` is added to a running total (`gov.currentCost`).
- At `warnAtUsd` → a console warning is emitted.
- At `maxCostUsd` → behaviour depends on `onBudgetExceeded`:
  - `'throw'` → throws `BudgetExceededError` (default)
  - `'warn'` → logs warning, continues executing
  - `'log'` → silent log, continues executing

**Server-side (rolling 30-day, *added in v2.2*)**
- Each agent has an optional `agents.budgetUsd`.
- The audit ingest path (`/api/v1/audit/log`, `/api/v1/audit/batch`) computes prior 30-day spend in a single batched query (`IAuditRepository.getSpendByAgentsSince`) and rejects with HTTP **402 `BUDGET_EXCEEDED`** the moment a write would cross the cap.
- On rejection, the API broadcasts an `agent.budget_exceeded` SSE event so dashboards can react.
- The SDK silently drops the rejected batch (the action already happened — only the audit receipt is being refused) and surfaces 5xx-style failures normally for retry/logging.

### 14.8 Custom Error Classes

| Error Class | When Thrown |
|-------------|------------|
| `PolicyDeniedError` | Policy returned DENY, or an approval was denied / expired / timed out. Public fields: `actionType`, `reason`, `ticketId?`, `kind` ∈ `{POLICY, APPROVAL_DENIED, APPROVAL_EXPIRED, APPROVAL_TIMEOUT, UNKNOWN}` *(v2.1)* |
| `ApprovalRequestError` | The approval **request itself** failed (transport / auth / 4xx / 5xx / malformed body) — distinct from a real human "deny". Public fields: `kind`, `httpStatus`, `body`, `message` *(v2.2)* |
| `BudgetExceededError` | Client-side cumulative spend exceeds `budget.maxCostUsd` with `onBudgetExceeded: 'throw'` |

All three are exported from `@agentos/governance-sdk`. Companion **type guards** `isPolicyDeniedError(err)` and `isApprovalRequestError(err)` work across module reloads / bundlers — application code should always use them rather than `instanceof` or `err.name === '...'`.

### 14.9 Framework Adapters

Optional adapters provide zero-config governance integration with popular LLM SDKs. Imported as subpaths so unused adapters never enter the bundle.

#### Anthropic Adapter

```typescript
import { createAnthropicAdapter } from '@agentos/governance-sdk/adapters/anthropic';

const governed = createAnthropicAdapter(gov, anthropic);

// Non-streaming
const msg = await governed.createMessage({ model: 'claude-sonnet-4-5', ... });

// Streaming (v2.3)
for await (const event of governed.streamMessage({ model: 'claude-sonnet-4-5', ... })) {
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    process.stdout.write(event.delta.text ?? '');
  }
}
```

Both methods route through `wrapLLMCall` / `wrapLLMStream`, so token/cost/latency capture is identical. The Research Agent showcase exercises `streamMessage` end-to-end.

#### OpenAI Adapter — *expanded in v2.3*

```typescript
import { createOpenAIAdapter } from '@agentos/governance-sdk/adapters/openai';

const governed = createOpenAIAdapter(gov, openai);

// Non-streaming chat
const chat = await governed.createChatCompletion({ model: 'gpt-4o', messages });

// Streaming chat
for await (const chunk of governed.streamChatCompletion({ model: 'gpt-4o', messages, stream: true })) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}

// Embeddings
const emb = await governed.createEmbedding({ model: 'text-embedding-3-small', input: 'hello' });
```

#### LangChain Adapter — *fixed in v2.1*

```typescript
import { createLangChainCallback } from '@agentos/governance-sdk/adapters/langchain';

const callback = createLangChainCallback(gov);
const chain = new ChatOpenAI({ callbacks: [callback] });
```

Internally, the callback now keys per-run state by LangChain's `runId` (`Map<runId, LLMRunState>` and `Map<runId, ToolRunState>`) so that **concurrent** LLM and tool invocations on the same chain are tracked correctly. The previous version used a single mutable handle and lost data when two runs overlapped.

### 14.10 SDK v1 → v2 Migration Summary

| v1 | v2 | Change Type |
|----|----| ------------|
| `createMessage(anthropicParams)` | `wrapLLMCall(fn, metadata)` (or `createAnthropicAdapter(...)`) | **Breaking** — provider-agnostic |
| `callTool(name, inputs, fn)` | `callTool(name, inputs, fn, options?)` | **Breaking** — adds policy gate + typed errors |
| `logEvent(payload)` | Still present, plus automatic buffering by helpers | Behaviour-preserving |
| `requestApproval(params)` (polling only) | `requestApproval(params)` (SSE + polling, typed errors) | Enhanced |
| — | `wrapLLMStream(fn, onComplete)` | **New** |
| — | `withSpan(name, fn)` / `withTrace(fn, traceId?)` | **New** |
| — | `checkPolicy(actionType, riskScore?)` | **New** |
| — | `getMetrics()` / `shutdown()` | **New** |
| `@anthropic-ai/sdk` required | All AI SDKs optional (`peerDependencies`) | **Breaking** — install what you use |
| `eventsource` direct import | Lazy + `peerDependenciesMeta.optional: true` | **Behaviour change** — uses global `EventSource` if present, polls otherwise |
| `err.message.includes('denied')` | `isPolicyDeniedError(err)` + `isApprovalRequestError(err)` | **Recommended** — type-guards over string matching |

---

## 15. v2.1 → v2.3 Hardening (Production Readiness)

After SDK v2 shipped, three rounds of hardening turned AgentOS from a proof-of-concept into something operable. The work was driven by a 24-item self-audit; the items below are the ones that made it in. Each subsection states **what broke**, **what was changed**, and **where**.

### 15.1 v2.1 — Production Blockers

#### #5 + #6 EventBuffer requeue + auto-flush

| | |
|---|---|
| **What broke** | Failed `/audit/batch` flushes silently dropped events. CLI agents and serverless invocations also lost events on exit because `flush()` was never called. |
| **What changed** | `EventBuffer` now requeues survivors of a failed batch and retries with exponential backoff up to `bufferMaxFlushAttempts` (default 5) before dropping. `GovernanceClient` installs `beforeExit`, `SIGINT`, `SIGTERM` handlers when `autoShutdown !== false`, each draining the buffer before the process dies. |
| **Where** | `packages/governance-sdk/src/EventBuffer.ts`, `GovernanceClient.ts` (`installExitHandlers`, `shutdown`) |

#### #7 PolicyDeniedError as a typed object

| | |
|---|---|
| **What broke** | Callers had to regex the error message to extract a `ticketId` ("regex the message UX"). |
| **What changed** | `PolicyDeniedError` exposes public fields: `actionType`, `reason`, `ticketId?`, and `kind` (`POLICY` / `APPROVAL_DENIED` / `APPROVAL_EXPIRED` / `APPROVAL_TIMEOUT` / `UNKNOWN`). Companion `isPolicyDeniedError(err)` works across module boundaries. |
| **Where** | `GovernanceClient.ts` (error class), `index.ts` (export) |

#### #10 Agent API keys on `/policies/check`

| | |
|---|---|
| **What broke** | The pre-execution policy gate only accepted user JWTs; agent API keys returned 401, so the gate was effectively unusable in production. |
| **What changed** | The route now uses `authenticateAgentOrUser(fastify)` like `/audit/log`. Agent calls succeed under their HMAC-hashed key. |
| **Where** | `apps/api/src/modules/policies/policies.routes.ts` |

#### #12 Per-trace IDs

| | |
|---|---|
| **What broke** | A long-lived `GovernanceClient` (e.g. created at HTTP server start) pinned every request to one `traceId`, so the audit log conflated unrelated runs. |
| **What changed** | Added `withTrace(fn, traceId?)` backed by `AsyncLocalStorage`. `traceId` getter returns the active per-trace value if set, otherwise the long-lived default. Spans inside `withTrace` use a fresh isolated stack via `SpanManager.runInIsolatedStack`. `newTraceId()` mints UUIDs without entering them. |
| **Where** | `GovernanceClient.ts`, `SpanManager.ts` |

#### Agent API key rotation in the dashboard

- `AgentDetail` DTO now carries `apiKeyHint` (last 4 chars) and `hasApiKey: boolean`.
- New endpoint `POST /api/v1/agents/:id/api-key` (admin-only) generates a fresh key, returns it **once**, persists only the HMAC hash and the hint.
- Frontend adds an admin-only "Rotate API key" button + modal that shows the full key once and copies it to the clipboard.

### 15.2 v2.2 — Real-Money Safeguards

#### #9 Server-side budget enforcement

| | |
|---|---|
| **What broke** | Cost caps lived only in the SDK. A misbehaving agent (or one that just disabled the SDK's budget) could keep racking up spend. |
| **What changed** | Added optional `agents.budgetUsd` (rolling 30-day cap). The audit ingest path now batches a `getSpendByAgentsSince(agentIds, since)` query and rejects with HTTP **402 `BUDGET_EXCEEDED`** if any contribution would cross the cap. The error class lives at `apps/api/src/errors/AppError.ts` and carries `{ agentId, currentUsd, budgetUsd, windowDays }`. The API broadcasts an `agent.budget_exceeded` SSE event so dashboards react in real time. SDK silently drops the rejected batch. |
| **Where** | `apps/api/src/modules/audit/audit.routes.ts` (`enforceBudgets`), `IAuditRepository.getSpendByAgentsSince`, `Prisma`/`Mock` audit repos, `errors/AppError.ts`, `packages/governance-sdk/src/GovernanceClient.ts` (`flushEvents` 402 handling) |

#### #14 Batch-validate agents (kill N+1)

| | |
|---|---|
| **What broke** | `/audit/batch` walked the agent list and issued a `findById` per agent, plus another query for status/budget — N+1+1 per ingest. |
| **What changed** | Added `IAgentRepository.findInfoByIds(ids)` returning `AgentBatchInfo[]` (id, status, budgetUsd) in a single query. Audit routes call it once per ingest regardless of batch size. |
| **Where** | `IAgentRepository.ts`, `Prisma`/`Mock` agent repos, `audit.routes.ts`, `audit.service.unit.test.ts` |

#### #8 Typed errors from `requestApproval`

| | |
|---|---|
| **What broke** | A network blip or 429 from the approvals endpoint surfaced to agent code as `Error('Failed to create approval')`. There was no way to distinguish a real human "deny" from a transient platform issue. |
| **What changed** | Introduced `ApprovalRequestError` with `kind` ∈ `{NETWORK, AUTH, FORBIDDEN, NOT_FOUND, RATE_LIMITED, SERVER, INVALID_RESPONSE, UNKNOWN}`, `httpStatus`, and `body`. Companion `isApprovalRequestError(err)`. Surfaced through `callTool` and logged as `action_blocked`. |
| **Where** | `GovernanceClient.ts` (`requestApproval`, `safeJson`), `index.ts` |

#### Test-suite alignment + InvalidCredentialsError

A 31-test cleanup driven by user feedback "are you adjusting tests for green or analysing scenarios against features?":

- **Real bug 1** — `AuditQuerySchema.success` used `z.coerce.boolean()`, which parses `'false'` as `true`. Replaced with a strict `queryBool` transform.
- **Real bug 2** — `/login` re-used `AuthenticationError('TOKEN_INVALID')` for "wrong password", which leaked to logs and could be used for user enumeration. Introduced `InvalidCredentialsError` (`401 INVALID_CREDENTIALS`) returned identically for "user not found" and "bad password".
- **Stale assertions (22 tests)** — updated to the structured error envelope `{ error: <CODE>, message, details?, requestId }`.
- **Status-code semantics (8 tests)** — tightened: `404 NOT_FOUND` for missing resources, `409 CONFLICT` for state conflicts (previously both returned `400`).

### 15.3 v2.3 — Observability + Resilience Polish

#### #23 Failed-span tagging

`withSpan(name, fn)` now emits a `span_failed` audit event on rejection — `{ event: 'span_failed', latencyMs, success: false, errorMsg, metadata: { spanName } }` — before re-throwing the original error. The TraceDrawer renders a "Failed (latency)" badge directly on the span, with the underlying error message visible inline.

The `metadata` shape was used (rather than promoting `spanName` to a top-level column) to avoid a database migration; the dashboard reads `metadata.spanName`.

#### #16 `isPolicyDeniedError` adopted in showcase agents

All four showcase agents now catch denials with the type guard:

```typescript
} catch (err) {
  if (isPolicyDeniedError(err)) {
    return { status: 'BLOCKED', ticketId: err.ticketId };
  }
  throw err;
}
```

This removes the brittle `err.name === 'PolicyDeniedError'` pattern from the canonical examples developers copy from.

#### #13 Per-host circuit breaker + jittered backoff

Replaced the single `CircuitBreaker` instance with `CircuitBreakerRegistry` keyed by `routeKeyFromUrl(url)` (`host|first-path-segment`). `fetchWithResilience` now:

1. Looks up the breaker for the route. If open and `fail-closed`, throws immediately.
2. Otherwise issues the request through the breaker.
3. **Treats 5xx as a breaker failure** even though the HTTP transport succeeded — the platform is degraded.
4. On retry, sleeps `random(0, min(retryMaxMs, retryDelayMs × 2^attempt))` (full-jitter exponential backoff). Without jitter, many clients all retrying together would hammer the platform in lockstep when it recovers.

#### #21 `gov.getMetrics()`

```typescript
gov.getMetrics();
// {
//   cost: { cumulativeUsd: 1.23, budgetUsd: 5 },
//   buffer: { pending: 4, dropped: 0 },
//   breakers: { 'localhost:3000|audit': { failures: 0, openedAt: null, isOpen: false } },
//   traceId: '...'
// }
```

Returns synchronously, no I/O, never throws — safe to wire to a `/healthz` handler or a Prometheus exporter.

#### #15 Configurable `sseConnectTimeoutMs`

The previous 10s default kept agents blocked for 10 seconds on every approval when an upstream proxy silently dropped the SSE connection. New default `2_500` ms — tight enough to ride the happy path, fast enough to fall back to polling when SSE is broken. Configurable via `GovernanceClientConfig.sseConnectTimeoutMs`.

#### #18 Lazy `eventsource` polyfill

`eventsource` moved from a hard dependency to `peerDependenciesMeta.optional: true`. `getEventSourceCtor()` resolves at call-time:

1. Use the global `EventSource` if defined (Node 22+, browsers).
2. Otherwise dynamically `import('eventsource')`.
3. If neither is available, log a one-time warning and fall back to HTTP polling — no exceptions, no broken installs.

#### #20 Broader adapters

- **Anthropic** — added `streamMessage(params): AsyncIterable<AnthropicStreamEvent>` wrapping `anthropic.messages.stream(...)` via `wrapLLMStream`. `aggregateAnthropicStreamUsage(chunks)` sums `input_tokens` / `output_tokens` from `message_start` / `message_delta` events.
- **OpenAI** — added `streamChatCompletion(params)` and `createEmbedding(params)`. The streaming method casts `openai.chat.completions.create({ ..., stream: true })` to `AsyncIterable<OpenAIChatChunk>` because the OpenAI SDK's overloads return a non-iterable type when `stream: true` is set dynamically; wrapping it in `wrapLLMStream` then collects usage from the final chunk.

#### #19 JSDoc on every public SDK method

`logEvent`, `wrapLLMCall`, `wrapLLMStream`, `callTool`, `checkPolicy`, `requestApproval`, `startSpan` / `endSpan` / `withSpan`, `withTrace`, `currentCost`, `getMetrics`, `shutdown` — all carry JSDoc with **when** to reach for them, not just type signatures. Surfaces in IDE hover docs.

#### #17 Test coverage for the new code paths

50 SDK tests (up from 34) covering: `EventBuffer` requeue + flush retries, `withSpan` failure tagging, `CircuitBreaker` + `routeKeyFromUrl` per-route isolation + 5xx handling, `getMetrics()` shape, OpenAI streaming aggregator + `streamChatCompletion` end-to-end + `createEmbedding`, LangChain `handleLLMEnd` + per-runId isolation + tool failure path. Plus matching API-side tests for `findInfoByIds`, `getSpendByAgentsSince`, the 402 budget path, and the new error envelope.

#### #22 README migration note

A single paragraph at the top of the SDK section in README plus the dedicated v2.3 entries explaining why `createMessage` is gone, what to use instead, and how to migrate from `err.message.includes(...)` to `isPolicyDeniedError(err)`.

#### Showcase streaming demo

`researchAgent.synthesize_report` was rewritten to use `llm.streamMessage(...)` inside its `withSpan` callback. The agent now prints incremental `text_delta` chunks to `stdout` while the SDK accumulates the full report and records final token usage via `wrapLLMStream`'s `onComplete`. This means the streaming code path is exercised end-to-end every time someone runs the demo, not only by unit tests.

---

## 16. Shared Types Package

`packages/types` contains all Zod schemas and inferred TypeScript types, organized by domain. No type definitions are duplicated in `apps/`.

### Exported Schemas by Domain

| Domain | Schemas |
|--------|---------|
| **Auth** | `RoleEnum`, `LoginSchema`, `UserSchema`, `AuthUserSchema`, `AuthResponseSchema`, `ErrorResponseSchema` |
| **Agent** | `RiskTierSchema`, `EnvironmentSchema`, `AgentStatusSchema`, `AgentToolSchema`, `CreateAgentSchema`, `UpdateAgentSchema`, `UpdateAgentStatusSchema`, `AgentListQuerySchema`, `AgentIdParamsSchema`, `AgentSummarySchema`, `AgentStatsSchema`, `AgentDetailSchema` |
| **Audit** | `AuditEventTypeSchema`, `AuditEventSchema`, `AuditQuerySchema`, `AuditLogSchema`, `AuditBatchSchema` *(v2)*, `TraceIdParamsSchema`, `TopToolSchema`, `AgentStatsResponseSchema` |
| **Approval** | `ApprovalStatusSchema`, `CreateApprovalSchema`, `ApprovalDecisionSchema`, `ApprovalTicketSchema`, `ApprovalQuerySchema`, `ApprovalIdParamsSchema` |
| **Policy** | `PolicyEffectSchema`, `PolicyRuleInputSchema`, `CreatePolicySchema`, `UpdatePolicySchema`, `PolicyIdParamsSchema`, `PolicyListQuerySchema`, `PolicyAssignSchema`, `PolicyUnassignParamsSchema`, `PolicyEvaluationRequestSchema`, `PolicyEvaluationResultSchema`, `PolicyCheckRequestSchema` *(v2)* |
| **Analytics** | `DateRangeQuerySchema`, `CostTimelineQuerySchema`, `AgentLeaderboardQuerySchema`, `CostSummarySchema`, `CostTimelineSeriesSchema`, `CostTimelineSchema`, `UsageStatsSchema`, `AgentLeaderboardEntrySchema`, `AgentLeaderboardSchema`, `ModelUsageEntrySchema`, `ModelUsageSchema` |

Each schema has a corresponding exported TypeScript type (e.g., `CreateAgentInput = z.infer<typeof CreateAgentSchema>`).

---

## 17. Testing Strategy

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
| `GovernanceClient.test.ts` | Unit | 43 | SDK v2 + v2.1 + v2.2 + v2.3: EventBuffer requeue + auto-shutdown, wrapLLMCall, wrapLLMStream, callTool + policy gate, spans + `span_failed` tagging, withTrace per-trace isolation, typed errors (`PolicyDeniedError.ticketId/kind`, `ApprovalRequestError.kind`), `flushEvents` 402 drop, per-route `CircuitBreakerRegistry` + `routeKeyFromUrl`, full-jitter backoff, `getMetrics()` shape, budget enforcement, fail-open/closed |
| `adapters/openai.test.ts` | Unit | 3 | OpenAI adapter: `aggregateOpenAIStreamUsage`, `streamChatCompletion` end-to-end, `createEmbedding` *(v2.3)* |
| `adapters/langchain.test.ts` | Unit | 4 | LangChain adapter: `handleLLMEnd` logging, per-`runId` isolation, tool success + failure paths *(v2.1 fix)* |
| `agents.service.unit.test.ts` | Unit (mock) | 15 | AgentService: status transitions, CRUD, pagination, stats, API key rotation *(v2.1)* |
| `audit.service.unit.test.ts` | Unit (mock) | 10 | AuditService + new `findInfoByIds` (#14) and `getSpendByAgentsSince` (#9) — batch validation + rolling 30-day spend |
| `approvals.service.unit.test.ts` | Unit (mock) | 10 | ApprovalService: create, resolve, expire, list |
| `policies.service.unit.test.ts` | Unit (mock) | 11 | PolicyService: CRUD, assign, duplicate guard, delete guard |
| `policies.evaluator.unit.test.ts` | Unit (mock) | 11 | PolicyEvaluator: DENY wins, REQUIRE default, wildcards, conditions |
| `AppError.test.ts` | Unit | 20 | Error class hierarchy: statusCode, code, message, name, details *(FIX-02)* |
| `errorHandler.test.ts` | Unit | 8 | Global handler: AppError, Zod, JWT, unknown errors, requestId *(FIX-02)* |
| `security.test.ts` | Unit | 10 | Security headers + request ID presence/passthrough/truncation *(FIX-03)* |
| `sse-token.test.ts` | Unit | 7 | SSE token endpoint + stream auth with valid/invalid/expired tokens *(FIX-03)* |
| `PrismaAgentRepository.test.ts` | Unit | 3 | N+1 fix: groupBy called once, empty list skip, default to 0 *(FIX-04)* |
| `api-versioning.test.ts` | Unit | 15 | 301 redirects, path/query preservation, unversioned endpoints *(FIX-05)* |

**Total: 24 test files (21 API + 3 SDK), ~328 test cases (278 API + 50 SDK)**

### Test Categories

- **Integration tests** (7 files): Use Supertest against the full Fastify app with a real test database. Updated in v2.2 to assert the structured error envelope `{ error, message, details?, requestId }` and tightened status codes (`404` for missing resources, `409` for state conflicts).
- **Service tests** (2 files): Test business logic with Prisma repository implementations against a real database but no HTTP layer.
- **Unit tests — mock repos** (FIX-01): Pure business logic tests using in-memory mock repositories. No database, no network. Now also covers `findInfoByIds` and `getSpendByAgentsSince`.
- **Unit tests — infrastructure** (FIX-02/03/05): Error hierarchy, global handler, security headers, SSE token auth, redirect tests.
- **Unit tests — repository** (FIX-04): Repository-level N+1 fix verification.
- **Unit tests — SDK** (3 files, 50 cases): All SDK code paths — EventBuffer requeue + auto-shutdown, policy gate + typed errors, spans + failed-span tagging, per-trace IDs, per-route circuit breaker + jitter, getMetrics, OpenAI/Anthropic streaming, LangChain per-runId isolation. Run in ~3.5s.

### Test Isolation

- Each integration test file creates its own Fastify instance via `buildApp()`
- Database state is cleaned in `beforeAll`/`afterAll`/`afterEach` hooks
- Tests use unique identifiers to avoid cross-test interference

---

## 18. Security & RBAC

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

## 19. Configuration & Environment

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

## 20. Frontend Architecture (EPIC 8)

### 20.1 Tech Stack & Build

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

### 20.2 Project Structure

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
│   ├── audit/            AuditFilterBar, AuditTable, TraceDrawer (hierarchical tree view)
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

### 20.3 Data Flow Architecture

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

### 20.4 State Management

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

### 20.5 Authentication Flow

1. User submits email/password on `LoginPage`
2. `useAuthStore.login()` calls `POST /api/auth/login` → receives JWT
3. Stores `{ user, token }` in Zustand (persisted to localStorage)
4. Axios request interceptor reads token from store, attaches `Authorization: Bearer <token>`
5. On any 401 response: interceptor calls `logout()`, redirects to `/login`
6. `ProtectedRoute` component checks `isAuthenticated`, redirects unauthenticated users

### 20.6 SSE (Server-Sent Events) Integration

The `useSSE` hook provides live updates across the dashboard:

| Event Type | Query Invalidation | UI Effect |
|------------|-------------------|-----------|
| `approval.*` | `['approvals']` | New card in approval queue, remove resolved |
| `agent.*` | `['agents']` | Status updates in agent table |
| `audit.*` | `['audit']` | New entries in audit explorer |

**Reconnection Strategy**: Exponential backoff starting at 2s, doubling each attempt, capped at 30s. Event buffer limited to 50 entries (FIFO).

### 20.7 Routing

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

### 20.8 Color System

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

### 20.9 Page Details

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
- Click row → TraceDrawer (side sheet) with **hierarchical tree view** *(v2: built from `spanId`/`parentSpanId` relationships)*

**Analytics** — Charts dashboard:
- Time range selector (7d / 30d / 90d)
- Cost summary cards with trend arrows
- Multi-line cost timeline chart (Recharts LineChart, per agent)
- Approval outcome pie chart (Recharts PieChart)
- Model usage bar chart (Recharts BarChart)
- Agent leaderboard sortable table

**Policies** — Read-only list:
- Expandable policy cards showing rules, action types, risk tiers, effects

### 20.10 shadcn/ui Components Used

28 primitives installed and configured with dark theme:

`Accordion`, `AlertDialog`, `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `Form`, `Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Sonner (Toaster)`, `Switch`, `Table`, `Tabs`, `Textarea`, `Toggle`, `Tooltip`

### 20.11 API Client Functions

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

## 21. Constitution & Design Principles

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
- Pure unit tests run in seconds (mock repos, error classes, security, SSE, N+1, versioning, SDK v2 + v2.1–v2.3 hardening); ~140 integration/service tests with DB

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

## 22. Glossary

| Term | Definition |
|------|-----------|
| **Agent** | An AI system registered on the platform with a risk tier and lifecycle status |
| **Trace** | A UUID grouping all events from a single agent execution session |
| **AuditLog** | A record of an agent action (LLM call, tool call, approval event) |
| **ApprovalTicket** | A governance checkpoint requiring human decision for a risky action |
| **Policy** | A named set of rules that determine how agent actions are governed |
| **PolicyRule** | A single rule matching actionType + riskTier to an effect (ALLOW/DENY/REQUIRE) |
| **GovernanceClient** | SDK v2 used by agents to interact with the platform (wrapLLMCall, callTool, withSpan, policy check) |
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
| **EventBuffer** | SDK component that queues audit events in-memory and batch-flushes them asynchronously to `/api/v1/audit/batch` |
| **SpanManager** | SDK component that tracks `spanId` and `parentSpanId` for hierarchical trace trees via `withSpan()` |
| **CircuitBreaker** | SDK resilience component with CLOSED/OPEN/HALF-OPEN states; retries failed platform calls, then fails open or closed |
| **Span** | A named scope within a trace; has a unique `spanId` and optional `parentSpanId` for tree structure |
| **Policy Gate** | Pre-execution policy check (`POST /api/v1/policies/check`) performed by `callTool` before running the tool function |
| **PolicyDeniedError** | Custom error thrown when a policy evaluation returns DENY or an approval is denied |
| **BudgetExceededError** | Custom error thrown when cumulative LLM/tool costs exceed the configured `maxCostUsd` |
| **Framework Adapter** | Optional wrapper (Anthropic, OpenAI, LangChain) that auto-integrates an LLM SDK with governance logging |
| **wrapLLMCall** | Generic SDK method that wraps any async LLM call with governance logging (provider-agnostic) |
| **wrapLLMStream** | Generic SDK method that wraps any streaming LLM call, collecting chunks and logging on completion |
| **Fail-Open** | Resilience mode where the agent continues operating without governance if the platform is unavailable |
| **Fail-Closed** | Resilience mode where agent operations throw errors if the platform is unavailable |
| **withTrace** | `gov.withTrace(fn)` — runs `fn` inside an isolated trace context using `AsyncLocalStorage` so concurrent requests on a shared client don't share a `traceId` *(v2.1)* |
| **CircuitBreakerRegistry** | Per-route map of `CircuitBreaker`s keyed by `routeKeyFromUrl(url)` so one bad endpoint can't open the breaker on healthy ones *(v2.3)* |
| **routeKeyFromUrl** | Helper that derives `host\|first-path-segment` for breaker isolation, exported for tests/tooling |
| **Full-Jitter Backoff** | Retry strategy where the actual sleep is `random(0, min(retryMaxMs, base × 2^attempt))` — decorrelates retry storms |
| **span_failed event** | Audit event emitted by `withSpan` when its callback rejects; carries `metadata.spanName` so the dashboard can tag failed spans without scanning children *(v2.3)* |
| **getMetrics** | `gov.getMetrics()` — synchronous snapshot of cumulative cost, buffer pressure, per-route breaker state, and active traceId *(v2.3)* |
| **ApprovalRequestError** | Typed error thrown when the approval **request itself** fails (network/auth/4xx/5xx/malformed body), distinct from a real human "deny" *(v2.2)* |
| **isApprovalRequestError / isPolicyDeniedError** | Type-guards that work across module reloads and bundlers; preferred over `instanceof` or `err.name === '...'` |
| **BudgetExceededError (server)** | API-side error returning HTTP 402 when an agent's rolling 30-day spend would exceed `agents.budgetUsd` *(v2.2)* |
| **InvalidCredentialsError** | Login error returned identically for "user not found" and "wrong password" to prevent user enumeration *(v2.2)* |
| **AgentBatchInfo** | Repository return type used by `findInfoByIds` carrying `{ id, status, budgetUsd }` so audit ingest can validate every agent in one query *(v2.2)* |
| **apiKeyHint** | Last 4 characters of an agent's API key, persisted alongside the HMAC hash and shown on the dashboard *(v2.1)* |
| **autoShutdown** | `GovernanceClientConfig.autoShutdown` — when true, the SDK installs `beforeExit`/`SIGINT`/`SIGTERM` handlers to flush the buffer before the process exits *(v2.1)* |
| **sseConnectTimeoutMs** | How long the SDK waits for an SSE-pushed approval before falling back to HTTP polling. Default 2_500 ms *(v2.3)* |

---

*Document generated from codebase analysis on 2026-03-21. Updated 2026-04-05 with SDK v2 enhancements. Updated 2026-04-27 with v2.1 → v2.3 hardening: per-trace IDs, EventBuffer requeue + auto-shutdown, public `ticketId` on `PolicyDeniedError`, `/policies/check` agent-API-key auth, dashboard "Rotate API key" workflow, server-side rolling 30-day budgets (HTTP 402), batched `findInfoByIds`, `ApprovalRequestError`, structured error envelope, `InvalidCredentialsError`, `span_failed` events, per-route `CircuitBreakerRegistry` + full-jitter exponential backoff, `gov.getMetrics()`, configurable `sseConnectTimeoutMs`, lazy `eventsource` polyfill, OpenAI/Anthropic streaming + embeddings adapters, JSDoc on all SDK public methods, end-to-end streaming demo in `researchAgent`. Covers EPICs 2, 4, 5, 6, 7, 8 + FIX-01 (Repository Pattern) + FIX-02 (Error Hierarchy) + FIX-03 (Security Headers) + FIX-04 (N+1 Fix) + FIX-05 (API Versioning) + SDK v2 (Provider-Agnostic Core, EventBuffer, SpanManager, CircuitBreaker, Policy Gate, Cost Budgets, Streaming, Framework Adapters) + v2.1 → v2.3 hardening.*
