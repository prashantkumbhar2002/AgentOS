import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

const JWT_SECRET = 'test-jwt-secret-that-is-long-enough-32chars!!';
const SSE_SECRET = 'test-sse-secret-that-is-long-enough-32chars!!';

async function testAuthenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        throw { statusCode: 401, message: 'Authentication required' };
    }
    try {
        await request.jwtVerify();
    } catch {
        throw { statusCode: 401, message: 'Invalid token' };
    }
}

async function buildSseTestApp() {
    const app = Fastify({ logger: false });

    await app.register(fastifyJwt, {
        secret: JWT_SECRET,
        sign: { expiresIn: '8h' },
    });

    app.setErrorHandler((error, _request, reply) => {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        return reply.status(status).send({ error: (error as { message?: string }).message });
    });

    app.post(
        '/api/v1/events/token',
        { preHandler: [testAuthenticate] },
        async (request, reply) => {
            const user = request.user as { id: string; role: string };
            const sseToken = jwt.sign(
                { userId: user.id, role: user.role, type: 'sse' },
                SSE_SECRET,
                { expiresIn: 30 },
            );
            return reply.status(200).send({ sseToken, expiresIn: 30 });
        },
    );

    app.get('/api/v1/events/stream', async (request, reply) => {
        const token = (request.query as Record<string, string>)['token'];
        if (!token) {
            return reply.status(401).send({ error: 'TOKEN_MISSING' });
        }

        try {
            const payload = jwt.verify(token, SSE_SECRET) as { type?: string };
            if (payload.type !== 'sse') {
                throw new Error('Not an SSE token');
            }
        } catch {
            return reply.status(401).send({ error: 'TOKEN_INVALID' });
        }

        return { connected: true };
    });

    return app;
}

function signMainToken(payload: Record<string, unknown>) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

describe('SSE Token Endpoint', () => {
    it('returns sseToken with expiresIn for authenticated user', async () => {
        const app = await buildSseTestApp();
        const mainToken = signMainToken({ id: randomUUID(), email: 'a@b.com', name: 'Test', role: 'admin' });

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/events/token',
            headers: { authorization: `Bearer ${mainToken}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.sseToken).toBeDefined();
        expect(body.expiresIn).toBe(30);

        const decoded = jwt.verify(body.sseToken, SSE_SECRET) as Record<string, unknown>;
        expect(decoded.type).toBe('sse');
        expect(decoded.role).toBe('admin');
    });

    it('returns 401 without authentication', async () => {
        const app = await buildSseTestApp();

        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/events/token',
        });

        expect(res.statusCode).toBe(401);
    });
});

describe('SSE Stream Auth', () => {
    it('accepts valid SSE token', async () => {
        const app = await buildSseTestApp();
        const sseToken = jwt.sign(
            { userId: randomUUID(), role: 'admin', type: 'sse' },
            SSE_SECRET,
            { expiresIn: 30 },
        );

        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/events/stream?token=${sseToken}`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().connected).toBe(true);
    });

    it('rejects main JWT on SSE stream endpoint', async () => {
        const app = await buildSseTestApp();
        const mainToken = signMainToken({ id: randomUUID(), email: 'a@b.com', name: 'Test', role: 'admin' });

        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/events/stream?token=${mainToken}`,
        });

        expect(res.statusCode).toBe(401);
    });

    it('rejects expired SSE token', async () => {
        const app = await buildSseTestApp();
        const expiredToken = jwt.sign(
            { userId: randomUUID(), role: 'admin', type: 'sse' },
            SSE_SECRET,
            { expiresIn: -1 },
        );

        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/events/stream?token=${expiredToken}`,
        });

        expect(res.statusCode).toBe(401);
    });

    it('rejects token without type=sse', async () => {
        const app = await buildSseTestApp();
        const badToken = jwt.sign(
            { userId: randomUUID(), role: 'admin' },
            SSE_SECRET,
            { expiresIn: 30 },
        );

        const res = await app.inject({
            method: 'GET',
            url: `/api/v1/events/stream?token=${badToken}`,
        });

        expect(res.statusCode).toBe(401);
    });

    it('rejects missing token', async () => {
        const app = await buildSseTestApp();

        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/events/stream',
        });

        expect(res.statusCode).toBe(401);
    });
});
