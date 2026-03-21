import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@agentos/types';
import { env } from '../config/env.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; name: string; role: Role };
    user: { id: string; email: string; name: string; role: Role };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    await request.jwtVerify();
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message.includes('expired')) {
      return reply.status(401).send({ error: 'Token expired' });
    }
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

export function requireRole(roles: Role | Role[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const userRole = request.user.role;
    if (!allowed.includes(userRole)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(fastifyJwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: env.JWT_EXPIRES_IN },
    });
  },
  { name: 'auth', dependencies: ['prisma'] },
);
