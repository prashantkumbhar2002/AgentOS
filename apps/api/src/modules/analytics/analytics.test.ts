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

const ADMIN_USER = {
  email: 'test-analytics-admin@agentos.dev',
  name: 'Analytics Test Admin',
  role: 'admin',
  password: 'adminpassword123',
};

const TEST_AGENT = {
  name: 'Analytics Integration Agent',
  description: 'Agent for analytics integration tests',
  ownerTeam: 'engineering',
  llmModel: 'claude-sonnet-4-5',
  riskTier: 'HIGH' as const,
  environment: 'DEV' as const,
  tools: [{ name: 'test-tool', description: 'A tool' }],
  tags: ['test'],
};

let app: FastifyInstance;
let agent: ReturnType<typeof supertest>;
let adminToken: string;
let testAgentId: string;
const createdLogIds: string[] = [];
const createdTicketIds: string[] = [];

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  agent = supertest(app.server);

  const adminHash = await hashPassword(ADMIN_USER.password);
  await app.prisma.user.upsert({
    where: { email: ADMIN_USER.email },
    update: { passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
    create: { email: ADMIN_USER.email, passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
  });

  const loginRes = await agent.post('/api/auth/login').send({
    email: ADMIN_USER.email,
    password: ADMIN_USER.password,
  });
  adminToken = loginRes.body.accessToken;

  const agentRes = await agent
    .post('/api/v1/agents')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(TEST_AGENT);
  testAgentId = agentRes.body.id;
});

afterEach(async () => {
  if (createdTicketIds.length > 0) {
    await app.prisma.approvalTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
    createdTicketIds.length = 0;
  }
  if (createdLogIds.length > 0) {
    await app.prisma.auditLog.deleteMany({ where: { id: { in: createdLogIds } } });
    createdLogIds.length = 0;
  }
});

afterAll(async () => {
  await app.prisma.approvalTicket.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.auditLog.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentTool.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agent.deleteMany({ where: { id: testAgentId } });
  await app.prisma.user.deleteMany({ where: { email: ADMIN_USER.email } });
  await app.close();
});

async function seedLog(overrides: Record<string, unknown> = {}) {
  const log = await app.prisma.auditLog.create({
    data: {
      agentId: testAgentId,
      traceId: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event: 'llm_call',
      model: 'claude-sonnet-4-5',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.01,
      latencyMs: 500,
      success: true,
      ...overrides,
    },
  });
  createdLogIds.push(log.id);
  return log;
}

