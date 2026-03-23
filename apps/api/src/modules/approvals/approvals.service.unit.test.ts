import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalService } from './approvals.service.js';
import { MockApprovalRepository } from '../../repositories/mock/MockApprovalRepository.js';

let approvalRepo: MockApprovalRepository;
let service: ApprovalService;

beforeEach(() => {
  approvalRepo = new MockApprovalRepository();
  service = new ApprovalService(approvalRepo);
});

describe('ApprovalService.createTicket', () => {
  it('creates a ticket with PENDING status and 30min expiry', async () => {
    const ticket = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'send_email',
      payload: { to: 'test@example.com' },
      riskScore: 0.75,
      reasoning: 'External email send',
    });

    expect(ticket.id).toBeDefined();
    expect(ticket.status).toBe('PENDING');
    expect(ticket.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(approvalRepo.store.size).toBe(1);
  });
});

describe('ApprovalService.getTicket', () => {
  it('returns ticket by id', async () => {
    const created = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'deploy',
      riskScore: 0.5,
      reasoning: 'Deploy to prod',
    });

    const ticket = await service.getTicket(created.id);

    expect(ticket).not.toBeNull();
    expect(ticket!.id).toBe(created.id);
  });

  it('returns null for non-existent ticket', async () => {
    const ticket = await service.getTicket('non-existent');
    expect(ticket).toBeNull();
  });
});

describe('ApprovalService.resolveTicket', () => {
  it('approves a pending ticket', async () => {
    const created = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'deploy',
      riskScore: 0.5,
      reasoning: 'Deploy to prod',
    });

    const resolved = await service.resolveTicket(created.id, 'user-1', 'APPROVED');

    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe('APPROVED');
    expect(resolved!.resolvedById).toBe('user-1');
  });

  it('denies a pending ticket', async () => {
    const created = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'delete',
      riskScore: 0.9,
      reasoning: 'Data deletion',
    });

    const resolved = await service.resolveTicket(created.id, 'user-1', 'DENIED', 'Too risky');

    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe('DENIED');
    expect(resolved!.reasoning).toContain('Too risky');
  });

  it('throws on already resolved ticket', async () => {
    const created = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'deploy',
      riskScore: 0.5,
      reasoning: 'Test',
    });

    await service.resolveTicket(created.id, 'user-1', 'APPROVED');

    await expect(
      service.resolveTicket(created.id, 'user-2', 'DENIED'),
    ).rejects.toThrow('Ticket already resolved');
  });

  it('throws on expired ticket', async () => {
    const created = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'deploy',
      riskScore: 0.5,
      reasoning: 'Test',
    });

    const ticket = approvalRepo.store.get(created.id)!;
    approvalRepo.store.set(created.id, {
      ...ticket,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.resolveTicket(created.id, 'user-1', 'APPROVED'),
    ).rejects.toThrow('Ticket expired');
  });

  it('returns null for non-existent ticket', async () => {
    const result = await service.resolveTicket('non-existent', 'user-1', 'APPROVED');
    expect(result).toBeNull();
  });
});

describe('ApprovalService.listTickets', () => {
  it('returns paginated list', async () => {
    for (let i = 0; i < 5; i++) {
      await service.createTicket({
        agentId: 'agent-1',
        actionType: `action-${i}`,
        riskScore: 0.5,
        reasoning: 'Test',
      });
    }

    const result = await service.listTickets({ page: 1, limit: 3 });

    expect(result.total).toBe(5);
    expect(result.data).toHaveLength(3);
    expect(result.pendingCount).toBe(5);
  });
});

describe('ApprovalService.expirePendingTickets', () => {
  it('expires stale tickets', async () => {
    const created = await service.createTicket({
      agentId: 'agent-1',
      actionType: 'deploy',
      riskScore: 0.5,
      reasoning: 'Test',
    });

    const ticket = approvalRepo.store.get(created.id)!;
    approvalRepo.store.set(created.id, {
      ...ticket,
      expiresAt: new Date(Date.now() - 60000),
    });

    const count = await service.expirePendingTickets();

    expect(count).toBe(1);
    const expired = approvalRepo.store.get(created.id)!;
    expect(expired.status).toBe('EXPIRED');
  });
});
