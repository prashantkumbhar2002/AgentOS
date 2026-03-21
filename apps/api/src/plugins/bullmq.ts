import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    notificationQueue: Queue;
  }
}

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username && parsed.username !== 'default'
      ? { username: decodeURIComponent(parsed.username) }
      : {}),
    maxRetriesPerRequest: null,
  };
}

export function getRedisConnection() {
  return parseRedisUrl(env.REDIS_URL);
}

export default fp(
  async (fastify: FastifyInstance) => {
    const connection = getRedisConnection();

    const notificationQueue = new Queue('notifications', { connection });

    fastify.decorate('notificationQueue', notificationQueue);

    fastify.addHook('onClose', async () => {
      await notificationQueue.close();
    });
  },
  { name: 'bullmq' },
);
