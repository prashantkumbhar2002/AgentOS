process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/agentos';
process.env['JWT_SECRET'] =
  'test-jwt-secret-key-that-is-at-least-32-characters-long';
process.env['JWT_EXPIRES_IN'] = '8h';
process.env['NODE_ENV'] = 'test';
process.env['FRONTEND_URL'] = 'http://localhost:5173';
process.env['REDIS_URL'] = 'redis://localhost:6379';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { hashPassword } from '../users/users.service.js';
import { randomUUID } from 'node:crypto';

const ADMIN_USER = {
  email: 'test-audit-admin@agentos.dev',
  name: 'Audit Test Admin',
  role: 'admin',
  password: 'adminpassword123',
};

const VIEWER_USER = {
  email: 'test-audit-viewer@agentos.dev',
  name: 'Audit Test Viewer',
  role: 'viewer',
  password: 'viewerpassword123',
};

let app: FastifyInstance;
let agent: ReturnType<typeof supertest>;
let adminToken: string;
let viewerToken: string;
let testAgentId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  agent = supertest(app.server);

  const adminHash = await hashPassword(ADMIN_USER.password);
  const viewerHash = await hashPassword(VIEWER_USER.password);

  await app.prisma.user.upsert({
    where: { email: ADMIN_USER.email },
    update: { passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
    create: { email: ADMIN_USER.email, passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
  });

  await app.prisma.user.upsert({
    where: { email: VIEWER_USER.email },
    update: { passwordHash: viewerHash, name: VIEWER_USER.name, role: VIEWER_USER.role },
    create: { email: VIEWER_USER.email, passwordHash: viewerHash, name: VIEWER_USER.name, role: VIEWER_USER.role },
  });

  const testAgent = await app.prisma.agent.create({
    data: {
      name: 'Audit Test Agent',
      description: 'Agent for audit tests',
      ownerTeam: 'testing',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'LOW',
      environment: 'DEV',
      tags: [],
    },
  });
  testAgentId = testAgent.id;

  const adminLogin = await agent.post('/api/auth/login').send({ email: ADMIN_USER.email, password: ADMIN_USER.password });
  adminToken = adminLogin.body.accessToken;

  const viewerLogin = await agent.post('/api/auth/login').send({ email: VIEWER_USER.email, password: VIEWER_USER.password });
  viewerToken = viewerLogin.body.accessToken;
});

afterEach(async () => {
  await app.prisma.auditLog.deleteMany({ where: { agentId: testAgentId } });
});

afterAll(async () => {
  await app.prisma.auditLog.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentTool.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.approvalTicket.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentPolicy.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agent.deleteMany({ where: { id: testAgentId } });
  await app.prisma.user.deleteMany({
    where: { email: { in: [ADMIN_USER.email, VIEWER_USER.email] } },
  });
  await app.close();
});

const VALID_EVENT = {
  event: 'llm_call' as const,
  model: 'claude-sonnet-4-5',
  inputTokens: 1000,
  outputTokens: 500,
  latencyMs: 1200,
  success: true,
};

