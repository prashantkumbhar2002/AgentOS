# Tasks: Custom Error Hierarchy + Global Error Handler (FIX-02)

## Phase 1 — Error Foundation

- [X] **E01** — `apps/api/src/errors/AppError.ts` — Create base `AppError` class with `code`, `message`, `statusCode`, `details` fields. Implement `Error.captureStackTrace` and `this.name = this.constructor.name`. Create all 8 subclasses: `NotFoundError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `ConflictError`, `InvalidTransitionError`, `PolicyBlockedError`, `ExternalServiceError`. Include `authMessages` map for token error reasons.

- [X] **E02** — `apps/api/src/errors/index.ts` — Barrel export all error classes from `AppError.ts`.

- [X] **E03** — `apps/api/src/errors/AppError.test.ts` — Vitest unit tests for each error class. Verify: correct `statusCode`, correct `code`, correct `message` format, correct `name` property, `details` included when provided. At least 2 tests per class (happy path + edge case). Minimum 16 tests.

## Phase 2 — Global Error Handler

- [X] **E04** — `apps/api/src/plugins/errorHandler.ts` — Create Fastify plugin using `fastify-plugin` + `fastify.setErrorHandler`. Handle 4 cases: (1) `AppError` instances → use statusCode/code/details, (2) Fastify validation errors → 400, (3) JWT `FST_JWT_*` error codes → 401 with mapped code, (4) Unknown errors → 500 with generic message in production. All responses include `requestId` from `request.id`. Log `warn` for 4xx, `error` for 5xx.

- [X] **E05** — `apps/api/src/app.ts` — Register `errorHandler` plugin early in the plugin chain (before route registration, after auth plugin).

- [X] **E06** — `apps/api/src/plugins/errorHandler.test.ts` — Vitest unit tests for the global handler. Test: AppError produces correct response shape, unknown error returns 500, JWT expired code maps to 401, production mode hides error details, requestId is always present. Minimum 8 tests.

## Phase 3 — Auth Plugin Refactor

- [X] **E07** — `apps/api/src/plugins/auth.ts` — Refactor `authenticate` function: remove `error.message.includes('expired')` string matching. Instead, check `(err as any).code` for `FST_JWT_AUTHORIZATION_TOKEN_EXPIRED` and `FST_JWT_AUTHORIZATION_TOKEN_INVALID`. Throw `AuthenticationError('TOKEN_MISSING')` when no auth header. Throw `AuthenticationError('TOKEN_EXPIRED')` or `AuthenticationError('TOKEN_INVALID')` on JWT verify failure. Refactor `requireRole`: throw `AuthorizationError(roles)` instead of `reply.status(403).send()`.

## Phase 4 — Route Refactoring [P]

All tasks in this phase can run in parallel since they modify different files.

- [X] **E08** — `apps/api/src/modules/agents/agents.routes.ts` — Replace all `reply.status(4xx).send()` calls with typed error throws. Use `NotFoundError('Agent', id)` for 404s, `ValidationError` for Zod parse failures, `InvalidTransitionError` for status transition errors, `AuthorizationError` for role checks, `ConflictError` for "already deprecated" / "cannot deprecate ACTIVE". [P]

- [X] **E09** — `apps/api/src/modules/audit/audit.routes.ts` — Replace all inline error responses. Use `NotFoundError('Agent', id)` for agent lookups, `ValidationError` for Zod failures, `NotFoundError('Trace', traceId)` for missing traces. [P]

- [X] **E10** — `apps/api/src/modules/approvals/approvals.routes.ts` — Replace all inline error responses. Use `NotFoundError('Agent', id)`, `PolicyBlockedError` for DENY results, `ValidationError` for Zod failures, `NotFoundError('Ticket', id)` for missing tickets, `ConflictError` for "Ticket expired" / "Ticket already resolved". [P]

- [X] **E11** — `apps/api/src/modules/policies/policies.routes.ts` — Replace all inline error responses. Use `NotFoundError('Policy', id)`, `ValidationError` for Zod failures, `ConflictError` for duplicate names and assigned-policy deletion, `NotFoundError('Agent', agentId)` for agent lookups. [P]

- [X] **E12** — `apps/api/src/modules/analytics/analytics.routes.ts` — Replace all inline error responses. Use `ValidationError` for Zod parse failures, `ValidationError` for invalid date ranges. [P]

- [X] **E13** — `apps/api/src/modules/users/users.routes.ts` — Replace all inline error responses. Use `AuthenticationError('TOKEN_INVALID')` for invalid credentials (maps to 401), `ValidationError` for Zod failures. [P]

- [X] **E14** — `apps/api/src/modules/showcase/showcase.routes.ts` — Replace all inline error responses. Use `NotFoundError` for missing showcase agents, `ExternalServiceError('Anthropic')` when ANTHROPIC_API_KEY is not configured, `ValidationError` for Zod failures. [P]

- [X] **E15** — `apps/api/src/plugins/slack.ts` — Replace all inline error responses. Use `AuthenticationError('TOKEN_INVALID')` for missing Slack signature, `ValidationError` for invalid payloads. Note: Slack responses must stay as 200 with `response_type: 'ephemeral'` for Slack protocol compliance — only refactor non-Slack-protocol errors. [P]

## Phase 5 — Silent Error Fix

- [X] **E16** — `apps/api/src/repositories/prisma/PrismaAgentRepository.ts` — Replace `.catch(() => { })` on `updateLastActiveAt` with `.catch((err) => { fastify.log.warn(...) })` or simply let it propagate (since it's a non-critical fire-and-forget). Add a logged warning instead of silent swallow.

## Phase 6 — Validation

- [X] **E17** — Run TypeScript compilation (`npx tsc --noEmit`) — verify zero errors after all refactoring.

- [X] **E18** — Run all unit tests (`vitest run src/errors/ src/plugins/errorHandler.test.ts`) — verify new tests pass.

- [X] **E19** — Run existing unit tests (`vitest run`) — verify no regressions. Update integration tests if response shape changed (e.g., `error` field is now a code instead of free-form message).

- [X] **E20** — Verify zero `reply.status(4xx).send()` calls remain in route files (grep check). Verify zero `message.includes()` patterns remain. Verify zero `.catch(() => {})` patterns remain.

## Dependency Order

```
E01-E02 (error classes) ─────────┐
                                  ├── E03 (error class tests)
                                  ├── E04-E05 (global handler + registration)
                                  │     └── E06 (handler tests)
                                  ├── E07 (auth plugin refactor)
                                  └── E08-E15 (route refactoring, all [P])
                                        └── E16 (silent error fix)
                                              └── E17-E20 (validation)
```

Tasks marked [P] can run in parallel with their phase siblings.
