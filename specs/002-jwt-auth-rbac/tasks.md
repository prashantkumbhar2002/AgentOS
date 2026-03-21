# Tasks: Authentication & User Management

**Input**: Design documents from `/specs/002-jwt-auth-rbac/`
**Prerequisites**: spec.md (required), constitution.md (required)
**Epic**: EPIC 1 — Auth & User Management
**Status**: Complete (all tasks implemented)

## Phase 0: Monorepo Bootstrap (Shared Infrastructure)

**Purpose**: Scaffolding that must exist before any feature code can be written.
The repo was greenfield — zero source files.

- [x] T1.00a — `package.json` + `turbo.json` + `tsconfig.json` — Root monorepo config with npm workspaces (`apps/*`, `packages/*`), Turborepo pipeline, base TypeScript strict config
- [x] T1.00b — `packages/types/package.json` + `tsconfig.json` — Shared types workspace scaffolding (dep: `zod`)
- [x] T1.00c — `apps/api/package.json` + `tsconfig.json` + `vitest.config.ts` — API workspace with all deps (fastify, @fastify/jwt, @fastify/cors, @fastify/rate-limit, @prisma/client, bcrypt, zod) and devDeps (prisma, vitest, supertest, tsx)
- [x] T1.00d — `apps/api/prisma/schema.prisma` — Full Prisma schema: User, Agent, AgentTool, AuditLog, ApprovalTicket, Policy, PolicyRule, AgentPolicy models + enums (from PRD)
- [x] T1.00e — `docker-compose.yml` + `.env.example` — PostgreSQL 16 + Redis 7 dev infrastructure, env template
- [x] T1.00f — Run `npm install`, `docker compose up -d postgres`, `prisma migrate dev --name init` — Install deps, start DB, apply initial migration

**Checkpoint**: Monorepo builds, Prisma client generated, PostgreSQL running.

---

## Phase 1: Feature Implementation

**Purpose**: Auth feature code, ordered by dependency chain.

- [x] T1.01 — `packages/types/src/auth.ts` + `index.ts` — Create RoleEnum, LoginSchema, AuthResponseSchema, AuthUserSchema, UserSchema, ErrorResponseSchema with Zod. Barrel re-export from index.ts.
  - Dependencies: T1.00b complete
- [x] T1.02 — `apps/api/src/config/env.ts` — Zod-validated env config (DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, NODE_ENV, FRONTEND_URL, REDIS_URL). Crash on invalid with actionable error.
  - Dependencies: T1.00c complete
- [x] T1.03a — `apps/api/src/plugins/prisma.ts` — Fastify plugin: instantiate PrismaClient, decorate instance, disconnect onClose.
  - Dependencies: T1.00d complete (schema + generated client)
- [x] T1.03b — `apps/api/src/plugins/auth.ts` — Register @fastify/jwt with JWT_SECRET from env. Export `authenticate` preHandler (401 with distinct messages: "Unauthorized" / "Token expired" / "Invalid token"). Export `requireRole(roles)` preHandler factory (403 "Insufficient permissions").
  - Dependencies: T1.01 (RoleEnum type), T1.02 (env.JWT_SECRET)
- [x] T1.04 — `apps/api/src/modules/users/users.service.ts` — `findByEmail(prisma, email)`, `comparePassword(plain, hash)`, `hashPassword(plain)`, `createUser(prisma, data)`. PrismaClient injected as parameter.
  - Dependencies: T1.03a (Prisma client available)
- [x] T1.05 — `apps/api/src/modules/users/users.routes.ts` — Fastify plugin with three routes: `POST /login` (Zod body validation, rate limit 10/15min, 401 same message for unknown email + wrong password), `POST /refresh` (authenticate preHandler, re-sign token), `GET /me` (authenticate preHandler, return user from JWT). Narrows Prisma `string` role to `Role` via `RoleEnum.parse()`.
  - Dependencies: T1.01 (LoginSchema, RoleEnum), T1.04 (service), T1.03b (authenticate)
- [x] T1.06 — `apps/api/src/app.ts` + `src/server.ts` — Fastify app factory `buildApp()`: registers CORS (FRONTEND_URL in prod, * in dev), rate-limit (100/min default), prisma plugin, auth plugin, users routes (prefix `/api/auth`), health endpoint. `server.ts` calls `buildApp()` and listens.
  - Dependencies: T1.03a, T1.03b, T1.05
- [x] T1.07 — `apps/api/src/modules/users/users.test.ts` — 13 Supertest integration tests: login happy path (200 + token + user), wrong password (401), unknown email (401 same message), missing email (400), short password (400), /me valid token (200), /me no token (401 "Unauthorized"), /me malformed token (401 "Invalid token"), /me expired token (401 "Token expired"), refresh valid (200 + new token), refresh no token (401), viewer RBAC check, /api/health no auth (200).
  - Dependencies: T1.06 (buildApp for Supertest)
- [x] T1.08 — `apps/api/prisma/seed.ts` — Idempotent seed: 3 users (admin/approver/viewer with bcrypt-hashed passwords, upsert by email), 2 agents ("Email Draft Agent" HIGH/sales, "Research Agent" MEDIUM/product, upsert by name), 3 policies with rules ("External Email Approval" REQUIRE_APPROVAL, "Delete Protection" DENY, "Low Risk Auto-Allow" ALLOW, upsert by name + delete-recreate rules).
  - Dependencies: T1.00d (Prisma schema with Agent, Policy, PolicyRule models)

**Checkpoint**: All auth routes functional, 13/13 tests pass, seed idempotent.

---

## Dependencies & Execution Order

```
T1.00a ─┬─► T1.00b ──► T1.01 ──┬──► T1.03b ──┐
        │                      │              │
        ├─► T1.00c ──► T1.02 ──┘              ├──► T1.05 ──► T1.06 ──► T1.07
        │                                     │
        ├─► T1.00d ──► T1.03a ──► T1.04 ──────┘
        │              │
        ├─► T1.00e     └──────────────────────────► T1.08
        │
        └─► T1.00f
```

### Parallel Opportunities

- T1.01, T1.02, T1.03a can proceed in parallel after bootstrap
- T1.03b requires both T1.01 and T1.02
- T1.08 (seed) is independent of T1.05–T1.07 (only needs Prisma)

---

## Notes

- All tasks marked [x] — implementation complete and verified
- 13/13 Supertest tests passing
- Seed verified idempotent across consecutive runs
- TypeScript compiles clean (`tsc --noEmit` passes)
- Constitution compliance verified against all 8 principles
