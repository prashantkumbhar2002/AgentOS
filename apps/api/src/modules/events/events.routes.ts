import type { FastifyInstance, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import {
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ValidationError,
} from '../../errors/index.js';
import { authenticateAgentOrUser } from '../../plugins/auth.js';
import {
    verifyAgentSseToken,
    verifyUserSseToken,
} from '../../utils/sse-auth.js';

/**
 * SSE token query schema. We require exactly the shape we issue from
 * `POST /events/token` — extra params are tolerated for forward-compat,
 * but `token` must be present and a non-trivial string. Rejecting empty
 * strings here is meaningful because `(query['token'] ?? '')` would
 * otherwise pass the truthy guard with `?token=` (empty value).
 */
const SseQuerySchema = z.object({
    token: z.string().min(1),
});

/**
 * Agent stream additionally requires a UUID `ticketId`. We validate the
 * shape *before* any DB or JWT work to fail cheapest on malformed input
 * (e.g. `ticketId=<script>` injection attempts in logs / referers).
 */
const AgentStreamQuerySchema = SseQuerySchema.extend({
    ticketId: z.string().uuid(),
});

/** SSE handshake heartbeat — must be < typical proxy/LB idle (60s). */
const HEARTBEAT_MS = 15_000;

/** Idiomatic SSE write that respects the hijacked raw socket. */
function writeSseHeaders(reply: FastifyReply): void {
    const origin = env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*';
    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
    });
}

export default async function eventsRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { approvalService } = fastify.services;
    const agentOrUser = authenticateAgentOrUser(fastify);

    /**
     * Issue a short-lived SSE token. Bound to the caller's identity:
     *   - Agent (API key auth)  → `{ type: 'sse', agentId }`
     *   - User  (JWT auth)      → `{ type: 'sse', userId, role }`
     *
     * The 30-second TTL is intentionally short — the token is consumed
     * once on the next `EventSource` connect and the connection itself
     * provides the long-lived authorisation.
     */
    fastify.post(
        '/token',
        { preHandler: [agentOrUser] },
        async (request, reply) => {
            let payload: Record<string, unknown>;
            if (request.agent) {
                payload = { agentId: request.agent.id, type: 'sse' };
            } else {
                const { id, role } = request.user;
                payload = { userId: id, role, type: 'sse' };
            }
            const sseToken = jwt.sign(payload, env.SSE_SECRET, { expiresIn: 30 });
            return reply.status(200).send({ sseToken, expiresIn: 30 });
        },
    );

    /**
     * Per-ticket SSE stream for agents waiting on an approval decision.
     *
     * Hardened against the original bug (#1 in `Improvements_todo.md`):
     *   1. Token must be an *agent* SSE token (rejects user tokens via
     *      `verifyAgentSseToken`'s strict schema).
     *   2. `ticketId` must be a UUID (cheap rejection of malformed input).
     *   3. The ticket must exist and belong to the authenticating agent —
     *      this prevents an agent that knows another agent's `ticketId`
     *      from subscribing to that ticket's resolution.
     *   4. The per-client filter delivers only `approval.resolved` events
     *      whose payload matches BOTH `ticketId` AND `agentId` — defense
     *      in depth against any future event whose payload accidentally
     *      reuses a `ticketId` value.
     */
    fastify.get('/agent-stream', async (request, reply) => {
        const queryParsed = AgentStreamQuerySchema.safeParse(request.query);
        if (!queryParsed.success) {
            throw new ValidationError('Validation failed', { issues: queryParsed.error.issues });
        }
        const { token, ticketId } = queryParsed.data;

        const tokenPayload = verifyAgentSseToken(token, env.SSE_SECRET);
        const { agentId } = tokenPayload;

        const ticket = await approvalService.getTicket(ticketId);
        if (!ticket) {
            throw new NotFoundError('Ticket', ticketId);
        }
        if (ticket.agentId !== agentId) {
            throw new AuthorizationError('ticket scope');
        }

        reply.hijack();
        writeSseHeaders(reply);
        reply.raw.write(': connected\n\n');

        const clientId = fastify.sse.addClient(reply, (event) => {
            if (event.type !== 'approval.resolved') return false;
            const payload = event.payload as
                | { ticketId?: unknown; agentId?: unknown }
                | null
                | undefined;
            return (
                payload?.ticketId === ticketId &&
                payload?.agentId === agentId
            );
        });

        const heartbeat = setInterval(() => {
            try {
                reply.raw.write(': ping\n\n');
            } catch {
                clearInterval(heartbeat);
            }
        }, HEARTBEAT_MS);

        reply.raw.on('close', () => {
            clearInterval(heartbeat);
            fastify.sse.removeClient(clientId);
        });
    });

    /**
     * Dashboard firehose — receives every broadcast event. Restricted to
     * *user* SSE tokens; an agent token is rejected (agents must use
     * `/agent-stream`, not the firehose).
     */
    fastify.get('/stream', async (request, reply) => {
        const queryParsed = SseQuerySchema.safeParse(request.query);
        if (!queryParsed.success) {
            throw new AuthenticationError('TOKEN_MISSING');
        }
        const { token } = queryParsed.data;

        verifyUserSseToken(token, env.SSE_SECRET);

        reply.hijack();
        writeSseHeaders(reply);
        reply.raw.write(': connected\n\n');

        const clientId = fastify.sse.addClient(reply);

        reply.raw.on('close', () => {
            fastify.sse.removeClient(clientId);
        });
    });
}
