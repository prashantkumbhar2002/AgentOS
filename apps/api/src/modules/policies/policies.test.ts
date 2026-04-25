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
  email: 'test-policy-admin@agentos.dev',
  name: 'Policy Test Admin',
  role: 'admin',
  password: 'adminpassword123',
};

const VIEWER_USER = {
  email: 'test-policy-viewer@agentos.dev',
  name: 'Policy Test Viewer',
  role: 'viewer',
  password: 'viewerpassword123',
};

const TEST_AGENT = {
  name: 'Policy Test Agent',
  description: 'Agent for policy integration tests',
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
let viewerToken: string;
let testAgentId: string;
const createdPolicyIds: string[] = [];

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

  const adminLogin = await agent.post('/api/auth/login').send({
    email: ADMIN_USER.email,
    password: ADMIN_USER.password,
  });
  adminToken = adminLogin.body.accessToken;

  const viewerLogin = await agent.post('/api/auth/login').send({
    email: VIEWER_USER.email,
    password: VIEWER_USER.password,
  });
  viewerToken = viewerLogin.body.accessToken;

  const agentRes = await agent
    .post('/api/v1/agents')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(TEST_AGENT);
  testAgentId = agentRes.body.id;
});

afterEach(async () => {
  for (const id of createdPolicyIds) {
    await app.prisma.agentPolicy.deleteMany({ where: { policyId: id } });
    await app.prisma.policyRule.deleteMany({ where: { policyId: id } });
    await app.prisma.policy.deleteMany({ where: { id } });
  }
  createdPolicyIds.length = 0;
});

afterAll(async () => {
  await app.prisma.approvalTicket.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentPolicy.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentTool.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.auditLog.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agent.deleteMany({ where: { id: testAgentId } });
  await app.prisma.user.deleteMany({
    where: { email: { in: [ADMIN_USER.email, VIEWER_USER.email] } },
  });
  await app.close();
});

function uniqueName(base: string) {
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function createTestPolicy(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await agent
    .post('/api/v1/policies')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: uniqueName('test-policy'),
      description: 'A test policy',
      rules: [
        { actionType: 'send_email', riskTiers: ['HIGH'], effect: 'REQUIRE_APPROVAL' },
      ],
      ...overrides,
    });
  createdPolicyIds.push(res.body.id);
  return res.body.id;
}

// --- Create Policy Tests ---

