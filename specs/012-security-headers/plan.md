# Implementation Plan: FIX-03 — Security Headers + Request ID + SSE Token Fix

**Branch**: `feat/enhancements/v1`
**Spec**: `specs/012-security-headers/spec.md`
**Created**: 2026-03-21

## Technical Context

| Aspect | Detail |
|--------|--------|
| **Language** | TypeScript strict mode |
| **Framework** | Fastify v4 |
| **Auth** | @fastify/jwt (main tokens, 8h expiry) |
| **SSE** | Custom SSE plugin (`plugins/sse.ts`) |
| **Frontend** | React 18 + Vite, `useSSE` hook uses EventSource |
| **Error Handling** | Custom AppError hierarchy + global error handler (FIX-02) |
| **Current Issues** | No security headers, main JWT in SSE query string, no request correlation ID |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | COMPLIANT | SSE_SECRET added to Zod env schema |
| II. Prisma-Exclusive | N/A | No data model changes |
| III. Test-Driven | COMPLIANT | Unit tests for SSE token issuance, security header verification |
| IV. Security-First | COMPLIANT | Core purpose: adds 7 security headers, removes JWT-in-query-string anti-pattern |
| V. RBAC | COMPLIANT | SSE token carries userId + role, auth required to obtain |
| VI. Async/Realtime | COMPLIANT | SSE stream auth mechanism changes; SSE plugin and heartbeat unmodified |
| VII. Monorepo Conventions | COMPLIANT | New files follow module conventions |
| VIII. Domain Precision | N/A | No monetary or risk score changes |

## Architecture

### SSE Token Flow (New)

```
Client                          API
  │                              │
  ├─ POST /api/events/token ────►│  (requires Bearer JWT)
  │  (main JWT in Auth header)   │
  │                              │  Signs { userId, role } with SSE_SECRET
  │◄── { sseToken, expiresIn } ──│  (30s TTL)
  │                              │
  ├─ GET /api/events/stream ────►│  (sseToken in query param)
  │  ?token=<sseToken>           │
  │                              │  Verifies with SSE_SECRET (not JWT_SECRET)
  │◄──── SSE event stream ───────│  Rejects if expired or wrong secret
```

### Request ID Flow

```
Client Request
  │ (optional x-request-id header)
  ▼
Fastify genReqId
  │ uses client ID or generates UUID
  ▼
onRequest hook
  │ sets reply header x-request-id
  ▼
All log lines include requestId automatically (Pino child logger)
  ▼
Error handler includes requestId in response body (already done in FIX-02)
```

## File Structure

```
apps/api/
├── package.json                    # Add @fastify/helmet dependency
├── src/
│   ├── config/env.ts               # Add SSE_SECRET env var
│   ├── app.ts                      # Register helmet, genReqId, onRequest hook,
│   │                               #   SSE token endpoint, refactor SSE stream auth
│   ├── plugins/
│   │   └── auth.ts                 # No changes (SSE uses separate verification)
│   └── errors/                     # No changes (already has AuthenticationError)
apps/web/
└── src/
    └── hooks/useSSE.ts             # Request SSE token before connecting
```

## Dependency Changes

| Package | Action | Location |
|---------|--------|----------|
| `@fastify/helmet` | Install (latest) | `apps/api/package.json` |

No other new dependencies needed — `@fastify/jwt` already provides the `jwt.sign/verify` capability, and we'll use a second signer instance for SSE tokens via Fastify's built-in JWT features.

## Environment Changes

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SSE_SECRET` | Yes | (none) | Signing secret for short-lived SSE tokens, must be ≥32 chars |

## Helmet Configuration

```typescript
await fastify.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", env.FRONTEND_URL],
        },
    },
    crossOriginEmbedderPolicy: false,
});
```

## Request ID Configuration

```typescript
const fastify = Fastify({
    logger: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    genReqId: (req) => (req.headers['x-request-id'] as string)?.slice(0, 64) ?? randomUUID(),
    requestIdHeader: 'x-request-id',
});

// onSend hook to add x-request-id to every response
fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
});
```

## SSE Token Implementation

```typescript
// POST /api/events/token — issues short-lived SSE token
import jwt from 'jsonwebtoken';

fastify.post('/api/events/token', { preHandler: [authenticate] }, async (request, reply) => {
    const { id, role } = request.user;
    const sseToken = jwt.sign({ userId: id, role, type: 'sse' }, env.SSE_SECRET, { expiresIn: 30 });
    return reply.status(200).send({ sseToken, expiresIn: 30 });
});

// GET /api/events/stream — verifies SSE token (NOT main JWT)
fastify.get('/api/events/stream', async (request, reply) => {
    const token = (request.query as Record<string, string>)['token'];
    if (!token) throw new AuthenticationError('TOKEN_MISSING');

    try {
        const payload = jwt.verify(token, env.SSE_SECRET) as { type?: string };
        if (payload.type !== 'sse') throw new Error('Not an SSE token');
    } catch {
        throw new AuthenticationError('TOKEN_INVALID');
    }

    // ... rest of SSE connection setup (unchanged)
});
```

## Frontend useSSE Hook Update

```typescript
const connect = useCallback(async () => {
    if (!token) return;

    // Step 1: Request short-lived SSE token
    const res = await fetch(`${API_URL}/api/events/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) { /* schedule retry */ return; }
    const { sseToken } = await res.json();

    // Step 2: Connect with SSE token
    const url = `${API_URL}/api/events/stream?token=${sseToken}`;
    const es = new EventSource(url);
    // ... rest unchanged
}, [token]);
```
