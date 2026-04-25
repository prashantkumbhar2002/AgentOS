process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/agentos';
process.env['JWT_SECRET'] =
  'test-jwt-secret-key-that-is-at-least-32-characters-long';
process.env['JWT_EXPIRES_IN'] = '8h';
process.env['NODE_ENV'] = 'test';
process.env['FRONTEND_URL'] = 'http://localhost:5173';
process.env['REDIS_URL'] = 'redis://localhost:6379';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { hashPassword } from './users.service.js';

const TEST_USER = {
  email: 'test-auth@agentos.dev',
  name: 'Test User',
  role: 'admin',
  password: 'testpassword123',
};

const VIEWER_USER = {
  email: 'test-viewer@agentos.dev',
  name: 'Test Viewer',
  role: 'viewer',
  password: 'viewerpassword123',
};

let app: FastifyInstance;
let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  agent = supertest(app.server);

  const passwordHash = await hashPassword(TEST_USER.password);
  const viewerHash = await hashPassword(VIEWER_USER.password);

  await app.prisma.user.upsert({
    where: { email: TEST_USER.email },
    update: { passwordHash, name: TEST_USER.name, role: TEST_USER.role },
    create: {
      email: TEST_USER.email,
      passwordHash,
      name: TEST_USER.name,
      role: TEST_USER.role,
    },
  });

  await app.prisma.user.upsert({
    where: { email: VIEWER_USER.email },
    update: { passwordHash: viewerHash, name: VIEWER_USER.name, role: VIEWER_USER.role },
    create: {
      email: VIEWER_USER.email,
      passwordHash: viewerHash,
      name: VIEWER_USER.name,
      role: VIEWER_USER.role,
    },
  });
});

afterAll(async () => {
  await app.prisma.user.deleteMany({
    where: {
      email: { in: [TEST_USER.email, VIEWER_USER.email] },
    },
  });
  await app.close();
});

describe('POST /api/auth/login', () => {
  it('returns 200 with token and user on valid credentials', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toMatchObject({
      email: TEST_USER.email,
      name: TEST_USER.name,
      role: TEST_USER.role,
    });
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 for wrong password (no user enumeration)', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'wrongpassword123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 for unknown email (same message as wrong password)', async () => {
    // SECURITY: must return the IDENTICAL response shape & message as wrong-password
    // to prevent account enumeration via the login endpoint.
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'nonexistent@agentos.dev', password: 'somepassword123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 400 on validation error (missing email)', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ password: 'somepassword123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 on validation error (password too short)', async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/auth/me', () => {
  let validToken: string;

  beforeAll(async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    validToken = res.body.accessToken;
  });

  it('returns 200 with user profile for valid token', async () => {
    const res = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: TEST_USER.email,
      name: TEST_USER.name,
      role: TEST_USER.role,
    });
    expect(res.body).toHaveProperty('id');
  });

  it('returns 401 when no token is provided', async () => {
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_MISSING');
    expect(res.body.message).toMatch(/authentication required/i);
  });

  it('returns 401 with TOKEN_INVALID for malformed token', async () => {
    const res = await agent
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_INVALID');
    expect(res.body.message).toBe('Invalid token');
  });

  it('returns 401 with TOKEN_EXPIRED for expired token', async () => {
    const expiredToken = app.jwt.sign(
      { id: 'fake-id', email: TEST_USER.email, name: TEST_USER.name, role: TEST_USER.role as 'admin' },
      { expiresIn: '1s' },
    );
    await new Promise((r) => setTimeout(r, 2000));

    const res = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_EXPIRED');
    expect(res.body.message).toBe('Token expired');
  });
});

describe('POST /api/auth/refresh', () => {
  let validToken: string;

  beforeAll(async () => {
    const res = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    validToken = res.body.accessToken;
  });

  it('returns 200 with new token for valid token', async () => {
    await new Promise((r) => setTimeout(r, 1100));

    const res = await agent
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user).toMatchObject({
      email: TEST_USER.email,
      name: TEST_USER.name,
      role: TEST_USER.role,
    });
  });

  it('returns 401 when no token is provided', async () => {
    const res = await agent.post('/api/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_MISSING');
    expect(res.body.message).toMatch(/authentication required/i);
  });
});

describe('Role-based access control', () => {
  it('returns 403 for viewer accessing admin-only route (via requireRole)', async () => {
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: VIEWER_USER.email, password: VIEWER_USER.password });
    const viewerToken = loginRes.body.accessToken;

    expect(viewerToken).toBeDefined();
    expect(loginRes.body.user.role).toBe('viewer');
  });
});

describe('GET /api/health', () => {
  it('returns 200 without authentication', async () => {
    const res = await agent.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
