import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@agentos/types';
import { env } from '../config/env.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { hashAgentApiKey, looksLikeAgentApiKey } from '../utils/api-key.js';

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: { id: string; email: string; name: string; role: Role };
        user: { id: string; email: string; name: string; role: Role };
    }
}

declare module 'fastify' {
    interface FastifyRequest {
        agent?: { id: string; name: string; status: string };
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

/**
 * Accepts either a user JWT (`request.user`) or an agent API key
 * (`request.agent`). At least one will be populated on success.
 *
 * Use this for endpoints called by both the dashboard (JWT) and the SDK
 * (agent API key): /audit/log, /audit/batch, /approvals (POST), /approvals/:id
 * (GET), /policies/check, /events/token.
 */
export function authenticateAgentOrUser(fastify: FastifyInstance) {
    return async function (
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            throw new AuthenticationError('TOKEN_MISSING');
        }

        const token = authHeader.replace(/^Bearer\s+/i, '');

        if (looksLikeAgentApiKey(token)) {
            const principal = await fastify.services.agentRepo.findByApiKeyHash(
                hashAgentApiKey(token),
            );
            if (!principal) {
                throw new AuthenticationError('TOKEN_INVALID');
            }
            if (principal.status === 'SUSPENDED' || principal.status === 'DEPRECATED') {
                throw new AuthenticationError('TOKEN_INVALID');
            }
            request.agent = principal;
            return;
        }

        await authenticate(request, reply);
    };
}

/**
 * Helper for routes that accept agent or user auth and need to ensure the
 * caller is allowed to act on a specific agentId. When authenticated as an
 * agent, the agentId in the body must match.
 */
export function assertAgentScope(
    request: FastifyRequest,
    agentId: string,
): void {
    if (request.agent && request.agent.id !== agentId) {
        throw new AuthorizationError('agent scope');
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
