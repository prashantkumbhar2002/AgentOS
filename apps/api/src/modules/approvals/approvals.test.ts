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
  email: 'test-approval-admin@agentos.dev',
  name: 'Approval Test Admin',
  role: 'admin',
  password: 'adminpassword123',
};

const APPROVER_USER = {
  email: 'test-approval-approver@agentos.dev',
  name: 'Approval Test Approver',
  role: 'approver',
  password: 'approverpassword123',
};

const VIEWER_USER = {
  email: 'test-approval-viewer@agentos.dev',
  name: 'Approval Test Viewer',
  role: 'viewer',
  password: 'viewerpassword123',
};

const TEST_AGENT = {
  name: 'Approval Test Agent',
  description: 'Agent for approval workflow tests',
  ownerTeam: 'engineering',
  llmModel: 'claude-sonnet-4-5',
  riskTier: 'MEDIUM' as const,
  environment: 'DEV' as const,
  tools: [{ name: 'test-tool', description: 'A tool for testing' }],
  tags: ['test'],
};

let app: FastifyInstance;
let agent: ReturnType<typeof supertest>;
let adminToken: string;
let approverToken: string;
let viewerToken: string;
let testAgentId: string;
const createdTicketIds: string[] = [];

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

  const adminLogin = await agent.post('/api/auth/login').send({
    email: ADMIN_USER.email,
    password: ADMIN_USER.password,
  });
  adminToken = adminLogin.body.accessToken;

  const approverLogin = await agent.post('/api/auth/login').send({
    email: APPROVER_USER.email,
    password: APPROVER_USER.password,
  });
  approverToken = approverLogin.body.accessToken;

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
  for (const id of createdTicketIds) {
    await app.prisma.approvalTicket.deleteMany({ where: { id } });
  }
  createdTicketIds.length = 0;
});

afterAll(async () => {
  await app.prisma.approvalTicket.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentTool.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.auditLog.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agentPolicy.deleteMany({ where: { agentId: testAgentId } });
  await app.prisma.agent.deleteMany({ where: { id: testAgentId } });
  await app.prisma.user.deleteMany({
    where: {
      email: { in: [ADMIN_USER.email, APPROVER_USER.email, VIEWER_USER.email] },
    },
  });
  await app.close();
});

function validApprovalPayload(overrides = {}) {
  return {
    agentId: testAgentId,
    actionType: 'send_email',
    payload: { to: 'external@example.com' },
    riskScore: 0.75,
    reasoning: 'Agent needs to send report to external stakeholder',
    ...overrides,
  };
}

async function createTicket(overrides = {}): Promise<string> {
  const res = await agent
    .post('/api/v1/approvals')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(validApprovalPayload(overrides));
  createdTicketIds.push(res.body.ticketId);
  return res.body.ticketId;
}

// --- Create Ticket Tests ---

