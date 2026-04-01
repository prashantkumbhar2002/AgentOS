# Implementation Plan: FIX-02 — Custom Error Hierarchy + Global Error Handler

**Branch**: `feat/enhancements/v1`
**Spec**: `specs/011-error-hierarchy/spec.md`
**Created**: 2026-03-21

## Technical Context

| Aspect | Detail |
|--------|--------|
| **Language** | TypeScript strict mode |
| **Framework** | Fastify v4 |
| **Auth** | @fastify/jwt |
| **Validation** | Zod |
| **Testing** | Vitest (unit) + Supertest (integration) |
| **Existing Pattern** | Routes use `reply.status(4xx).send({...})` inline |
| **Problem Patterns** | `error.message.includes('expired')` in auth.ts, `.catch(() => {})` in PrismaAgentRepository, 81+ inline error responses across 10 files |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | COMPLIANT | Error classes use TypeScript strict mode, no `any` |
| II. Prisma-Exclusive | N/A | No data model changes |
| III. Test-Driven | COMPLIANT | Unit tests for error classes, integration tests updated |
| IV. Security-First | COMPLIANT | 500 errors hide internals in production |
| V. RBAC | COMPLIANT | AuthorizationError maps to existing role checks |
| VI. Async/Realtime | N/A | No queue or SSE changes |
| VII. Monorepo Conventions | COMPLIANT | New files follow module conventions |
| VIII. Domain Precision | N/A | No monetary or risk score changes |

## Architecture

```
Route Handler
  └── throws AppError subclass (or unhandled error)
        └── Fastify error handler (errorHandler.ts plugin)
              ├── AppError → use statusCode, code, message, details
              ├── Fastify validation error → 400 + details
              ├── JWT FST_JWT_* codes → 401 + mapped code
              └── Unknown → 500 + generic message (prod) or error.message (dev)
```

## File Structure

```
apps/api/src/
├── errors/
│   ├── AppError.ts          # Base class + all 8 subclasses
│   └── index.ts             # Barrel export
├── plugins/
│   └── errorHandler.ts      # Global setErrorHandler plugin
│   └── auth.ts              # Refactored: throw errors instead of reply.status()
├── modules/
│   ├── agents/agents.routes.ts     # Refactored
│   ├── audit/audit.routes.ts       # Refactored
│   ├── approvals/approvals.routes.ts # Refactored
│   ├── policies/policies.routes.ts   # Refactored
│   ├── analytics/analytics.routes.ts # Refactored
│   ├── users/users.routes.ts         # Refactored
│   └── showcase/showcase.routes.ts   # Refactored
├── repositories/prisma/
│   └── PrismaAgentRepository.ts      # Fix .catch(() => {})
└── app.ts                            # Register errorHandler plugin
```

## Error Class Hierarchy

| Class | Code | Status | Use Case |
|-------|------|--------|----------|
| `AppError` | (base) | (varies) | Base class, never thrown directly |
| `NotFoundError` | `NOT_FOUND` | 404 | Resource lookup fails |
| `ValidationError` | `VALIDATION_ERROR` | 400 | Zod parse failures, business rule violations |
| `AuthenticationError` | `TOKEN_EXPIRED` / `TOKEN_INVALID` / `TOKEN_MISSING` | 401 | JWT issues |
| `AuthorizationError` | `FORBIDDEN` | 403 | Insufficient role |
| `ConflictError` | `CONFLICT` | 409 | Duplicate name, already deprecated |
| `InvalidTransitionError` | `INVALID_TRANSITION` | 400 | Agent status transition violations |
| `PolicyBlockedError` | `POLICY_BLOCKED` | 403 | Policy evaluation denies action |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 503 | Slack/Anthropic unavailable |

## Impact Assessment

### Files to Create (3)
- `apps/api/src/errors/AppError.ts`
- `apps/api/src/errors/index.ts`
- `apps/api/src/plugins/errorHandler.ts`

### Files to Modify (~12)
- `apps/api/src/app.ts` — register errorHandler plugin
- `apps/api/src/plugins/auth.ts` — throw typed errors
- `apps/api/src/modules/agents/agents.routes.ts` — ~17 inline error responses
- `apps/api/src/modules/audit/audit.routes.ts` — ~8 inline error responses
- `apps/api/src/modules/approvals/approvals.routes.ts` — ~10 inline error responses
- `apps/api/src/modules/policies/policies.routes.ts` — ~20 inline error responses
- `apps/api/src/modules/analytics/analytics.routes.ts` — ~6 inline error responses
- `apps/api/src/modules/users/users.routes.ts` — ~3 inline error responses
- `apps/api/src/modules/showcase/showcase.routes.ts` — ~7 inline error responses
- `apps/api/src/plugins/slack.ts` — ~4 inline error responses
- `apps/api/src/repositories/prisma/PrismaAgentRepository.ts` — `.catch(() => {})`

### Test Files
- `apps/api/src/errors/AppError.test.ts` — unit tests for all error classes
- `apps/api/src/plugins/errorHandler.test.ts` — unit tests for the global handler
- Existing integration tests — may need response shape updates
