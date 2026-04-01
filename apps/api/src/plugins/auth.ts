import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@agentos/types';
import { env } from '../config/env.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: { id: string; email: string; name: string; role: Role };
        user: { id: string; email: string; name: string; role: Role };
    }
}

export async function authenticate(
    request: FastifyRequest,
    _reply: FastifyReply,
): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        throw new AuthenticationError('TOKEN_MISSING');
    }

    try {
        await request.jwtVerify();
    } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
            throw new AuthenticationError('TOKEN_EXPIRED');
        }
        throw new AuthenticationError('TOKEN_INVALID');
    }
}

export function requireRole(roles: Role | Role[]) {
    const allowed = Array.isArray(roles) ? roles : [roles];

    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        await authenticate(request, reply);

        const userRole = request.user.role;
        if (!allowed.includes(userRole)) {
            throw new AuthorizationError(allowed.join(', '));
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