describe('POST /api/v1/audit/log', () => {
  it('returns 201 with server-calculated costUsd', async () => {
    const traceId = randomUUID();
    const res = await agent
      .post('/api/v1/audit/log')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.traceId).toBe(traceId);
    expect(res.body.costUsd).toBe(
      parseFloat((0.000003 * 1000 + 0.000015 * 500).toFixed(6)),
    );
  });

  it('returns 400 for validation errors', async () => {
    const res = await agent
      .post('/api/v1/audit/log')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ event: 'invalid_event' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 for non-existent agentId', async () => {
    const res = await agent
      .post('/api/v1/audit/log')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...VALID_EVENT,
        agentId: '00000000-0000-0000-0000-000000000000',
        traceId: randomUUID(),
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Agent not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await agent
      .post('/api/v1/audit/log')
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: randomUUID() });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/audit/logs', () => {
  it('returns paginated logs with totalCostUsd', async () => {
    const traceId = randomUUID();
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId });
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: randomUUID() });

    const res = await agent
      .get('/api/v1/audit/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('totalCostUsd');
    expect(res.body.totalCostUsd).toBeGreaterThan(0);
  });

  it('filters by agentId', async () => {
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: randomUUID() });

    const res = await agent
      .get(`/api/v1/audit/logs?agentId=${testAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const log of res.body.data) {
      expect(log.agentId).toBe(testAgentId);
    }
  });

  it('filters by event type', async () => {
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: randomUUID() });
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, event: 'tool_call', toolName: 'search', agentId: testAgentId, traceId: randomUUID() });

    const res = await agent
      .get('/api/v1/audit/logs?event=tool_call')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const log of res.body.data) {
      expect(log.event).toBe('tool_call');
    }
  });

  it('filters by success=false', async () => {
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: randomUUID(), success: false, errorMsg: 'test error' });

    const res = await agent
      .get('/api/v1/audit/logs?success=false')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const log of res.body.data) {
      expect(log.success).toBe(false);
    }
  });

  it('returns empty results for non-matching filters', async () => {
    const res = await agent
      .get(`/api/v1/audit/logs?agentId=00000000-0000-0000-0000-000000000099`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.totalCostUsd).toBe(0);
  });
});

describe('GET /api/v1/audit/traces/:traceId', () => {
  it('returns trace with ordered events and aggregates', async () => {
    const traceId = randomUUID();
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId });
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, event: 'tool_call', toolName: 'search', agentId: testAgentId, traceId, latencyMs: 300 });

    const res = await agent
      .get(`/api/v1/audit/traces/${traceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.traceId).toBe(traceId);
    expect(res.body.agentId).toBe(testAgentId);
    expect(res.body.agentName).toBe('Audit Test Agent');
    expect(res.body.events.length).toBe(2);
    expect(res.body.totalCost).toBeGreaterThan(0);
    expect(res.body.totalLatencyMs).toBe(1500);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 for non-existent trace', async () => {
    const res = await agent
      .get(`/api/v1/audit/traces/${randomUUID()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Trace not found' });
  });
});

describe('GET /api/v1/audit/logs?export=csv', () => {
  it('returns CSV for admin', async () => {
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: randomUUID() });

    const res = await agent
      .get('/api/v1/audit/logs?export=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('audit-export-');
    const lines = res.text.split('\n');
    expect(lines[0]).toBe('id,agentId,agentName,traceId,event,model,toolName,inputTokens,outputTokens,costUsd,latencyMs,success,createdAt');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('returns 403 for viewer', async () => {
    const res = await agent
      .get('/api/v1/audit/logs?export=csv')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/audit/stats/:agentId', () => {
  it('returns correct aggregations', async () => {
    const traceId1 = randomUUID();
    const traceId2 = randomUUID();
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: traceId1 });
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, event: 'tool_call', toolName: 'search', agentId: testAgentId, traceId: traceId1, latencyMs: 200 });
    await agent.post('/api/v1/audit/log').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_EVENT, agentId: testAgentId, traceId: traceId2, success: false, errorMsg: 'fail' });

    const res = await agent
      .get(`/api/v1/audit/stats/${testAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalRuns).toBe(2);
    expect(res.body.totalCalls).toBe(3);
    expect(res.body.totalCostUsd).toBeGreaterThan(0);
    expect(res.body.errorRate).toBeGreaterThan(0);
    expect(res.body.successRate).toBeLessThan(1);
    expect(Array.isArray(res.body.topTools)).toBe(true);
  });

  it('returns zero stats for agent with no logs', async () => {
    const cleanAgent = await app.prisma.agent.create({
      data: {
        name: 'Clean Agent',
        description: 'No logs',
        ownerTeam: 'testing',
        llmModel: 'claude-sonnet-4-5',
        riskTier: 'LOW',
        environment: 'DEV',
        tags: [],
      },
    });

    const res = await agent
      .get(`/api/v1/audit/stats/${cleanAgent.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalRuns).toBe(0);
    expect(res.body.totalCalls).toBe(0);
    expect(res.body.totalCostUsd).toBe(0);
    expect(res.body.topTools).toEqual([]);

    await app.prisma.agent.delete({ where: { id: cleanAgent.id } });
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await agent
      .get('/api/v1/audit/stats/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Agent not found' });
  });
});
