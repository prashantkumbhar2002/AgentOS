import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
    app = Fastify();

    app.get('/api/v1/agents', async () => ({ data: [] }));
    app.get('/api/v1/agents/:id', async (req) => ({ id: (req.params as { id: string }).id }));
    app.post('/api/v1/agents', async () => ({ created: true }));
    app.get('/api/v1/audit/traces/:traceId', async () => ({ trace: [] }));
    app.get('/api/auth/login', async () => ({ ok: true }));
    app.post('/api/auth/login', async () => ({ accessToken: 'test' }));
    app.get('/api/health', async () => ({ status: 'ok' }));

    const VERSIONED_PREFIXES = ['agents', 'audit', 'approvals', 'policies', 'analytics', 'showcase', 'events'];
    for (const prefix of VERSIONED_PREFIXES) {
        app.all(`/api/${prefix}`, async (request, reply) => {
            const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
            return reply.status(301).redirect(`/api/v1/${prefix}${search}`);
        });
        app.all(`/api/${prefix}/*`, async (request, reply) => {
            const newUrl = request.url.replace(`/api/${prefix}`, `/api/v1/${prefix}`);
            return reply.status(301).redirect(newUrl);
        });
    }

    await app.ready();
});

afterAll(async () => {
    await app.close();
});

describe('API Versioning — 301 Redirects', () => {
    const VERSIONED_PREFIXES = ['agents', 'audit', 'approvals', 'policies', 'analytics', 'showcase', 'events'];

    for (const prefix of VERSIONED_PREFIXES) {
        it(`redirects GET /api/${prefix} → /api/v1/${prefix}`, async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/${prefix}`,
            });

            expect(res.statusCode).toBe(301);
            expect(res.headers.location).toBe(`/api/v1/${prefix}`);
        });
    }

    it('redirects with path segments preserved', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/agents/abc-123',
        });

        expect(res.statusCode).toBe(301);
        expect(res.headers.location).toBe('/api/v1/agents/abc-123');
    });

    it('redirects with query parameters preserved', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/agents?page=2&limit=10',
        });

        expect(res.statusCode).toBe(301);
        expect(res.headers.location).toBe('/api/v1/agents?page=2&limit=10');
    });

    it('redirects POST requests (not just GET)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/agents',
            payload: {},
        });

        expect(res.statusCode).toBe(301);
        expect(res.headers.location).toBe('/api/v1/agents');
    });

    it('redirects nested paths', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/audit/traces/some-trace-id',
        });

        expect(res.statusCode).toBe(301);
        expect(res.headers.location).toBe('/api/v1/audit/traces/some-trace-id');
    });
});

describe('API Versioning — Unversioned endpoints remain accessible', () => {
    it('GET /api/health returns 200 (not redirected)', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/health',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok' });
    });

    it('POST /api/auth/login returns non-301 (not redirected)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'test@test.com', password: 'wrong' },
        });

        expect(res.statusCode).not.toBe(301);
    });
});

describe('API Versioning — Versioned endpoints respond', () => {
    it('GET /api/v1/agents returns 200', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/agents',
        });

        expect(res.statusCode).toBe(200);
    });

    it('GET /api/v1/agents/:id returns 200 with id', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/agents/test-123',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ id: 'test-123' });
    });
});
