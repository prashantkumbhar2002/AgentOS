import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import usersRoutes from './modules/users/users.routes.js';
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

  await fastify.register(usersRoutes, { prefix: '/api/auth' });

  fastify.get('/api/health', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  return fastify;
}
