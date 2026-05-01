import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { verifyAgentSseToken, verifyUserSseToken } from './sse-auth.js';
import { AuthenticationError } from '../errors/index.js';

const SECRET = 'test-sse-secret-that-is-long-enough-32chars!!';

describe('verifyAgentSseToken', () => {
    it('accepts a well-formed agent SSE token and returns the typed payload', () => {
        const agentId = randomUUID();
        const token = jwt.sign({ type: 'sse', agentId }, SECRET, { expiresIn: 30 });

        const result = verifyAgentSseToken(token, SECRET);

        expect(result.agentId).toBe(agentId);
        expect(result.type).toBe('sse');
    });

    it('rejects a user SSE token (carries userId/role, not agentId)', () => {
        const token = jwt.sign(
            { type: 'sse', userId: randomUUID(), role: 'admin' },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyAgentSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token mixing agent and user fields (defense in depth)', () => {
        const token = jwt.sign(
            { type: 'sse', agentId: randomUUID(), userId: randomUUID(), role: 'admin' },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyAgentSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token with non-UUID agentId', () => {
        const token = jwt.sign({ type: 'sse', agentId: 'not-a-uuid' }, SECRET, { expiresIn: 30 });

        expect(() => verifyAgentSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token without type=sse', () => {
        const token = jwt.sign({ agentId: randomUUID() }, SECRET, { expiresIn: 30 });

        expect(() => verifyAgentSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token with type other than sse', () => {
        const token = jwt.sign(
            { type: 'access', agentId: randomUUID() },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyAgentSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a forged token (wrong secret)', () => {
        const token = jwt.sign({ type: 'sse', agentId: randomUUID() }, 'wrong-secret', {
            expiresIn: 30,
        });

        expect(() => verifyAgentSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects an expired token with TOKEN_EXPIRED', () => {
        const token = jwt.sign({ type: 'sse', agentId: randomUUID() }, SECRET, {
            expiresIn: -1,
        });

        try {
            verifyAgentSseToken(token, SECRET);
            expect.fail('expected to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(AuthenticationError);
            expect((err as AuthenticationError).code).toBe('TOKEN_EXPIRED');
        }
    });

    it('rejects garbage strings', () => {
        expect(() => verifyAgentSseToken('not-a-jwt', SECRET)).toThrow(AuthenticationError);
        expect(() => verifyAgentSseToken('', SECRET)).toThrow(AuthenticationError);
    });
});

describe('verifyUserSseToken', () => {
    it('accepts a well-formed user SSE token and returns the typed payload', () => {
        const userId = randomUUID();
        const token = jwt.sign(
            { type: 'sse', userId, role: 'admin' },
            SECRET,
            { expiresIn: 30 },
        );

        const result = verifyUserSseToken(token, SECRET);

        expect(result.userId).toBe(userId);
        expect(result.role).toBe('admin');
        expect(result.type).toBe('sse');
    });

    it('rejects an agent SSE token (carries agentId, not userId/role)', () => {
        const token = jwt.sign(
            { type: 'sse', agentId: randomUUID() },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyUserSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token missing role', () => {
        const token = jwt.sign(
            { type: 'sse', userId: randomUUID() },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyUserSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token with empty role', () => {
        const token = jwt.sign(
            { type: 'sse', userId: randomUUID(), role: '' },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyUserSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects a token with non-UUID userId', () => {
        const token = jwt.sign(
            { type: 'sse', userId: 'not-a-uuid', role: 'admin' },
            SECRET,
            { expiresIn: 30 },
        );

        expect(() => verifyUserSseToken(token, SECRET)).toThrow(AuthenticationError);
    });

    it('rejects an expired token with TOKEN_EXPIRED', () => {
        const token = jwt.sign(
            { type: 'sse', userId: randomUUID(), role: 'admin' },
            SECRET,
            { expiresIn: -1 },
        );

        try {
            verifyUserSseToken(token, SECRET);
            expect.fail('expected to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(AuthenticationError);
            expect((err as AuthenticationError).code).toBe('TOKEN_EXPIRED');
        }
    });
});