describe('POST /api/v1/approvals', () => {
  it('returns 201 with PENDING status and expiresAt on valid input', async () => {
    const res = await agent
      .post('/api/v1/approvals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validApprovalPayload());

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('ticketId');
    expect(res.body.status).toBe('PENDING');
    expect(res.body).toHaveProperty('expiresAt');
    createdTicketIds.push(res.body.ticketId);

    const expiry = new Date(res.body.expiresAt).getTime();
    const now = Date.now();
    expect(expiry).toBeGreaterThan(now);
    expect(expiry).toBeLessThanOrEqual(now + 31 * 60 * 1000);
  });

  it('returns 400 on validation error (missing required fields)', async () => {
    const res = await agent
      .post('/api/v1/approvals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentId: testAgentId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body).toHaveProperty('details');
  });

  it('returns 404 for non-existent agentId', async () => {
    // Behavior change: was 400, now 404 NOT_FOUND. The agentId is well-formed; the
    // referenced resource just doesn't exist — 404 is the correct REST semantic.
    const res = await agent
      .post('/api/v1/approvals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validApprovalPayload({ agentId: '00000000-0000-0000-0000-000000000000' }));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.details).toMatchObject({ resource: 'Agent' });
  });

  it('returns 400 when riskScore is out of range', async () => {
    const res = await agent
      .post('/api/v1/approvals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validApprovalPayload({ riskScore: 1.5 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth token', async () => {
    const res = await agent.post('/api/v1/approvals').send(validApprovalPayload());
    expect(res.status).toBe(401);
  });
});

// --- Poll Ticket Tests ---

describe('GET /api/v1/approvals/:id', () => {
  it('returns full ticket with PENDING status', async () => {
    const ticketId = await createTicket();

    const res = await agent
      .get(`/api/v1/approvals/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticketId);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.agentName).toBe(TEST_AGENT.name);
    expect(res.body.actionType).toBe('send_email');
    expect(res.body.riskScore).toBe(0.75);
    expect(res.body).toHaveProperty('expiresAt');
    expect(res.body).toHaveProperty('createdAt');
    expect(res.body.resolvedById).toBeNull();
    expect(res.body.resolvedByName).toBeNull();
  });

  it('returns 404 for non-existent ticket', async () => {
    const res = await agent
      .get('/api/v1/approvals/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.details).toMatchObject({ resource: 'Ticket' });
  });

  it('returns expired ticket with EXPIRED status (not 404)', async () => {
    const ticketId = await createTicket();

    await app.prisma.approvalTicket.update({
      where: { id: ticketId },
      data: {
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await agent
      .get(`/api/v1/approvals/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('EXPIRED');
  });
});

// --- Resolve Ticket Tests ---

describe('PATCH /api/v1/approvals/:id/decide', () => {
  it('admin can approve a PENDING ticket', async () => {
    const ticketId = await createTicket();

    const res = await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED', comment: 'Looks good' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticketId);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.resolvedBy).toHaveProperty('name', ADMIN_USER.name);
    expect(res.body.resolvedBy).toHaveProperty('email', ADMIN_USER.email);
    expect(res.body).toHaveProperty('resolvedAt');
  });

  it('approver can deny a PENDING ticket with comment', async () => {
    const ticketId = await createTicket();

    const res = await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ decision: 'DENIED', comment: 'Too risky' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DENIED');
    expect(res.body.resolvedBy).toHaveProperty('name', APPROVER_USER.name);
  });

  it('returns 403 for viewer role', async () => {
    const ticketId = await createTicket();

    const res = await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ decision: 'APPROVED' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toMatch(/insufficient permissions/i);
  });

  it('returns 409 for expired ticket', async () => {
    // Behavior change: was 400, now 409 CONFLICT. The ticket is in a state that
    // conflicts with the decide operation — 409 is the correct RFC 9110 §15.5.10 code.
    const ticketId = await createTicket();

    await app.prisma.approvalTicket.update({
      where: { id: ticketId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 409 for already-resolved ticket', async () => {
    // Behavior change: was 400, now 409 CONFLICT (state-conflict, not malformed input).
    const ticketId = await createTicket();

    await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });

    const res = await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ decision: 'DENIED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toMatch(/already resolved/i);
  });

  it('returns 404 for non-existent ticket', async () => {
    const res = await agent
      .patch('/api/v1/approvals/00000000-0000-0000-0000-000000000000/decide')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.details).toMatchObject({ resource: 'Ticket' });
  });

  it('returns 400 on invalid decision value', async () => {
    const ticketId = await createTicket();

    const res = await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'MAYBE' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// --- List Tickets Tests ---

describe('GET /api/v1/approvals', () => {
  it('returns default list sorted by expiresAt ASC with pendingCount', async () => {
    await createTicket({ riskScore: 0.75 });
    await createTicket({ riskScore: 0.8 });

    const res = await agent
      .get('/api/v1/approvals')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('pendingCount');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 20);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pendingCount).toBeGreaterThanOrEqual(2);
  });

  it('filters by agentId', async () => {
    await createTicket();

    const res = await agent
      .get(`/api/v1/approvals?agentId=${testAgentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const ticket of res.body.data) {
      expect(ticket.agentId).toBe(testAgentId);
    }
  });

  it('filters by status', async () => {
    const ticketId = await createTicket();

    await agent
      .patch(`/api/v1/approvals/${ticketId}/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVED' });

    const res = await agent
      .get('/api/v1/approvals?status=APPROVED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    for (const ticket of res.body.data) {
      expect(ticket.status).toBe('APPROVED');
    }
  });

  it('returns empty results when no tickets match', async () => {
    const res = await agent
      .get('/api/v1/approvals?agentId=00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});
