import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuthenticationError } from '../errors/index.js';

/**
 * SSE token payloads come in two shapes (issued by `POST /api/v1/events/token`):
 *
 *   - Agent token: `{ type: 'sse', agentId }` — used by the SDK on `/events/agent-stream`.
 *   - User token:  `{ type: 'sse', userId, role }` — used by the dashboard on `/events/stream`.
 *
 * Each route accepts ONLY its own shape. Without this discrimination an agent
 * SSE token would let the holder subscribe to the dashboard firehose, and a
 * user SSE token would let the holder subscribe to any agent's per-ticket
 * stream as long as they could guess a `ticketId`. Both schemas therefore
 * forbid the *other* identity field via `.strict()` semantics on `safeParse`.
 */

const AgentSseTokenSchema = z
    .object({
        type: z.literal('sse'),
        agentId: z.string().uuid(),
    })
    .strict();

const UserSseTokenSchema = z
    .object({
        type: z.literal('sse'),
        userId: z.string().uuid(),
        role: z.string().min(1),
    })
    .strict();

export type AgentSseToken = z.infer<typeof AgentSseTokenSchema>;
export type UserSseToken = z.infer<typeof UserSseTokenSchema>;

/**
 * Strip JWT housekeeping claims (`iat`, `exp`, `nbf`, `iss`, `aud`, `sub`,
 * `jti`) before strict schema validation so a `.strict()` schema doesn't
 * reject every legitimate token. The caller still gets a fully typed,
 * unknown-key-free payload back.
 */
function stripJwtClaims(payload: Record<string, unknown>): Record<string, unknown> {
    const { iat: _iat, exp: _exp, nbf: _nbf, iss: _iss, aud: _aud, sub: _sub, jti: _jti, ...rest } = payload;
    return rest;
}

function verifyAndDecode(token: string, secret: string): Record<string, unknown> {
    try {
        const decoded = jwt.verify(token, secret);
        if (typeof decoded !== 'object' || decoded === null) {
            throw new AuthenticationError('TOKEN_INVALID');
        }
        return decoded as Record<string, unknown>;
    } catch (err) {
        if (err instanceof AuthenticationError) throw err;
        const code = (err as { name?: string }).name;
        if (code === 'TokenExpiredError') {
            throw new AuthenticationError('TOKEN_EXPIRED');
        }
        throw new AuthenticationError('TOKEN_INVALID');
    }
}

/**
 * Verify a token issued for an *agent* SSE subscription.
 *
 * Throws `AuthenticationError('TOKEN_EXPIRED' | 'TOKEN_INVALID')` if the
 * signature is bad, the payload is the wrong shape (missing `agentId`,
 * carries `userId`/`role`, etc.), or the token has expired.
 */
export function verifyAgentSseToken(token: string, secret: string): AgentSseToken {
    const decoded = verifyAndDecode(token, secret);
    const parsed = AgentSseTokenSchema.safeParse(stripJwtClaims(decoded));
    if (!parsed.success) {
        throw new AuthenticationError('TOKEN_INVALID');
    }
    return parsed.data;
}

/**
 * Verify a token issued for a *user* SSE subscription (dashboard firehose).
 *
 * Throws `AuthenticationError('TOKEN_EXPIRED' | 'TOKEN_INVALID')` if the
 * signature is bad, the payload is the wrong shape (missing `userId`/`role`,
 * carries `agentId`, etc.), or the token has expired.
 */
export function verifyUserSseToken(token: string, secret: string): UserSseToken {
    const decoded = verifyAndDecode(token, secret);
    const parsed = UserSseTokenSchema.safeParse(stripJwtClaims(decoded));
    if (!parsed.success) {
        throw new AuthenticationError('TOKEN_INVALID');
    }
    return parsed.data;
}
