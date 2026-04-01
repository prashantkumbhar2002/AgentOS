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
  email: 'test-agent-admin@agentos.dev',
  name: 'Agent Test Admin',
  role: 'admin',
  password: 'adminpassword123',
};

const APPROVER_USER = {
  email: 'test-agent-approver@agentos.dev',
  name: 'Agent Test Approver',
  role: 'approver',
  password: 'approverpassword123',
};

const VIEWER_USER = {
  email: 'test-agent-viewer@agentos.dev',
  name: 'Agent Test Viewer',
  role: 'viewer',
  password: 'viewerpassword123',
};

const VALID_AGENT = {
  name: 'Test Agent',
  description: 'A test agent for integration tests',
  ownerTeam: 'engineering',
  llmModel: 'claude-sonnet-4-5',
  riskTier: 'MEDIUM' as const,
  environment: 'DEV' as const,
  tools: [{ name: 'search', description: 'Web search tool' }],
  tags: ['test'],
};

let app: FastifyInstance;
let agent: ReturnType<typeof supertest>;
let adminToken: string;
let approverToken: string;
let viewerToken: string;
const createdAgentIds: string[] = [];

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  agent = supertest(app.server);

  const adminHash = await hashPassword(ADMIN_USER.password);
  const approverHash = await hashPassword(APPROVER_USER.password);
  const viewerHash = await hashPassword(VIEWER_USER.password);

  await app.prisma.user.upsert({
    where: { email: ADMIN_USER.email },
    update: { passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
    create: { email: ADMIN_USER.email, passwordHash: adminHash, name: ADMIN_USER.name, role: ADMIN_USER.role },
  });

  await app.prisma.user.upsert({
    where: { email: APPROVER_USER.email },
    update: { passwordHash: approverHash, name: APPROVER_USER.name, role: APPROVER_USER.role },
    create: { email: APPROVER_USER.email, passwordHash: approverHash, name: APPROVER_USER.name, role: APPROVER_USER.role },
  });

  await app.prisma.user.upsert({
    where: { email: VIEWER_USER.email },
    update: { passwordHash: viewerHash, name: VIEWER_USER.name, role: VIEWER_USER.role },
    create: { email: VIEWER_USER.email, passwordHash: viewerHash, name: VIEWER_USER.name, role: VIEWER_USER.role },
  });

  const adminLogin = await agent.post('/api/auth/login').send({ email: ADMIN_USER.email, password: ADMIN_USER.password });
  adminToken = adminLogin.body.accessToken;

  const approverLogin = await agent.post('/api/auth/login').send({ email: APPROVER_USER.email, password: APPROVER_USER.password });
  approverToken = approverLogin.body.accessToken;

  const viewerLogin = await agent.post('/api/auth/login').send({ email: VIEWER_USER.email, password: VIEWER_USER.password });
  viewerToken = viewerLogin.body.accessToken;
});

afterEach(async () => {
  for (const id of createdAgentIds) {
    await app.prisma.agentTool.deleteMany({ where: { agentId: id } });
    await app.prisma.auditLog.deleteMany({ where: { agentId: id } });
    await app.prisma.approvalTicket.deleteMany({ where: { agentId: id } });
    await app.prisma.agentPolicy.deleteMany({ where: { agentId: id } });
    await app.prisma.agent.deleteMany({ where: { id } });
  }
  createdAgentIds.length = 0;
});

afterAll(async () => {
  await app.prisma.user.deleteMany({
    where: { email: { in: [ADMIN_USER.email, APPROVER_USER.email, VIEWER_USER.email] } },
  });
  await app.close();
});

async function createTestAgent(overrides = {}): Promise<string> {
  const res = await agent
    .post('/api/v1/agents')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...VALID_AGENT, ...overrides });
  createdAgentIds.push(res.body.id);
  return res.body.id;
}

// --- T2.08: Create Agent Tests ---

