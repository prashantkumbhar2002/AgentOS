<!--
  ===== Sync Impact Report =====
  Version change: (none) → 1.0.0 (MAJOR — initial constitution adoption)

  Modified principles: N/A (initial creation)

  Added sections:
    - Core Principles (8 principles: I–VIII)
    - Non-Negotiable Technology Stack
    - HTTP Contracts & Development Conventions
    - Governance (amendment procedure, versioning policy, compliance review)

  Removed sections: N/A

  Templates requiring updates:
    ✅ .specify/templates/plan-template.md — "Constitution Check" section
       references constitution dynamically; no structural change needed.
    ✅ .specify/templates/spec-template.md — requirement structure compatible;
       no update needed.
    ✅ .specify/templates/tasks-template.md — phase structure and testing
       phases align with Principle III; no update needed.
    ✅ .specify/templates/checklist-template.md — generic; no update needed.
    ✅ .specify/templates/agent-file-template.md — auto-generated from plans;
       no update needed.

  Follow-up TODOs: None. All placeholders resolved.
  ===== End Sync Impact Report =====
-->

# AgentOS Constitution

## Core Principles

### I. TypeScript Strict Mode & Zod-Enforced Contracts

- All code MUST use TypeScript strict mode — `any` is forbidden; use
  `unknown` + Zod narrowing instead.
- All Fastify route inputs (body, params, query) AND outputs MUST be
  validated with Zod schemas.
- All environment variables MUST be validated with Zod on application
  startup; if any variable is invalid the process MUST crash immediately
  with a clear, actionable error message.
- Shared Zod schemas MUST reside in `packages/types` and be imported by
  both `apps/api` and `apps/web`.
- Zod schemas MUST use PascalCase with a `Schema` suffix
  (e.g., `CreateAgentSchema`, `AuditQuerySchema`).

**Rationale**: A single validation layer (Zod) spanning env, API, and
shared types eliminates an entire class of runtime errors and keeps the
contract between frontend and backend provably consistent.

### II. Prisma-Exclusive Data Access

- All database access MUST go through Prisma ORM — raw SQL queries and
  alternative query builders are forbidden.
- Database models MUST use PascalCase naming
  (e.g., `Agent`, `AuditLog`, `ApprovalTicket`, `PolicyRule`).
- Schema migrations MUST be executed via `prisma migrate dev` —
  `prisma db push` MUST NOT be used in production.
- PostgreSQL 16 is the only supported database engine.

**Rationale**: A single, type-safe data-access layer eliminates query
injection risks and guarantees that every schema change is tracked in a
reviewable migration file.

### III. Test-Driven Quality Gates

- Every Fastify route MUST have at least one happy-path and one
  error-path test using Supertest.
- Business logic functions (policy evaluator, cost calculator, health
  scorer) MUST have Vitest unit tests.
- All external services (Anthropic API, Slack, email) MUST be mocked in
  tests — real calls during testing are forbidden.
- Test databases MUST use either a separate test DB instance or Prisma
  transactions that roll back after each test.
- Testing stack: Vitest (unit) + Supertest (integration).

**Rationale**: Governance software cannot ship regressions in policy
evaluation or cost tracking. Mandatory test coverage on every route
ensures baseline correctness before merge.

### IV. Security-First Architecture

- Rate limiting MUST be enforced: 100 req/min default,
  10 req/15 min on `/api/auth/login`.
- CORS MUST only allow `FRONTEND_URL` in production; `*` is permitted
  only in development.
- JWT authentication (8 h expiry, bcrypt-hashed passwords,
  email/password only — no OAuth) MUST be attached to all routes except
  `/api/auth/*` and `/api/health`.
- Full request payloads that may contain secrets or PII MUST NOT be
  logged.
- Agent inputs MUST be sanitized before storing in audit logs.
- Secrets MUST NOT be hardcoded — all secrets MUST be read from
  validated environment configuration.

**Rationale**: AgentOS governs other AI agents; a compromise of the
control plane would cascade to every managed agent. Defense-in-depth
is non-negotiable.

### V. Role-Based Access Control

Four roles with strictly scoped permissions:

| Role | Permissions |
|------|------------|
| **admin** | Full access to all resources and operations |
| **approver** | Resolve approval tickets; read access to all resources |
| **viewer** | Read-only access — cannot modify any resource |
| **agent** (via SDK) | `POST /api/audit/log` and `POST /api/approvals` only |

- Every route MUST enforce role checks after JWT verification.
- Role escalation MUST NOT be possible without an admin-level action.

**Rationale**: Least-privilege by default limits blast radius when a
token is leaked or an agent misbehaves.

### VI. Resilient Async Processing & Realtime

