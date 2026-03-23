import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyService } from './policies.service.js';
import { MockPolicyRepository } from '../../repositories/mock/MockPolicyRepository.js';
import { MockAgentRepository } from '../../repositories/mock/MockAgentRepository.js';

let policyRepo: MockPolicyRepository;
let agentRepo: MockAgentRepository;
let service: PolicyService;

beforeEach(() => {
    policyRepo = new MockPolicyRepository();
    agentRepo = new MockAgentRepository();
    service = new PolicyService(policyRepo, agentRepo);
});

describe('PolicyService.createPolicy', () => {
    it('creates a policy with rules', async () => {
        const policy = await service.createPolicy({
            name: 'Test Policy',
            description: 'A test policy',
            rules: [
                { actionType: 'send_email', riskTiers: ['HIGH'], effect: 'DENY' },
            ],
        });

        expect(policy.id).toBeDefined();
        expect(policy.name).toBe('Test Policy');
        expect(policy.rules).toHaveLength(1);
        expect(policyRepo.store.size).toBe(1);
    });

    it('throws on duplicate name', async () => {
        await service.createPolicy({
            name: 'Unique',
            description: 'First',
            rules: [],
        });

        await expect(
            service.createPolicy({
                name: 'Unique',
                description: 'Duplicate',
                rules: [],
            }),
        ).rejects.toThrow('Policy name already exists');
    });
});

describe('PolicyService.getPolicyById', () => {
    it('returns policy by id', async () => {
        const created = await service.createPolicy({
            name: 'Find Me',
            description: 'Test',
            rules: [],
        });

        const found = await service.getPolicyById(created.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Find Me');
    });

    it('returns null for non-existent', async () => {
        const found = await service.getPolicyById('non-existent');
        expect(found).toBeNull();
    });
});

describe('PolicyService.updatePolicy', () => {
    it('updates policy name', async () => {
        const created = await service.createPolicy({
            name: 'Old',
            description: 'Test',
            rules: [],
        });

        const updated = await service.updatePolicy(created.id, { name: 'New' });
        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('New');
    });

    it('throws on duplicate name during update', async () => {
        await service.createPolicy({ name: 'Taken', description: 'A', rules: [] });
        const other = await service.createPolicy({ name: 'Other', description: 'B', rules: [] });

        await expect(
            service.updatePolicy(other.id, { name: 'Taken' }),
        ).rejects.toThrow('Policy name already exists');
    });
});

describe('PolicyService.deletePolicy', () => {
    it('deletes unassigned policy', async () => {
        const created = await service.createPolicy({
            name: 'Delete Me',
            description: 'Test',
            rules: [],
        });

        const result = await service.deletePolicy(created.id);
        expect(result).toEqual({ id: created.id, deleted: true });
        expect(policyRepo.store.size).toBe(0);
    });

    it('throws when policy is assigned to agents', async () => {
        const created = await service.createPolicy({
            name: 'Assigned',
            description: 'Test',
            rules: [],
        });
        const agent = agentRepo.seed();
        await policyRepo.assignToAgent(created.id, agent.id);

        await expect(
            service.deletePolicy(created.id),
        ).rejects.toThrow('Cannot delete policy assigned to');
    });
});

describe('PolicyService.assignToAgent', () => {
    it('assigns policy to agent', async () => {
        const policy = await service.createPolicy({
            name: 'Assign Test',
            description: 'Test',
            rules: [],
        });
        const agent = agentRepo.seed();

        const result = await service.assignToAgent(policy.id, agent.id);
        expect(result.assigned).toBe(true);
    });

    it('throws if already assigned', async () => {
        const policy = await service.createPolicy({
            name: 'Double Assign',
            description: 'Test',
            rules: [],
        });
        const agent = agentRepo.seed();
        await service.assignToAgent(policy.id, agent.id);

        await expect(
            service.assignToAgent(policy.id, agent.id),
        ).rejects.toThrow('Policy already assigned');
    });

    it('throws for non-existent agent', async () => {
        const policy = await service.createPolicy({
            name: 'No Agent',
            description: 'Test',
            rules: [],
        });

        await expect(
            service.assignToAgent(policy.id, 'non-existent'),
        ).rejects.toThrow('Agent not found');
    });
});
