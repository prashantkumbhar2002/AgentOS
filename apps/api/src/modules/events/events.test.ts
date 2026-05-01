process.env['DATABASE_URL'] =
    process.env['DATABASE_URL'] ??
    'postgresql://postgres:postgres@localhost:5432/agentos';
process.env['JWT_SECRET'] =
    'test-jwt-secret-key-that-is-at-least-32-characters-long';
process.env['JWT_EXPIRES_IN'] = '8h';
process.env['NODE_ENV'] = 'test';
process.env['FRONTEND_URL'] = 'http://localhost:5173';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['SSE_SECRET'] =
    process.env['SSE_SECRET'] ??
    'test-sse-secret-that-is-long-enough-32chars!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { hashPassword } from '../users/users.service.js';
import { generateAgentApiKey } from '../../utils/api-key.js';

const ADMIN_USER = {
    email: 'test-events-admin@agentos.dev',
    name: 'Events Test Admin',
    role: 'admin',
    password: 'eventsadminpw123',
};

const SSE_SECRET = process.env['SSE_SECRET']!;

const TEST_AGENT_A = {
    name: 'Events Test Agent A',
    description: 'Agent A for SSE gate tests',
    ownerTeam: 'engineering',
    llmModel: 'claude-sonnet-4-5',
    riskTier: 'MEDIUM' as const,
    environment: 'DEV' as const,
    tools: [{ name: 'test-tool', description: 'A tool for testing' }],
    tags: ['test', 'events'],
};

const TEST_AGENT_B = {
    ...TEST_AGENT_A,
    name: 'Events Test Agent B',
    description: 'Agent B for SSE gate tests',
};

let app: FastifyInstance;
let api: ReturnType<typeof supertest>;
let adminToken: string;
let agentAId: string;
let agentBId: string;
let agentAApiKey: string;
let pendingTicketIdForAgentA: string;

beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    api = supertest(app.server);

    const adminHash = await hashPassword(ADMIN_USER.password);
    await app.prisma.user.upsert({
        where: { email: ADMIN_USER.email },
        update: { passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
        create: {
            email: ADMIN_USER.email,
            passwordHash: adminHash,
            name: ADMIN_USER.name,
            role: ADMIN_USER.role,
        },
    });

    const adminLogin = await api.post('/api/auth/login').send({
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
    });
    adminToken = adminLogin.body.accessToken;

    const agentAResp = await api
        .post('/api/v1/agents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_AGENT_A);
    agentAId = agentAResp.body.id;

    const agentBResp = await api
        .post('/api/v1/agents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEST_AGENT_B);
    agentBId = agentBResp.body.id;

    // Provision Agent A's API key directly so the token-issuance test can
    // call /events/token as an agent. Agent B exists only as a foreign
    // owner reference for the cross-agent scope test, so we move it to
    // ACTIVE without an API key.
    const agentAKey = generateAgentApiKey();
    agentAApiKey = agentAKey.apiKey;

    await app.prisma.agent.update({
        where: { id: agentAId },
        data: { apiKeyHash: agentAKey.hash, apiKeyHint: agentAKey.hint, status: 'ACTIVE' },
    });
    await app.prisma.agent.update({
        where: { id: agentBId },
        data: { status: 'ACTIVE' },
    });

    // Seed a pending approval ticket on agent A. Created directly in the DB
    // because the /approvals POST path consults the policy engine and may
    // auto-approve depending on default policies — we just need a PENDING
    // ticket to exist for the ownership tests.
    const ticket = await app.prisma.approvalTicket.create({
        data: {
            agentId: agentAId,
            actionType: 'send_email',
            payload: { to: 'someone@example.com', subject: 'test' },
            riskScore: 0.6,
            reasoning: 'integration test',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
    });
    pendingTicketIdForAgentA = ticket.id;
});

afterAll(async () => {
    await app.prisma.approvalTicket.deleteMany({
        where: { agentId: { in: [agentAId, agentBId] } },
    });
    await app.prisma.auditLog.deleteMany({
        where: { agentId: { in: [agentAId, agentBId] } },
    });
    await app.prisma.agentTool.deleteMany({
        where: { agentId: { in: [agentAId, agentBId] } },
    });
    await app.prisma.agentPolicy.deleteMany({
        where: { agentId: { in: [agentAId, agentBId] } },
    });
    await app.prisma.agent.deleteMany({
        where: { id: { in: [agentAId, agentBId] } },
    });
    await app.prisma.user.deleteMany({ where: { email: ADMIN_USER.email } });
    await app.close();
});

function signSseToken(payload: Record<string, unknown>, expiresIn: string | number = 30): string {
    return jwt.sign(payload, SSE_SECRET, { expiresIn } as jwt.SignOptions);
}

describe('POST /api/v1/events/token', () => {
    it('issues a user-shaped SSE token for a JWT-authenticated user', async () => {
        const res = await api
            .post('/api/v1/events/token')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.sseToken).toBeDefined();
        expect(res.body.expiresIn).toBe(30);

        const decoded = jwt.verify(res.body.sseToken, SSE_SECRET) as Record<string, unknown>;
        expect(decoded['type']).toBe('sse');
        expect(decoded['userId']).toBeDefined();
        expect(decoded['role']).toBeDefined();
        expect(decoded['agentId']).toBeUndefined();
    });

    it('issues an agent-shaped SSE token for an API-key-authenticated agent', async () => {
        const res = await api
            .post('/api/v1/events/token')
            .set('Authorization', `Bearer ${agentAApiKey}`);

        expect(res.statusCode).toBe(200);
        const decoded = jwt.verify(res.body.sseToken, SSE_SECRET) as Record<string, unknown>;
        expect(decoded['type']).toBe('sse');
        expect(decoded['agentId']).toBe(agentAId);
        expect(decoded['userId']).toBeUndefined();
        expect(decoded['role']).toBeUndefined();
    });

    it('rejects unauthenticated callers', async () => {
        const res = await api.post('/api/v1/events/token');
        expect(res.statusCode).toBe(401);
    });
});

describe('GET /api/v1/events/agent-stream — auth & scope gates', () => {
    it('rejects when token is missing', async () => {
        const res = await api.get(
            `/api/v1/events/agent-stream?ticketId=${pendingTicketIdForAgentA}`,
        );
        expect(res.statusCode).toBe(400);
    });

    it('rejects when ticketId is missing', async () => {
        const sseToken = signSseToken({ type: 'sse', agentId: agentAId });
        const res = await api.get(`/api/v1/events/agent-stream?token=${sseToken}`);
        expect(res.statusCode).toBe(400);
    });

    it('rejects malformed (non-UUID) ticketId without touching the DB', async () => {
        const sseToken = signSseToken({ type: 'sse', agentId: agentAId });
        const res = await api.get(
            `/api/v1/events/agent-stream?token=${sseToken}&ticketId=not-a-uuid`,
        );
        expect(res.statusCode).toBe(400);
    });

    it('rejects a user SSE token (must be agent-shaped)', async () => {
        const userSseToken = signSseToken({
            type: 'sse',
            userId: randomUUID(),
            role: 'admin',
        });
        const res = await api.get(
            `/api/v1/events/agent-stream?token=${userSseToken}&ticketId=${pendingTicketIdForAgentA}`,
        );
        expect(res.statusCode).toBe(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
        const forged = jwt.sign(
            { type: 'sse', agentId: agentAId },
            'a-different-secret-of-sufficient-length-32',
            { expiresIn: 30 },
        );
        const res = await api.get(
            `/api/v1/events/agent-stream?token=${forged}&ticketId=${pendingTicketIdForAgentA}`,
        );
        expect(res.statusCode).toBe(401);
    });

    it('rejects an expired SSE token', async () => {
        const expired = signSseToken({ type: 'sse', agentId: agentAId }, -1);
        const res = await api.get(
            `/api/v1/events/agent-stream?token=${expired}&ticketId=${pendingTicketIdForAgentA}`,
        );
        expect(res.statusCode).toBe(401);
    });

    it('returns 404 for a syntactically-valid but unknown ticketId', async () => {
        const sseToken = signSseToken({ type: 'sse', agentId: agentAId });
        const res = await api.get(
            `/api/v1/events/agent-stream?token=${sseToken}&ticketId=${randomUUID()}`,
        );
        expect(res.statusCode).toBe(404);
    });

    it('returns 403 when the ticket belongs to a different agent (the headline bug)', async () => {
        // Agent B holds a perfectly valid SSE token but tries to subscribe
        // to a ticket that belongs to agent A. Before this fix the filter
        // would happily forward agent A's `approval.resolved` event.
        const agentBSseToken = signSseToken({ type: 'sse', agentId: agentBId });
        const res = await api.get(
            `/api/v1/events/agent-stream?token=${agentBSseToken}&ticketId=${pendingTicketIdForAgentA}`,
        );
        expect(res.statusCode).toBe(403);
    });
});

describe('GET /api/v1/events/stream — dashboard firehose gates', () => {
    it('rejects when token is missing', async () => {
        const res = await api.get('/api/v1/events/stream');
        expect(res.statusCode).toBe(401);
    });

    it('rejects an agent SSE token (must be user-shaped)', async () => {
        const agentSseToken = signSseToken({ type: 'sse', agentId: agentAId });
        const res = await api.get(`/api/v1/events/stream?token=${agentSseToken}`);
        expect(res.statusCode).toBe(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
        const forged = jwt.sign(
            { type: 'sse', userId: randomUUID(), role: 'admin' },
            'a-different-secret-of-sufficient-length-32',
            { expiresIn: 30 },
        );
        const res = await api.get(`/api/v1/events/stream?token=${forged}`);
        expect(res.statusCode).toBe(401);
    });

    it('rejects an expired user SSE token', async () => {
        const expired = signSseToken(
            { type: 'sse', userId: randomUUID(), role: 'admin' },
            -1,
        );
        const res = await api.get(`/api/v1/events/stream?token=${expired}`);
        expect(res.statusCode).toBe(401);
    });

    it('rejects a token without type=sse', async () => {
        const noType = jwt.sign(
            { userId: randomUUID(), role: 'admin' },
            SSE_SECRET,
            { expiresIn: 30 },
        );
        const res = await api.get(`/api/v1/events/stream?token=${noType}`);
        expect(res.statusCode).toBe(401);
    });
});