describe('POST /api/v1/policies', () => {
  it('returns 201 with policy and rules on valid input', async () => {
    const name = uniqueName('create-test');
    const res = await agent
      .post('/api/v1/policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        description: 'Test policy for creation',
        rules: [
          { actionType: 'delete_record', riskTiers: ['HIGH', 'CRITICAL'], effect: 'DENY' },
          { actionType: 'send_email', riskTiers: ['MEDIUM'], effect: 'REQUIRE_APPROVAL' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.isActive).toBe(true);
    expect(res.body.rules).toHaveLength(2);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('createdAt');
    createdPolicyIds.push(res.body.id);
  });

  it('returns 409 for duplicate policy name', async () => {
    // Behavior change: was 400, now 409 CONFLICT — duplicate-name is a uniqueness
    // conflict against existing state, not malformed input.
    const name = uniqueName('dup-test');
    await createTestPolicy({ name });

    const res = await agent
      .post('/api/v1/policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, description: 'Duplicate', rules: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await agent
      .post('/api/v1/policies')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: uniqueName('viewer'), description: 'test', rules: [] });

    expect(res.status).toBe(403);
  });

  it('accepts empty rules array', async () => {
    const res = await agent
      .post('/api/v1/policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: uniqueName('empty-rules'), description: 'No rules', rules: [] });

    expect(res.status).toBe(201);
    expect(res.body.rules).toHaveLength(0);
    createdPolicyIds.push(res.body.id);
  });
});

// --- List Policies Tests ---

describe('GET /api/v1/policies', () => {
  it('returns paginated list with total', async () => {
    await createTestPolicy();
    await createTestPolicy();

    const res = await agent
      .get('/api/v1/policies')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by isActive', async () => {
    const id = await createTestPolicy();
    await agent
      .patch(`/api/v1/policies/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    const res = await agent
      .get('/api/v1/policies?isActive=false')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(p.isActive).toBe(false);
    }
  });
});

// --- Get Policy Tests ---

describe('GET /api/v1/policies/:id', () => {
  it('returns full policy with rules and agents', async () => {
    const id = await createTestPolicy();

    const res = await agent
      .get(`/api/v1/policies/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body).toHaveProperty('rules');
    expect(res.body).toHaveProperty('agents');
  });

  it('returns 404 for non-existent policy', async () => {
    const res = await agent
      .get('/api/v1/policies/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.details).toMatchObject({ resource: 'Policy' });
  });
});

// --- Update Policy Tests ---

describe('PATCH /api/v1/policies/:id', () => {
  it('admin can deactivate a policy', async () => {
    const id = await createTestPolicy();

    const res = await agent
      .patch(`/api/v1/policies/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('returns 403 for non-admin user', async () => {
    const id = await createTestPolicy();

    const res = await agent
      .patch(`/api/v1/policies/${id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });
});

// --- Delete Policy Tests ---

describe('DELETE /api/v1/policies/:id', () => {
  it('admin can delete unassigned policy', async () => {
    const id = await createTestPolicy();

    const res = await agent
      .delete(`/api/v1/policies/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id, deleted: true });
  });

  it('returns 409 when deleting assigned policy', async () => {
    // Behavior change: was 400, now 409 CONFLICT — deletion conflicts with current
    // assignments. Caller must unassign first.
    const id = await createTestPolicy();

    await agent
      .post(`/api/v1/policies/${id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId });

    const res = await agent
      .delete(`/api/v1/policies/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toContain('Cannot delete policy assigned to');
    expect(res.body.message).toContain('Unassign first');
  });
});

// --- Assign / Unassign Tests ---

describe('POST /api/v1/policies/:id/assign', () => {
  it('assigns policy to agent', async () => {
    const id = await createTestPolicy();

    const res = await agent
      .post(`/api/v1/policies/${id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ policyId: id, agentId: testAgentId, assigned: true });
  });

  it('returns 409 for duplicate assignment', async () => {
    // Behavior change: was 400, now 409 CONFLICT — assignment already exists.
    const id = await createTestPolicy();

    await agent
      .post(`/api/v1/policies/${id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId });

    const res = await agent
      .post(`/api/v1/policies/${id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toMatch(/already assigned/i);
  });
});

describe('DELETE /api/v1/policies/:id/assign/:agentId', () => {
  it('unassigns policy from agent', async () => {
    const id = await createTestPolicy();

    await agent
      .post(`/api/v1/policies/${id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId });

    const res = await agent
      .delete(`/api/v1/policies/${id}/assign/${testAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ policyId: id, agentId: testAgentId, unassigned: true });
  });

  it('returns 404 for non-existent assignment', async () => {
    const id = await createTestPolicy();

    const res = await agent
      .delete(`/api/v1/policies/${id}/assign/${testAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.details).toMatchObject({ resource: 'Assignment' });
  });
});

// --- Evaluate Tests ---

describe('POST /api/v1/policies/evaluate', () => {
  it('returns DENY when a DENY rule matches', async () => {
    await createTestPolicy({
      name: uniqueName('eval-deny'),
      rules: [{ actionType: 'delete_record', riskTiers: ['HIGH'], effect: 'DENY' }],
    });

    const res = await agent
      .post('/api/v1/policies/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId, actionType: 'delete_record', riskTier: 'HIGH' });

    expect(res.status).toBe(200);
    expect(res.body.effect).toBe('DENY');
    expect(res.body.reason).toContain('Blocked by policy');
  });

  it('returns ALLOW when only ALLOW rule matches', async () => {
    await createTestPolicy({
      name: uniqueName('eval-allow'),
      rules: [{ actionType: 'read_data', riskTiers: ['LOW'], effect: 'ALLOW' }],
    });

    const res = await agent
      .post('/api/v1/policies/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId, actionType: 'read_data', riskTier: 'LOW' });

    expect(res.status).toBe(200);
    expect(res.body.effect).toBe('ALLOW');
  });

  it('returns default REQUIRE_APPROVAL when no rules match', async () => {
    const res = await agent
      .post('/api/v1/policies/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId, actionType: 'nonexistent_action_xyz_42', riskTier: 'MEDIUM' });

    expect(res.status).toBe(200);
    expect(res.body.effect).toBe('REQUIRE_APPROVAL');
    expect(res.body.reason).toContain('No matching policy');
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await agent
      .post('/api/v1/policies/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        agentId: '00000000-0000-0000-0000-000000000000',
        actionType: 'test',
        riskTier: 'LOW',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.details).toMatchObject({ resource: 'Agent' });
  });
});