- All asynchronous work MUST go through BullMQ + Redis (ioredis) queues.
- BullMQ workers MUST implement: retry logic (3 attempts), exponential
  backoff, and dead letter queues.
- Realtime communication MUST use Server-Sent Events (SSE) —
  WebSockets are forbidden.
- SSE connections MUST be cleaned up on client disconnect via
  `response.on('close')`.

**Rationale**: Queues with DLQ guarantee no silent task loss; SSE is
simpler to operate, proxy, and debug than WebSockets for unidirectional
server-to-client updates.

### VII. Monorepo Architecture & File Conventions

- The project MUST use Turborepo with the following workspace layout:
  - `apps/api` — Fastify v4 backend
  - `apps/web` — React 18 + Vite frontend
  - `packages/types` — shared Zod schemas and TypeScript types
  - `packages/governance-sdk` — SDK for agent integration
- Fastify modules: `[entity].routes.ts`, `[entity].service.ts`,
  `[entity].schema.ts`.
- React components: PascalCase (`AgentCard.tsx`, `ApprovalQueue.tsx`).
- Custom hooks: `use[Entity].ts` (e.g., `useAgents.ts`,
  `useApprovals.ts`).
- API routes: REST style (`/api/agents`,
  `/api/approvals/:id/decide`).

**Rationale**: Consistent naming eliminates guesswork during code review
and makes automated tooling (generators, linters) straightforward.

### VIII. Precision in Domain Values

- All monetary values MUST use 6-decimal USD precision
  (e.g., `0.000015`).
- Risk scores MUST be Float values in the range 0.0–1.0 — percentage
  integers are forbidden.

**Rationale**: AI token costs are sub-cent; truncating to 2 decimals
loses real money at scale. Float risk scores allow direct use in
threshold comparisons without conversion.

## Non-Negotiable Technology Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo |
| Language | TypeScript (strict mode) |
| Backend | Fastify v4 + @fastify/jwt + @fastify/cors + @fastify/rate-limit |
| ORM | Prisma v5 + PostgreSQL 16 |
| Validation | Zod |
| Queue | BullMQ + Redis (ioredis) |
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui |
| Client State | TanStack Query v5 (server state) + Zustand (client state) |
| Realtime | Server-Sent Events (SSE) |
| LLM | @anthropic-ai/sdk (model: claude-sonnet-4-5) |
| Notifications | @slack/bolt + @slack/web-api |
| Auth | JWT (8 h expiry) + bcrypt — email/password only |
| Testing | Vitest (unit) + Supertest (integration) |
| Deployment | Docker multi-stage build + docker-compose |

No technology substitutions are permitted without a constitution
amendment.

## HTTP Contracts & Development Conventions

### HTTP Status Codes

All Fastify routes MUST return the following status codes consistently:

| Code | Usage |
|------|-------|
| 200 | Successful GET or PATCH |
| 201 | Successful POST (resource created) |
| 400 | Validation error — MUST include Zod error details in response body |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but insufficient role |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error — MUST NOT expose stack traces in production |

### Route Structure

Every Fastify route MUST enforce:

1. JWT authentication middleware (except `/api/auth/*` and `/api/health`)
2. Zod validation on body, params, and query parameters
3. Correct HTTP status codes per the table above

### Deployment Rules

- All services MUST be containerized via Docker multi-stage builds.
- Local development MUST use `docker-compose` for orchestration.
- Production deployments MUST NOT use `prisma db push`.

## Governance

This constitution is the supreme authority for all AgentOS development
decisions. Any practice, pattern, or implementation that conflicts with
this constitution MUST be brought into compliance or explicitly granted
an exception through the amendment process.

### Amendment Procedure

1. Propose the change with a rationale and impact analysis.
2. Document which principles, templates, or artifacts are affected.
3. Obtain approval from at least one project maintainer.
4. Update the constitution with an incremented version number.
5. Propagate changes to all dependent templates and documentation.
6. Record the amendment in the Sync Impact Report at the top of this
   file.

### Versioning Policy

- **MAJOR**: Backward-incompatible governance changes — principle
  removals or fundamental redefinitions.
- **MINOR**: New principles added, sections materially expanded, or new
  mandatory constraints introduced.
- **PATCH**: Clarifications, wording improvements, typo fixes,
  non-semantic refinements.

### Compliance Review

- All pull requests MUST be verified against this constitution before
  merge.
- Complexity beyond what this constitution prescribes MUST be justified
  with a documented rationale.
- Quarterly reviews SHOULD be conducted to ensure the constitution
  remains aligned with project evolution.

**Version**: 1.0.0 | **Ratified**: 2026-03-21 | **Last Amended**: 2026-03-21
