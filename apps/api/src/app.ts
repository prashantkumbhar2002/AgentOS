import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import ssePlugin from './plugins/sse.js';
import bullmqPlugin from './plugins/bullmq.js';
import slackPlugin from './plugins/slack.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import usersRoutes from './modules/users/users.routes.js';
import agentsRoutes from './modules/agents/agents.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import approvalRoutes from './modules/approvals/approvals.routes.js';
import policyRoutes from './modules/policies/policies.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import showcaseRoutes from './modules/showcase/showcase.routes.js';
import { createContainer } from './container.js';
import { env } from './config/env.js';
import { AuthenticationError } from './errors/index.js';
import { authenticate } from './plugins/auth.js';

export async function buildApp() {
    const fastify = Fastify({
        logger: {
            level: env.NODE_ENV === 'production' ? 'info' : 'debug',
            transport:
                env.NODE_ENV === 'development'
                    ? { target: 'pino-pretty' }
                    : undefined,
        },
        genReqId: (req) => {
            const clientId = req.headers['x-request-id'];
            if (typeof clientId === 'string' && clientId.length > 0) {
                return clientId.slice(0, 64);
            }
            return randomUUID();
        },
        requestIdHeader: false,
    });

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

    await fastify.register(cors, {
        origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*',
    });

    await fastify.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });

    fastify.addHook('onSend', async (request, reply) => {
        reply.header('x-request-id', request.id);
    });

    await fastify.register(prismaPlugin);

    const container = createContainer(fastify.prisma);
    fastify.decorate('services', container);

    await fastify.register(authPlugin);
    await fastify.register(errorHandlerPlugin);
    await fastify.register(ssePlugin);
    await fastify.register(bullmqPlugin);
    await fastify.register(slackPlugin);

    await fastify.register(usersRoutes, { prefix: '/api/auth' });
    await fastify.register(agentsRoutes, { prefix: '/api/v1/agents' });
    await fastify.register(auditRoutes, { prefix: '/api/v1/audit' });
    await fastify.register(approvalRoutes, { prefix: '/api/v1/approvals' });
    await fastify.register(policyRoutes, { prefix: '/api/v1/policies' });
    await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
    await fastify.register(showcaseRoutes, { prefix: '/api/v1/showcase' });

    fastify.post(
        '/api/v1/events/token',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const { id, role } = request.user;
            const sseToken = jwt.sign(
                { userId: id, role, type: 'sse' },
                env.SSE_SECRET,
                { expiresIn: 30 },
            );
            return reply.status(200).send({ sseToken, expiresIn: 30 });
        },
    );

    fastify.get('/api/v1/events/stream', async (request, reply) => {
        const token = (request.query as Record<string, string>)['token'];
        if (!token) {
            throw new AuthenticationError('TOKEN_MISSING');
        }

        try {
            const payload = jwt.verify(token, env.SSE_SECRET) as { type?: string };
            if (payload.type !== 'sse') {
                throw new Error('Not an SSE token');
            }
        } catch {
            throw new AuthenticationError('TOKEN_INVALID');
        }

        reply.hijack();

        const origin = env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*';
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
        });

        const clientId = fastify.sse.addClient(reply);

        reply.raw.write(': connected\n\n');

        reply.raw.on('close', () => {
            fastify.sse.removeClient(clientId);
        });
    });

    // 301 redirects: old unversioned paths → /api/v1/...
    const VERSIONED_PREFIXES = ['agents', 'audit', 'approvals', 'policies', 'analytics', 'showcase', 'events'];
    for (const prefix of VERSIONED_PREFIXES) {
        fastify.all(`/api/${prefix}`, async (request, reply) => {
            const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
            return reply.status(301).redirect(`/api/v1/${prefix}${search}`);
        });
        fastify.all(`/api/${prefix}/*`, async (request, reply) => {
            const newUrl = request.url.replace(`/api/${prefix}`, `/api/v1/${prefix}`);
            return reply.status(301).redirect(newUrl);
        });
    }

    fastify.get('/api/health', async (_request, reply) => {
        return reply.status(200).send({ status: 'ok' });
    });

    return fastify;
}
