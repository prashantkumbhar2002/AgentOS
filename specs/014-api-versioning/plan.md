# Implementation Plan: API Versioning (FIX-05)

**Feature**: `specs/014-api-versioning/spec.md`  
**Branch**: `feat/enhancements/v1`  
**Created**: 2026-03-21

## Technical Context

- **Monorepo**: Turborepo — `apps/api` (Fastify backend), `apps/web` (React frontend)
- **Language**: TypeScript strict mode
- **Backend**: Fastify v4 with plugin-based route registration
- **Frontend**: React 18 + Vite + Axios + TanStack Query + custom SSE hook
- **Testing**: Vitest (unit), Supertest (integration)
- **Auth**: JWT (`@fastify/jwt`) — auth routes at `/api/auth`
- **SSE**: Inline endpoints at `/api/events/token` and `/api/events/stream`
- **Existing Patterns**: Repository pattern, DI container, global error handler

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript strict | PASS | No new types needed — routing change only |
| Zod validation | N/A | No new schemas |
| Prisma-exclusive | N/A | No data model changes |
| Test coverage | PASS | All tests updated + new redirect tests |
| No `unknown` returns | N/A | No service changes |

## Architecture

### Current Route Structure (app.ts)

```
/api/auth/*           ← usersRoutes (prefix: '/api/auth')
/api/agents/*         ← agentsRoutes (prefix: '/api/agents')
/api/audit/*          ← auditRoutes (prefix: '/api/audit')
/api/approvals/*      ← approvalRoutes (prefix: '/api/approvals')
/api/policies/*       ← policyRoutes (prefix: '/api/policies')
/api/analytics/*      ← analyticsRoutes (prefix: '/api/analytics')
/api/showcase/*       ← showcaseRoutes (prefix: '/api/showcase')
/api/events/token     ← inline POST handler
/api/events/stream    ← inline GET handler
/api/health           ← inline GET handler
```

### Target Route Structure

```
VERSIONED (/api/v1):
  /api/v1/agents/*      ← agentsRoutes
  /api/v1/audit/*       ← auditRoutes
  /api/v1/approvals/*   ← approvalRoutes
  /api/v1/policies/*    ← policyRoutes
  /api/v1/analytics/*   ← analyticsRoutes
  /api/v1/showcase/*    ← showcaseRoutes
  /api/v1/events/token  ← inline POST handler
  /api/v1/events/stream ← inline GET handler

UNVERSIONED (stay as-is):
  /api/auth/*           ← usersRoutes
  /api/health           ← inline GET handler
  /slack/interactions    ← slackPlugin (already unversioned)

REDIRECTS (301):
  /api/agents/*         → /api/v1/agents/*
  /api/audit/*          → /api/v1/audit/*
  /api/approvals/*      → /api/v1/approvals/*
  /api/policies/*       → /api/v1/policies/*
  /api/analytics/*      → /api/v1/analytics/*
  /api/showcase/*       → /api/v1/showcase/*
  /api/events/*         → /api/v1/events/*
```

### Approach

1. Change route registration prefixes from `/api/agents` → `/api/v1/agents`, etc.
2. Move inline SSE endpoints from `/api/events/*` → `/api/v1/events/*`.
3. Add a redirect plugin that catches old paths and issues 301s with preserved path segments + query params.
4. Update frontend `lib/api.ts` to use `/api/v1/` prefix for all versioned endpoints.
5. Update frontend `hooks/useSSE.ts` to use `/api/v1/events/*`.
6. Update all integration tests to use `/api/v1/` paths.

### Redirect Implementation

Register a Fastify hook or set of routes that match the old prefixes and redirect:

```typescript
const VERSIONED_PREFIXES = ['agents', 'audit', 'approvals', 'policies', 'analytics', 'showcase', 'events'];

for (const prefix of VERSIONED_PREFIXES) {
    fastify.all(`/api/${prefix}/*`, async (request, reply) => {
        const newUrl = request.url.replace(`/api/${prefix}`, `/api/v1/${prefix}`);
        return reply.redirect(301, newUrl);
    });
    fastify.all(`/api/${prefix}`, async (request, reply) => {
        const newUrl = request.url.replace(`/api/${prefix}`, `/api/v1/${prefix}`);
        return reply.redirect(301, newUrl);
    });
}
```

## Files to Modify

### Backend
| File | Change |
|------|--------|
| `apps/api/src/app.ts` | Change route prefixes to `/api/v1/...`, move SSE endpoints, add redirect routes |

### Frontend
| File | Change |
|------|--------|
| `apps/web/src/lib/api.ts` | Update all versioned paths from `/api/X` to `/api/v1/X` |
| `apps/web/src/hooks/useSSE.ts` | Update `/api/events/token` and `/api/events/stream` to `/api/v1/events/token` and `/api/v1/events/stream` |

### Tests
| File | Change |
|------|--------|
| `apps/api/src/modules/agents/agents.test.ts` | `/api/agents` → `/api/v1/agents` |
| `apps/api/src/modules/audit/audit.test.ts` | `/api/audit` → `/api/v1/audit` |
| `apps/api/src/modules/approvals/approvals.test.ts` | `/api/approvals` → `/api/v1/approvals`, `/api/agents` → `/api/v1/agents` |
| `apps/api/src/modules/policies/policies.test.ts` | `/api/policies` → `/api/v1/policies`, `/api/agents` → `/api/v1/agents` |
| `apps/api/src/modules/analytics/analytics.test.ts` | `/api/analytics` → `/api/v1/analytics`, `/api/agents` → `/api/v1/agents` |
| `apps/api/src/sse-token.test.ts` | `/api/events` → `/api/v1/events` |
| `apps/api/src/modules/users/users.test.ts` | No change needed — `/api/auth` and `/api/health` stay unversioned |

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/api-versioning.test.ts` | Tests for 301 redirects + unversioned paths remain accessible |

## Impact Assessment

- **Risk**: Low — pure routing change, no business logic affected
- **Backward compat**: 301 redirects ensure old paths still work
- **Frontend**: Only 2 files to update (centralized API config)
- **Tests**: 6 test files need path updates (mechanical find-replace of `/api/X` → `/api/v1/X` for versioned modules)
