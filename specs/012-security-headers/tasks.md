# Tasks: Security Headers + Request ID + SSE Token Fix (FIX-03)

## Phase 1 — Dependencies & Environment

- [ ] **S01** — Install `@fastify/helmet` in `apps/api`. Install `jsonwebtoken` + `@types/jsonwebtoken` in `apps/api` (for SSE token signing separate from Fastify JWT).

- [ ] **S02** — `apps/api/src/config/env.ts` — Add `SSE_SECRET` to the Zod `EnvSchema` as a required string with min 32 chars. Add `.env.example` update if exists.

## Phase 2 — Security Headers + Request ID

- [ ] **S03** — `apps/api/src/app.ts` — Register `@fastify/helmet` with custom CSP directives (allow `'unsafe-inline'` for styleSrc, `data:` for imgSrc, `FRONTEND_URL` for connectSrc, `crossOriginEmbedderPolicy: false` for SSE). Register BEFORE cors and rate-limit so headers are set on all responses.

- [ ] **S04** — `apps/api/src/app.ts` — Add `genReqId` to Fastify constructor options: use client-provided `x-request-id` header (truncated to 64 chars) or generate UUID. Set `requestIdHeader: 'x-request-id'`. Add `onSend` hook to set `x-request-id` response header on every reply.

## Phase 3 — SSE Token Endpoint + Stream Auth Refactor

- [ ] **S05** — `apps/api/src/app.ts` — Add `POST /api/events/token` endpoint. Requires Bearer JWT auth (use `authenticate` preHandler). Signs a short-lived token with `SSE_SECRET` containing `{ userId: request.user.id, role: request.user.role, type: 'sse' }` and `expiresIn: 30` (seconds). Returns `{ sseToken: string, expiresIn: 30 }`.

- [ ] **S06** — `apps/api/src/app.ts` — Refactor `GET /api/events/stream` to verify the query-string token against `SSE_SECRET` (not `JWT_SECRET`). Verify that `payload.type === 'sse'` — reject tokens that aren't SSE-scoped. Use `jsonwebtoken.verify()` with `SSE_SECRET`. Remove `fastify.jwt.verify(token)` call.

## Phase 4 — Frontend SSE Hook Update

- [ ] **S07** — `apps/web/src/hooks/useSSE.ts` — Update `connect` function to be async. Before creating EventSource: call `POST /api/events/token` with `Authorization: Bearer <mainToken>`. Extract `sseToken` from response. Use `sseToken` in the EventSource URL instead of the main JWT. Handle token request failure by scheduling reconnect with backoff.

## Phase 5 — Tests

- [ ] **S08** — `apps/api/src/security.test.ts` — Vitest tests: (1) response includes X-Frame-Options header, (2) response includes X-Content-Type-Options header, (3) response includes Content-Security-Policy header, (4) response includes x-request-id header, (5) client-provided x-request-id is passed through, (6) long x-request-id is truncated to 64 chars.

- [ ] **S09** — `apps/api/src/sse-token.test.ts` — Vitest tests: (1) POST /api/events/token returns sseToken with expiresIn:30 for authenticated user, (2) POST /api/events/token returns 401 without auth, (3) SSE token is rejected by non-SSE endpoints (e.g. GET /api/agents), (4) main JWT is rejected by GET /api/events/stream, (5) expired SSE token is rejected by GET /api/events/stream.

## Phase 6 — Validation

- [ ] **S10** — Run TypeScript compilation (`npx tsc --noEmit`) — verify zero new errors.

- [ ] **S11** — Run all unit tests (`npx vitest run`) — verify new tests pass and no regressions.

- [ ] **S12** — Grep verification: zero instances of `fastify.jwt.verify(token)` in SSE stream handler. SSE stream endpoint must only use `jsonwebtoken.verify` with `SSE_SECRET`.

## Dependency Order

```
S01-S02 (deps + env) ─────────────┐
                                   ├── S03 (helmet)
                                   ├── S04 (request ID)
                                   ├── S05 (SSE token endpoint)
                                   │     └── S06 (SSE stream refactor)
                                   │           └── S07 (frontend hook)
                                   └── S08-S09 (tests)
                                         └── S10-S12 (validation)
```
