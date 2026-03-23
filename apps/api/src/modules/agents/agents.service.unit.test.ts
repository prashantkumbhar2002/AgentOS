import { describe, it, expect, beforeEach } from 'vitest';
import { AgentService, validateStatusTransition } from './agents.service.js';
import { MockAgentRepository } from '../../repositories/mock/MockAgentRepository.js';
import { MockAuditRepository } from '../../repositories/mock/MockAuditRepository.js';
import { MockApprovalRepository } from '../../repositories/mock/MockApprovalRepository.js';
import { MockPolicyRepository } from '../../repositories/mock/MockPolicyRepository.js';

let agentRepo: MockAgentRepository;
let auditRepo: MockAuditRepository;
let approvalRepo: MockApprovalRepository;
let policyRepo: MockPolicyRepository;
let service: AgentService;

beforeEach(() => {
  agentRepo = new MockAgentRepository();
  auditRepo = new MockAuditRepository();
  approvalRepo = new MockApprovalRepository();
  policyRepo = new MockPolicyRepository();
  service = new AgentService(agentRepo, auditRepo, approvalRepo, policyRepo);
});

describe('validateStatusTransition (pure function)', () => {
  it('allows DRAFT -> APPROVED', () => {
    expect(validateStatusTransition('DRAFT', 'APPROVED').valid).toBe(true);
  });

  it('rejects DRAFT -> ACTIVE', () => {
    const result = validateStatusTransition('DRAFT', 'ACTIVE');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('APPROVED first');
  });

  it('rejects transitions from DEPRECATED', () => {
    const result = validateStatusTransition('DEPRECATED', 'ACTIVE');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('terminal state');
  });

  it('allows ACTIVE -> SUSPENDED', () => {
    expect(validateStatusTransition('ACTIVE', 'SUSPENDED').valid).toBe(true);
  });
});

describe('AgentService.createAgent', () => {
  it('creates an agent with DRAFT status', async () => {
    const agent = await service.createAgent({
      name: 'Test Agent',
      description: 'A test agent',
      ownerTeam: 'engineering',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'MEDIUM',
      environment: 'DEV',
      tools: [{ name: 'tool1', description: 'A tool' }],
      tags: ['test'],
    });

    expect(agent.id).toBeDefined();
    expect(agent.name).toBe('Test Agent');
    expect(agent.status).toBe('DRAFT');
    expect(agent.tools).toHaveLength(1);
    expect(agentRepo.store.size).toBe(1);
  });
});

describe('AgentService.listAgents', () => {
  it('returns paginated results', async () => {
    agentRepo.seed({ name: 'Agent A' });
    agentRepo.seed({ name: 'Agent B' });
    agentRepo.seed({ name: 'Agent C' });

    const result = await service.listAgents({ page: 1, limit: 2 });

    expect(result.total).toBe(3);
    expect(result.data).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
  });

  it('filters by status', async () => {
    agentRepo.seed({ name: 'Active', status: 'ACTIVE' });
    agentRepo.seed({ name: 'Draft', status: 'DRAFT' });

    const result = await service.listAgents({ status: 'ACTIVE', page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.data[0]!.name).toBe('Active');
  });
});

describe('AgentService.getAgentById', () => {
  it('returns full detail view with stats', async () => {
    const seeded = agentRepo.seed({ name: 'Detail Agent' });

    const detail = await service.getAgentById(seeded.id);

    expect(detail).not.toBeNull();
    expect(detail!.name).toBe('Detail Agent');
    expect(detail!.stats).toBeDefined();
    expect(detail!.stats.healthScore).toBeGreaterThanOrEqual(0);
    expect(detail!.recentLogs).toBeDefined();
    expect(detail!.pendingApprovals).toBeDefined();
    expect(detail!.policies).toBeDefined();
  });

  it('returns null for non-existent agent', async () => {
    const detail = await service.getAgentById('non-existent-id');
    expect(detail).toBeNull();
  });
});

describe('AgentService.updateAgent', () => {
  it('updates agent name', async () => {
    const seeded = agentRepo.seed({ name: 'Old Name' });

    const updated = await service.updateAgent(seeded.id, { name: 'New Name' });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('New Name');
  });

  it('returns null for non-existent agent', async () => {
    const result = await service.updateAgent('non-existent', { name: 'X' });
    expect(result).toBeNull();
  });
});

describe('AgentService.updateAgentStatus', () => {
  it('transitions status and tracks old status', async () => {
    const seeded = agentRepo.seed({ status: 'APPROVED' });

    const result = await service.updateAgentStatus(seeded.id, 'ACTIVE', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.oldStatus).toBe('APPROVED');
    expect(result!.agent.status).toBe('ACTIVE');
  });

  it('sets approvedBy when transitioning to APPROVED', async () => {
    const seeded = agentRepo.seed({ status: 'DRAFT' });

    const result = await service.updateAgentStatus(seeded.id, 'APPROVED', 'admin-1');

    expect(result).not.toBeNull();
    expect(result!.agent.approvedBy).toBe('admin-1');
  });

  it('returns null for non-existent agent', async () => {
    const result = await service.updateAgentStatus('non-existent', 'ACTIVE', 'user-1');
    expect(result).toBeNull();
  });
});

describe('AgentService.computeAgentStats', () => {
  it('computes health score from audit data', async () => {
    const seeded = agentRepo.seed();

    await auditRepo.create({
      agentId: seeded.id,
      traceId: 'trace-1',
      event: 'llm_call',
      costUsd: 0.01,
      success: true,
      latencyMs: 100,
    });

    const stats = await service.computeAgentStats(seeded.id);

    expect(stats.totalRuns).toBe(1);
    expect(stats.errorRate).toBe(0);
    expect(stats.healthScore).toBeGreaterThan(0);
  });
});