describe('POST /api/v1/agents', () => {
  it('returns 201 with agent in DRAFT status on valid input', async () => {
    const res = await agent
      .post('/api/v1/agents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(VALID_AGENT);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(VALID_AGENT.name);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.riskTier).toBe('MEDIUM');
    expect(res.body).toHaveProperty('createdAt');
    createdAgentIds.push(res.body.id);
  });

  it('returns 400 on validation error (missing required fields)', async () => {
    const res = await agent
      .post('/api/v1/agents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Incomplete Agent' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
    expect(res.body).toHaveProperty('details');
  });

  it('allows duplicate agent names in same team', async () => {
    const id1 = await createTestAgent({ name: 'Duplicate Name' });
    const res = await agent
      .post('/api/v1/agents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...VALID_AGENT, name: 'Duplicate Name' });

    expect(res.status).toBe(201);
    createdAgentIds.push(res.body.id);
    expect(res.body.id).not.toBe(id1);
  });

  it('returns 401 without auth token', async () => {
    const res = await agent.post('/api/v1/agents').send(VALID_AGENT);
    expect(res.status).toBe(401);
  });
});

// --- T2.09: List Agents Tests ---

describe('GET /api/v1/agents', () => {
  it('returns paginated list with no filters', async () => {
    await createTestAgent({ name: 'List Agent 1' });
    await createTestAgent({ name: 'List Agent 2' });

    const res = await agent
      .get('/api/v1/agents')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by riskTier', async () => {
    await createTestAgent({ name: 'High Risk', riskTier: 'HIGH' });
    await createTestAgent({ name: 'Low Risk', riskTier: 'LOW' });

    const res = await agent
      .get('/api/v1/agents?riskTier=HIGH')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const a of res.body.data) {
      expect(a.riskTier).toBe('HIGH');
    }
  });

  it('searches by name (case-insensitive)', async () => {
    await createTestAgent({ name: 'Email Draft Agent' });
    await createTestAgent({ name: 'Research Agent' });

    const res = await agent
      .get('/api/v1/agents?search=email')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((a: { name: string }) => a.name === 'Email Draft Agent')).toBe(true);
  });

  it('returns empty results when no agents match filters', async () => {
    const res = await agent
      .get('/api/v1/agents?ownerTeam=nonexistent-team-xyz')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('respects pagination parameters', async () => {
    await createTestAgent({ name: 'Page Agent 1' });
    await createTestAgent({ name: 'Page Agent 2' });
    await createTestAgent({ name: 'Page Agent 3' });

    const res = await agent
      .get('/api/v1/agents?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
  });
});

// --- T2.10: Get Agent Detail Tests ---

describe('GET /api/v1/agents/:id', () => {
  it('returns full agent detail with stats', async () => {
    const id = await createTestAgent();

    const res = await agent
      .get(`/api/v1/agents/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body).toHaveProperty('tools');
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats).toHaveProperty('healthScore', 100);
    expect(res.body.stats).toHaveProperty('totalRuns', 0);
    expect(res.body).toHaveProperty('recentLogs');
    expect(res.body).toHaveProperty('pendingApprovals');
    expect(res.body).toHaveProperty('policies');
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await agent
      .get('/api/v1/agents/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Agent not found' });
  });
});

// --- T2.12: Status Transitions Tests ---

describe('PATCH /api/v1/agents/:id/status', () => {
  it('transitions DRAFT → APPROVED by approver', async () => {
    const id = await createTestAgent();

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.approvedBy).toBeTruthy();
  });

  it('transitions APPROVED → ACTIVE by admin', async () => {
    const id = await createTestAgent();
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${approverToken}`).send({ status: 'APPROVED' });

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('transitions ACTIVE → SUSPENDED by admin', async () => {
    const id = await createTestAgent();
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${approverToken}`).send({ status: 'APPROVED' });
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUSPENDED');
  });

  it('transitions SUSPENDED → ACTIVE by admin', async () => {
    const id = await createTestAgent();
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${approverToken}`).send({ status: 'APPROVED' });
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'SUSPENDED' });

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('transitions ANY → DEPRECATED by admin', async () => {
    const id = await createTestAgent();

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DEPRECATED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DEPRECATED');
  });

  it('rejects invalid transition DRAFT → ACTIVE with 400', async () => {
    const id = await createTestAgent();

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid transition');
    expect(res.body.error).toContain('APPROVED first');
  });

  it('returns 403 for viewer attempting status change', async () => {
    const id = await createTestAgent();

    const res = await agent
      .patch(`/api/v1/agents/${id}/status`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await agent
      .patch('/api/v1/agents/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(404);
  });
});

// --- T2.11: Update Metadata Tests ---

describe('PATCH /api/v1/agents/:id', () => {
  it('admin can partial-update agent metadata', async () => {
    const id = await createTestAgent();

    const res = await agent
      .patch(`/api/v1/agents/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description');
    expect(res.body.name).toBe(VALID_AGENT.name);
  });

  it('returns 403 for non-admin user', async () => {
    const id = await createTestAgent();

    const res = await agent
      .patch(`/api/v1/agents/${id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ description: 'Should fail' });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await agent
      .patch('/api/v1/agents/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Not found' });

    expect(res.status).toBe(404);
  });
});

// --- T2.13: Soft Delete Tests ---

describe('DELETE /api/v1/agents/:id', () => {
  it('deprecates a SUSPENDED agent', async () => {
    const id = await createTestAgent();
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${approverToken}`).send({ status: 'APPROVED' });
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'SUSPENDED' });

    const res = await agent
      .delete(`/api/v1/agents/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DEPRECATED');
  });

  it('rejects deprecating an ACTIVE agent with 400', async () => {
    const id = await createTestAgent();
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${approverToken}`).send({ status: 'APPROVED' });
    await agent.patch(`/api/v1/agents/${id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });

    const res = await agent
      .delete(`/api/v1/agents/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Suspend it first');
  });

  it('returns 403 for non-admin user', async () => {
    const id = await createTestAgent();

    const res = await agent
      .delete(`/api/v1/agents/${id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});
