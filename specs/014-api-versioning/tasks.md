# Tasks: API Versioning (FIX-05)

## Phase 1 — Backend Route Migration

- [ ] **V01** — `apps/api/src/app.ts` — Change all versioned route registrations from `/api/agents` to `/api/v1/agents`, `/api/audit` to `/api/v1/audit`, `/api/approvals` to `/api/v1/approvals`, `/api/policies` to `/api/v1/policies`, `/api/analytics` to `/api/v1/analytics`, `/api/showcase` to `/api/v1/showcase`. Move inline SSE `POST /api/events/token` to `POST /api/v1/events/token` and `GET /api/events/stream` to `GET /api/v1/events/stream`. Keep `/api/auth` and `/api/health` unchanged.

- [ ] **V02** — `apps/api/src/app.ts` — Add 301 redirect routes for backward compatibility. For each versioned prefix (`agents`, `audit`, `approvals`, `policies`, `analytics`, `showcase`, `events`), register catch-all routes that redirect `/api/<prefix>` and `/api/<prefix>/*` to `/api/v1/<prefix>` with query params and path segments preserved. Redirects must be registered AFTER the versioned routes.

## Phase 2 — Frontend Updates

- [ ] **V03** [P] — `apps/web/src/lib/api.ts` — Update all versioned API paths: `/api/agents` → `/api/v1/agents`, `/api/approvals` → `/api/v1/approvals`, `/api/audit` → `/api/v1/audit`, `/api/policies` → `/api/v1/policies`, `/api/analytics` → `/api/v1/analytics`, `/api/showcase` → `/api/v1/showcase`. Keep `/api/auth/*` paths unchanged.

- [ ] **V04** [P] — `apps/web/src/hooks/useSSE.ts` — Update `/api/events/token` → `/api/v1/events/token` and `/api/events/stream` → `/api/v1/events/stream`.

## Phase 3 — Test Updates

- [ ] **V05** [P] — `apps/api/src/modules/agents/agents.test.ts` — Replace all `/api/agents` paths with `/api/v1/agents`. Keep `/api/auth/login` unchanged.

- [ ] **V06** [P] — `apps/api/src/modules/audit/audit.test.ts` — Replace all `/api/audit` paths with `/api/v1/audit`. Keep `/api/auth/login` unchanged.

- [ ] **V07** [P] — `apps/api/src/modules/approvals/approvals.test.ts` — Replace `/api/approvals` with `/api/v1/approvals` and `/api/agents` with `/api/v1/agents`. Keep `/api/auth/login` unchanged.

- [ ] **V08** [P] — `apps/api/src/modules/policies/policies.test.ts` — Replace `/api/policies` with `/api/v1/policies` and `/api/agents` with `/api/v1/agents`. Keep `/api/auth/login` unchanged.

- [ ] **V09** [P] — `apps/api/src/modules/analytics/analytics.test.ts` — Replace `/api/analytics` with `/api/v1/analytics` and `/api/agents` with `/api/v1/agents`. Keep `/api/auth/login` unchanged.

- [ ] **V10** [P] — `apps/api/src/sse-token.test.ts` — Replace `/api/events` with `/api/v1/events`. Keep auth-related paths unchanged.

## Phase 4 — New Tests

- [ ] **V11** — `apps/api/src/api-versioning.test.ts` — Add tests verifying: (1) 301 redirect from `/api/agents` to `/api/v1/agents`, (2) redirect preserves path segments (e.g., `/api/agents/abc` → `/api/v1/agents/abc`), (3) redirect preserves query params, (4) `/api/health` returns 200 (not redirected), (5) `/api/auth/login` returns 200 (not redirected).

## Phase 5 — Validation

- [ ] **V12** — Run TypeScript compilation (`npx tsc --noEmit`) — verify zero new errors.

- [ ] **V13** — Run all tests (`npx vitest run`) — verify no regressions.

- [ ] **V14** — Grep verification: zero instances of unversioned business paths (e.g., `'/api/agents'` without v1) in route registrations and frontend code.

## Dependency Order

```
V01 (route migration) → V02 (redirects) ─┐
                                          ├── V05-V10 [P] (test updates)
V03 [P] (frontend api.ts)                │     └── V11 (redirect tests)
V04 [P] (frontend useSSE.ts)             │           └── V12-V14 (validation)
                                          └──────────────┘
```
