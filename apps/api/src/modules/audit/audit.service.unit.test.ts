import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from './audit.service.js';
import { MockAuditRepository } from '../../repositories/mock/MockAuditRepository.js';
import { MockAgentRepository } from '../../repositories/mock/MockAgentRepository.js';

let auditRepo: MockAuditRepository;
let agentRepo: MockAgentRepository;
let service: AuditService;

beforeEach(() => {
  auditRepo = new MockAuditRepository();
  agentRepo = new MockAgentRepository();
  service = new AuditService(auditRepo, agentRepo);
});

describe('AuditService.createLog', () => {
  it('creates an audit log entry', async () => {
    const agent = agentRepo.seed({ name: 'Test Agent' });

    const log = await service.createLog(
      {
        agentId: agent.id,
        traceId: 'trace-1',
        event: 'llm_call',
        model: 'claude-sonnet-4-5',
        inputTokens: 1000,
        outputTokens: 500,
        success: true,
      },
      0.015,
    );

    expect(log.id).toBeDefined();
    expect(log.agentId).toBe(agent.id);
    expect(log.costUsd).toBe(0.015);
    expect(auditRepo.store).toHaveLength(1);
  });

  it('updates agent lastActiveAt', async () => {
    const agent = agentRepo.seed({ lastActiveAt: null });

    await service.createLog(
      {
        agentId: agent.id,
        traceId: 'trace-2',
        event: 'tool_call',
        success: true,
      },
      0,
    );

    const updated = agentRepo.store.get(agent.id);
    expect(updated?.lastActiveAt).not.toBeNull();
  });
});

describe('AuditService.queryLogs', () => {
  it('returns paginated results', async () => {
    const agent = agentRepo.seed();
    for (let i = 0; i < 5; i++) {
      await auditRepo.create({
        agentId: agent.id,
        traceId: `trace-${i}`,
        event: 'llm_call',
        costUsd: 0.01,
      });
    }

    const result = await service.queryLogs({ page: 1, limit: 3 });

    expect(result.total).toBe(5);
    expect(result.data).toHaveLength(3);
    expect(result.totalCostUsd).toBe(0.05);
  });
});

describe('AuditService.getTrace', () => {
  it('aggregates trace events', async () => {
    const agent = agentRepo.seed({ name: 'Trace Agent' });

    await auditRepo.create({
      agentId: agent.id,
      traceId: 'trace-x',
      event: 'llm_call',
      costUsd: 0.01,
      latencyMs: 100,
    });
    await auditRepo.create({
      agentId: agent.id,
      traceId: 'trace-x',
      event: 'tool_call',
      costUsd: 0.005,
      latencyMs: 50,
    });

    const trace = await service.getTrace('trace-x');

    expect(trace).not.toBeNull();
    expect(trace!.traceId).toBe('trace-x');
    expect(trace!.agentName).toBe('Trace Agent');
    expect(trace!.events).toHaveLength(2);
    expect(trace!.totalCost).toBeCloseTo(0.015);
    expect(trace!.totalLatencyMs).toBe(150);
    expect(trace!.success).toBe(true);
  });

  it('returns null for non-existent trace', async () => {
    const trace = await service.getTrace('non-existent');
    expect(trace).toBeNull();
  });
});

describe('AuditService.getAgentStats', () => {
  it('delegates to audit repository', async () => {
    const agent = agentRepo.seed();

    await auditRepo.create({
      agentId: agent.id,
      traceId: 'trace-s',
      event: 'llm_call',
      costUsd: 0.02,
      success: true,
    });

    const stats = await service.getAgentStats(agent.id);

    expect(stats.totalRuns).toBeGreaterThanOrEqual(1);
    expect(stats.totalCostUsd).toBe(0.02);
  });
});

describe('AuditService.exportCsv', () => {
  it('returns CSV string with headers', async () => {
    const agent = agentRepo.seed();

    await auditRepo.create({
      agentId: agent.id,
      traceId: 'trace-csv',
      event: 'llm_call',
      costUsd: 0.01,
    });

    const csv = await service.exportCsv({ page: 1, limit: 100 });

    expect(csv).toContain('id,agentId,agentName');
    expect(csv.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});
