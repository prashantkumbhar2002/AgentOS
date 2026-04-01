import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import errorHandlerPlugin from './errorHandler.js';
import {
    AppError,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    ConflictError,
    ExternalServiceError,
} from '../errors/index.js';

async function buildTestApp() {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    return app;
}

describe('errorHandler plugin', () => {
    it('handles AppError with correct statusCode and shape', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new NotFoundError('Agent', 'abc-123');
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.error).toBe('NOT_FOUND');
        expect(body.message).toBe("Agent with id 'abc-123' not found");
        expect(body.requestId).toBeDefined();
        expect(body.details).toEqual({ resource: 'Agent', id: 'abc-123' });
    });

    it('handles ValidationError with 400', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new ValidationError('Bad input', { field: 'email' });
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.details).toEqual({ field: 'email' });
    });

    it('handles AuthenticationError with 401', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new AuthenticationError('TOKEN_EXPIRED');
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toBe('TOKEN_EXPIRED');
    });

    it('handles ConflictError with 409', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new ConflictError('Already exists');
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe('CONFLICT');
    });

    it('handles ExternalServiceError with 503', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new ExternalServiceError('Slack', 'timeout');
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.statusCode).toBe(503);
        expect(res.json().error).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('handles unknown errors with 500 and generic message', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new Error('Something broke internally');
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.statusCode).toBe(500);
        const body = res.json();
        expect(body.error).toBe('INTERNAL_ERROR');
        expect(body.requestId).toBeDefined();
    });

    it('always includes requestId in error responses', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new AppError('TEST', 'test', 418);
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        expect(res.json().requestId).toBeDefined();
        expect(typeof res.json().requestId).toBe('string');
    });

    it('omits details when AppError has no details', async () => {
        const app = await buildTestApp();
        app.get('/test', () => {
            throw new ValidationError('No details');
        });

        const res = await app.inject({ method: 'GET', url: '/test' });
        const body = res.json();
        expect(body).not.toHaveProperty('details');
    });
});
