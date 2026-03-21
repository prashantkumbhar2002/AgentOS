import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import ssePlugin from './plugins/sse.js';
import bullmqPlugin from './plugins/bullmq.js';
import slackPlugin from './plugins/slack.js';
import usersRoutes from './modules/users/users.routes.js';
import agentsRoutes from './modules/agents/agents.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import approvalRoutes from './modules/approvals/approvals.routes.js';
import policyRoutes from './modules/policies/policies.routes.js';
import { env } from './config/env.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty' }
          : undefined,
    },
  });

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*',
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(ssePlugin);
  await fastify.register(bullmqPlugin);
  await fastify.register(slackPlugin);

  await fastify.register(usersRoutes, { prefix: '/api/auth' });
  await fastify.register(agentsRoutes, { prefix: '/api/agents' });
  await fastify.register(auditRoutes, { prefix: '/api/audit' });
  await fastify.register(approvalRoutes, { prefix: '/api/approvals' });
  await fastify.register(policyRoutes, { prefix: '/api/policies' });

  fastify.get('/api/events/stream', async (request, reply) => {
    const token = (request.query as Record<string, string>)['token'];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      await fastify.jwt.verify(token);
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const clientId = fastify.sse.addClient(reply);

    reply.raw.write(': connected\n\n');

    reply.raw.on('close', () => {
      fastify.sse.removeClient(clientId);
    });
  });

  fastify.get('/api/health', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  return fastify;
}
