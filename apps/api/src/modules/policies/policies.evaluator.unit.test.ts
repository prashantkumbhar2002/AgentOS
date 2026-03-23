import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEvaluator } from './policies.evaluator.js';
import { MockPolicyRepository } from '../../repositories/mock/MockPolicyRepository.js';
import { MockAgentRepository } from '../../repositories/mock/MockAgentRepository.js';

let policyRepo: MockPolicyRepository;
let agentRepo: MockAgentRepository;
let evaluator: PolicyEvaluator;

beforeEach(() => {
  policyRepo = new MockPolicyRepository();
  agentRepo = new MockAgentRepository();
  evaluator = new PolicyEvaluator(policyRepo, agentRepo);
});

describe('PolicyEvaluator.evaluate', () => {
  it('returns DENY when a DENY rule matches', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Deny Policy',
      rules: [
        { id: '1', actionType: 'delete', riskTiers: ['HIGH'], effect: 'DENY', conditions: null },
      ],
    });

    const result = await evaluator.evaluate(agent.id, 'delete', 'HIGH');
    expect(result.effect).toBe('DENY');
    expect(result.reason).toContain('Blocked by policy');
  });

  it('DENY wins over ALLOW', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Allow All',
      rules: [{ id: '1', actionType: '*', riskTiers: [], effect: 'ALLOW', conditions: null }],
    });
    policyRepo.seed({
      name: 'Deny Send',
      rules: [{ id: '2', actionType: 'send_email', riskTiers: ['HIGH'], effect: 'DENY', conditions: null }],
    });

    const result = await evaluator.evaluate(agent.id, 'send_email', 'HIGH');
    expect(result.effect).toBe('DENY');
  });

  it('REQUIRE_APPROVAL wins over ALLOW', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Allow Low',
      rules: [{ id: '1', actionType: '*', riskTiers: ['LOW'], effect: 'ALLOW', conditions: null }],
    });
    policyRepo.seed({
      name: 'Require Send',
      rules: [{ id: '2', actionType: 'send_email', riskTiers: [], effect: 'REQUIRE_APPROVAL', conditions: null }],
    });

    const result = await evaluator.evaluate(agent.id, 'send_email', 'LOW');
    expect(result.effect).toBe('REQUIRE_APPROVAL');
  });

  it('returns default REQUIRE_APPROVAL when no rules match', async () => {
    const agent = agentRepo.seed();

    const result = await evaluator.evaluate(agent.id, 'unknown_action', 'MEDIUM');
    expect(result.effect).toBe('REQUIRE_APPROVAL');
    expect(result.reason).toContain('No matching policy');
  });

  it('wildcard actionType matches any action', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Wildcard Allow',
      rules: [{ id: '1', actionType: '*', riskTiers: ['MEDIUM'], effect: 'ALLOW', conditions: null }],
    });

    const result = await evaluator.evaluate(agent.id, 'random_action', 'MEDIUM');
    expect(result.effect).toBe('ALLOW');
  });

  it('empty riskTiers matches all tiers', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'All Tiers Deny',
      rules: [{ id: '1', actionType: 'shutdown', riskTiers: [], effect: 'DENY', conditions: null }],
    });

    const low = await evaluator.evaluate(agent.id, 'shutdown', 'LOW');
    expect(low.effect).toBe('DENY');

    const critical = await evaluator.evaluate(agent.id, 'shutdown', 'CRITICAL');
    expect(critical.effect).toBe('DENY');
  });

  it('conditions match', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Conditional',
      rules: [{
        id: '1',
        actionType: 'send_email',
        riskTiers: ['HIGH'],
        effect: 'REQUIRE_APPROVAL',
        conditions: { recipientType: 'external' },
      }],
    });

    const result = await evaluator.evaluate(agent.id, 'send_email', 'HIGH', {
      recipientType: 'external',
    });
    expect(result.effect).toBe('REQUIRE_APPROVAL');
  });

  it('conditions mismatch skips rule', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Conditional Deny',
      rules: [{
        id: '1',
        actionType: 'send_email',
        riskTiers: ['HIGH'],
        effect: 'DENY',
        conditions: { recipientType: 'external' },
      }],
    });

    const result = await evaluator.evaluate(agent.id, 'send_email', 'HIGH', {
      recipientType: 'internal',
    });
    expect(result.effect).not.toBe('DENY');
  });

  it('inactive policy is skipped', async () => {
    const agent = agentRepo.seed();
    policyRepo.seed({
      name: 'Inactive',
      isActive: false,
      rules: [{ id: '1', actionType: '*', riskTiers: [], effect: 'DENY', conditions: null }],
    });

    const result = await evaluator.evaluate(agent.id, 'any_action', 'HIGH');
    expect(result.effect).not.toBe('DENY');
  });

  it('agent-specific policy overrides global', async () => {
    const agent = agentRepo.seed();

    policyRepo.seed({
      name: 'Global Allow',
      rules: [{ id: '1', actionType: 'deploy', riskTiers: [], effect: 'ALLOW', conditions: null }],
    });

    const denyPolicy = policyRepo.seed({
      name: 'Agent Deny',
      rules: [{ id: '2', actionType: 'deploy', riskTiers: [], effect: 'DENY', conditions: null }],
    });
    policyRepo.assignToAgent(denyPolicy.id, agent.id);

    const result = await evaluator.evaluate(agent.id, 'deploy', 'HIGH');
    expect(result.effect).toBe('DENY');
  });

  it('throws for non-existent agent', async () => {
    await expect(
      evaluator.evaluate('non-existent', 'any', 'LOW'),
    ).rejects.toThrow('Agent not found');
  });
});