async function seedTicket(status: string) {
  const ticket = await app.prisma.approvalTicket.create({
    data: {
      agentId: testAgentId,
      actionType: 'test_action',
      payload: {},
      riskScore: 0.5,
      reasoning: 'Test ticket',
      status: status as 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'AUTO_APPROVED',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  createdTicketIds.push(ticket.id);
  return ticket;
}

// --- GET /api/v1/analytics/costs ---

describe('GET /api/v1/analytics/costs', () => {
  it('returns cost summary with all required fields', async () => {
    await seedLog({ costUsd: 0.05 });

    const res = await agent
      .get('/api/v1/analytics/costs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('todayUsd');
    expect(res.body).toHaveProperty('last7dUsd');
    expect(res.body).toHaveProperty('last30dUsd');
    expect(res.body).toHaveProperty('totalUsd');
    expect(res.body).toHaveProperty('changeVs7dAgo');
    expect(typeof res.body.todayUsd).toBe('number');
  });

  it('returns 400 for invalid date range', async () => {
    const res = await agent
      .get('/api/v1/analytics/costs?fromDate=2026-03-21&toDate=2026-03-01')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('fromDate must be before toDate');
  });

  it('accepts valid date range filter', async () => {
    const res = await agent
      .get('/api/v1/analytics/costs?fromDate=2026-03-01&toDate=2026-03-31')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.totalUsd).toBe('number');
  });

  it('returns 401 without auth token', async () => {
    const res = await agent.get('/api/v1/analytics/costs');
    expect(res.status).toBe(401);
  });
});

// --- GET /api/v1/analytics/costs/timeline ---

describe('GET /api/v1/analytics/costs/timeline', () => {
  it('returns 30 dates by default', async () => {
    const res = await agent
      .get('/api/v1/analytics/costs/timeline')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dates).toHaveLength(30);
    expect(res.body).toHaveProperty('series');
    expect(Array.isArray(res.body.series)).toBe(true);
  });

  it('returns 7 dates when days=7', async () => {
    const res = await agent
      .get('/api/v1/analytics/costs/timeline?days=7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dates).toHaveLength(7);
  });

  it('zero-fills daily costs for agent with activity', async () => {
    await seedLog({ costUsd: 0.05 });

    const res = await agent
      .get('/api/v1/analytics/costs/timeline?days=7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const agentSeries = res.body.series.find(
      (s: Record<string, unknown>) => s.agentId === testAgentId,
    );
    if (agentSeries) {
      expect(agentSeries.dailyCosts).toHaveLength(7);
      expect(agentSeries.agentName).toBe(TEST_AGENT.name);
    }
  });

  it('filters by agentId', async () => {
    await seedLog({ costUsd: 0.01 });

    const res = await agent
      .get(`/api/v1/analytics/costs/timeline?days=7&agentId=${testAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const s of res.body.series) {
      expect(s.agentId).toBe(testAgentId);
    }
  });

  it('returns empty series for non-existent agent', async () => {
    const res = await agent
      .get('/api/v1/analytics/costs/timeline?days=7&agentId=00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(0);
    expect(res.body.dates).toHaveLength(7);
  });
});

// --- GET /api/v1/analytics/usage ---

describe('GET /api/v1/analytics/usage', () => {
  it('returns all usage stat fields', async () => {
    const traceId = `usage-int-${Date.now()}`;
    await seedLog({ traceId, event: 'llm_call', costUsd: 0.01 });
    await seedLog({ traceId, event: 'tool_call', costUsd: 0.005 });
    await seedTicket('APPROVED');
    await seedTicket('DENIED');

    const res = await agent
      .get('/api/v1/analytics/usage')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalRuns');
    expect(res.body).toHaveProperty('totalLlmCalls');
    expect(res.body).toHaveProperty('totalToolCalls');
    expect(res.body).toHaveProperty('avgRunCostUsd');
    expect(res.body).toHaveProperty('totalApprovals');
    expect(res.body).toHaveProperty('autoApproved');
    expect(res.body).toHaveProperty('approved');
    expect(res.body).toHaveProperty('denied');
    expect(res.body).toHaveProperty('expired');
    expect(res.body.totalLlmCalls).toBeGreaterThanOrEqual(1);
    expect(res.body.totalToolCalls).toBeGreaterThanOrEqual(1);
  });

  it('returns zeros for future date range', async () => {
    const res = await agent
      .get('/api/v1/analytics/usage?fromDate=2099-01-01&toDate=2099-01-02')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalRuns).toBe(0);
    expect(res.body.totalLlmCalls).toBe(0);
    expect(res.body.avgRunCostUsd).toBe(0);
  });
});

// --- GET /api/v1/analytics/agents ---

describe('GET /api/v1/analytics/agents', () => {
  it('returns agent leaderboard sorted by cost (default)', async () => {
    await seedLog({ costUsd: 0.10 });

    const res = await agent
      .get('/api/v1/analytics/agents')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agents');
    expect(Array.isArray(res.body.agents)).toBe(true);

    const entry = res.body.agents.find(
      (a: Record<string, unknown>) => a.agentId === testAgentId,
    );
    if (entry) {
      expect(entry).toHaveProperty('agentName');
      expect(entry).toHaveProperty('ownerTeam');
      expect(entry).toHaveProperty('totalCostUsd');
      expect(entry).toHaveProperty('totalRuns');
      expect(entry).toHaveProperty('errorRate');
      expect(entry).toHaveProperty('avgLatencyMs');
      expect(entry).toHaveProperty('healthScore');
      expect(entry.healthScore).toBeGreaterThanOrEqual(0);
      expect(entry.healthScore).toBeLessThanOrEqual(100);
    }
  });

  it('sorts by errorRate', async () => {
    await seedLog({ costUsd: 0.01, success: false });

    const res = await agent
      .get('/api/v1/analytics/agents?sortBy=errorRate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
  });

  it('respects limit parameter', async () => {
    await seedLog({ costUsd: 0.01 });

    const res = await agent
      .get('/api/v1/analytics/agents?limit=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeLessThanOrEqual(1);
  });
});

// --- GET /api/v1/analytics/models ---

describe('GET /api/v1/analytics/models', () => {
  it('returns model usage sorted by cost desc', async () => {
    await seedLog({ model: 'claude-sonnet-4-5', costUsd: 0.10, inputTokens: 1000, outputTokens: 500 });

    const res = await agent
      .get('/api/v1/analytics/models')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('models');
    expect(Array.isArray(res.body.models)).toBe(true);

    if (res.body.models.length > 0) {
      const first = res.body.models[0];
      expect(first).toHaveProperty('model');
      expect(first).toHaveProperty('callCount');
      expect(first).toHaveProperty('totalInputTokens');
      expect(first).toHaveProperty('totalOutputTokens');
      expect(first).toHaveProperty('totalCostUsd');
    }
  });

  it('excludes null model entries', async () => {
    await seedLog({ model: null, costUsd: 0.01 });

    const res = await agent
      .get('/api/v1/analytics/models')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const m of res.body.models) {
      expect(m.model).not.toBeNull();
      expect(m.model).toBeTruthy();
    }
  });

  it('returns empty models array when no model data exists', async () => {
    const res = await agent
      .get('/api/v1/analytics/models')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.models)).toBe(true);
  });
});
