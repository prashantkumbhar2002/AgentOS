import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { randomUUID } from 'node:crypto';

async function buildMinimalApp() {
    const app = Fastify({
        logger: false,
        genReqId: (req) => {
            const clientId = req.headers['x-request-id'];
            if (typeof clientId === 'string' && clientId.length > 0) {
                return clientId.slice(0, 64);
            }
            return randomUUID();
        },
        requestIdHeader: false,
    });

    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    });

    app.addHook('onSend', async (request, reply) => {
        reply.header('x-request-id', request.id);
    });

    app.get('/test', async () => ({ ok: true }));

    return app;
}

describe('Security Headers', () => {
    it('includes X-Frame-Options header', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('includes X-Content-Type-Options header', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('includes Content-Security-Policy header', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['content-security-policy']).toBeDefined();
        expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('includes Strict-Transport-Security header', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('includes X-DNS-Prefetch-Control header', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['x-dns-prefetch-control']).toBeDefined();
    });

    it('includes X-Permitted-Cross-Domain-Policies header', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['x-permitted-cross-domain-policies']).toBeDefined();
    });
});

describe('Request ID', () => {
    it('includes x-request-id in response headers', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.headers['x-request-id']).toBeDefined();
        expect(typeof res.headers['x-request-id']).toBe('string');
    });

    it('passes through client-provided x-request-id', async () => {
        const app = await buildMinimalApp();
        const clientId = 'my-custom-trace-id-123';
        const res = await app.inject({
            method: 'GET',
            url: '/test',
            headers: { 'x-request-id': clientId },
        });
        expect(res.headers['x-request-id']).toBe(clientId);
    });

    it('truncates long x-request-id to 64 characters', async () => {
        const app = await buildMinimalApp();
        const longId = 'a'.repeat(128);
        const res = await app.inject({
            method: 'GET',
            url: '/test',
            headers: { 'x-request-id': longId },
        });
        expect((res.headers['x-request-id'] as string).length).toBe(64);
    });

    it('generates UUID when no x-request-id provided', async () => {
        const app = await buildMinimalApp();
        const res = await app.inject({ method: 'GET', url: '/test' });
        const id = res.headers['x-request-id'] as string;
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
});
