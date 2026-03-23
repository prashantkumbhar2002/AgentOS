import { randomUUID } from 'node:crypto';
import type { IAgentRepository } from '../repositories/interfaces/IAgentRepository.js';
import type { IAuditRepository } from '../repositories/interfaces/IAuditRepository.js';
import type { IApprovalRepository, CreateApprovalInput } from '../repositories/interfaces/IApprovalRepository.js';
import type { IUserRepository } from '../repositories/interfaces/IUserRepository.js';
import type { CreateAuditLogInput } from '../types/dto.js';

const MOCK_AGENT_DEFS = [
    {
        name: 'Mock CRM Agent',
        riskTier: 'MEDIUM' as const,
        environment: 'DEV' as const,
        ownerTeam: 'platform-demo',
        llmModel: 'claude-sonnet-4-5',
        status: 'ACTIVE',
        tags: ['crm', 'mock', 'demo'],
        description: 'Simulated CRM agent for demo purposes',
        tools: [
            { name: 'crm_read', description: 'Read CRM records' },
            { name: 'crm_write', description: 'Write CRM records' },
            { name: 'send_notification', description: 'Send notifications' },
        ],
    },
    {
        name: 'Mock Analytics Agent',
        riskTier: 'LOW' as const,
        environment: 'DEV' as const,
        ownerTeam: 'platform-demo',
        llmModel: 'claude-sonnet-4-5',
        status: 'ACTIVE',
        tags: ['analytics', 'mock', 'demo'],
        description: 'Simulated analytics agent for demo purposes',
        tools: [
            { name: 'query_db', description: 'Query database' },
            { name: 'generate_chart', description: 'Generate charts' },
            { name: 'export_csv', description: 'Export CSV files' },
        ],
    },
    {
        name: 'Mock Compliance Agent',
        riskTier: 'CRITICAL' as const,
        environment: 'DEV' as const,
        ownerTeam: 'platform-demo',
        llmModel: 'claude-sonnet-4-5',
        status: 'ACTIVE',
        tags: ['compliance', 'mock', 'demo'],
        description: 'Simulated compliance agent for demo purposes',
        tools: [
            { name: 'audit_read', description: 'Read audit records' },
            { name: 'flag_record', description: 'Flag records for review' },
            { name: 'notify_compliance', description: 'Notify compliance team' },
        ],
    },
] as const;

const TOOL_NAMES_FOR_LOGS = [
    'crm_read',
    'crm_write',
    'query_db',
    'generate_chart',
    'export_csv',
    'audit_read',
    'flag_record',
] as const;

const APPROVAL_ACTION_TYPES = ['send_email', 'delete_record', 'export_data'] as const;

function randomInt(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)]!;
}

async function createMockAgents(
    agentRepo: IAgentRepository,
): Promise<{ agentIds: string[]; created: number }> {
    const agentIds: string[] = [];
    let created = 0;

    for (const def of MOCK_AGENT_DEFS) {
        const existing = await agentRepo.findByName(def.name);
        if (existing) {
            agentIds.push(existing.id);
            continue;
        }

        const agent = await agentRepo.create({
            name: def.name,
            description: def.description,
            ownerTeam: def.ownerTeam,
            llmModel: def.llmModel,
            riskTier: def.riskTier,
            environment: def.environment,
            tags: [...def.tags],
            tools: def.tools.map((t) => ({ name: t.name, description: t.description })),
        });

        if (def.status === 'ACTIVE') {
            await agentRepo.updateStatus(agent.id, 'APPROVED');
            await agentRepo.updateStatus(agent.id, 'ACTIVE');
        }

        agentIds.push(agent.id);
        created += 1;
    }

    return { agentIds, created };
}

async function createMockLogs(
    auditRepo: IAuditRepository,
    agentIds: string[],
    count = 50,
): Promise<number> {
    if (agentIds.length === 0) return 0;

    const existing = await auditRepo.countByAgent(agentIds);
    if (existing >= count) return 0;

    const traceIds = Array.from({ length: 15 }, () => randomUUID());
    const logs: CreateAuditLogInput[] = [];

    for (let i = 0; i < count; i += 1) {
        const agentId = pickRandom(agentIds);
        const traceId = pickRandom(traceIds);
        const r = Math.random();
        let event: string;
        if (r < 0.3) event = 'llm_call';
        else if (r < 0.8) event = 'tool_call';
        else if (r < 0.9) event = 'approval_requested';
        else event = 'approval_resolved';

        const success = Math.random() < 0.9;
        const latencyMs = randomInt(200, 3000);
        const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

        const base: CreateAuditLogInput & { createdAt: Date } = {
            agentId,
            traceId,
            event,
            success,
            latencyMs,
            costUsd: 0,
            createdAt,
        };

        if (event === 'llm_call') {
            const inputTokens = randomInt(500, 5000);
            const outputTokens = randomInt(100, 2000);
            const costUsd = inputTokens * 0.000003 + outputTokens * 0.000015;
            logs.push({ ...base, model: 'claude-sonnet-4-5', inputTokens, outputTokens, costUsd });
        } else if (event === 'tool_call') {
            logs.push({ ...base, toolName: pickRandom(TOOL_NAMES_FOR_LOGS) });
        } else {
            logs.push(base);
        }
    }

    return auditRepo.createMany(logs);
}

async function createMockApprovals(
    approvalRepo: IApprovalRepository,
    agentIds: string[],
    adminUserId: string,
): Promise<number> {
    if (agentIds.length === 0) return 0;

    const existing = await approvalRepo.countByAgents(agentIds);
    if (existing >= 5) return 0;

    const tickets: CreateApprovalInput[] = [];
    const reasoning = 'Mock approval for demo';
    const payload = { mock: true };

    for (let i = 0; i < 2; i += 1) {
        const resolvedAt = new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000);
        const expiresAt = new Date(resolvedAt.getTime() + 2 * 60 * 60 * 1000);
        tickets.push({
            agentId: pickRandom(agentIds),
            actionType: pickRandom(APPROVAL_ACTION_TYPES),
            payload,
            riskScore: 0.3 + Math.random() * 0.6,
            reasoning,
            status: 'APPROVED',
            resolvedById: adminUserId,
            resolvedAt,
            expiresAt,
        });
    }

    {
        const resolvedAt = new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000);
        const expiresAt = new Date(resolvedAt.getTime() + 2 * 60 * 60 * 1000);
        tickets.push({
            agentId: pickRandom(agentIds),
            actionType: pickRandom(APPROVAL_ACTION_TYPES),
            payload,
            riskScore: 0.3 + Math.random() * 0.6,
            reasoning,
            status: 'DENIED',
            resolvedById: adminUserId,
            resolvedAt,
            expiresAt,
        });
    }

    for (let i = 0; i < 2; i += 1) {
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        tickets.push({
            agentId: pickRandom(agentIds),
            actionType: pickRandom(APPROVAL_ACTION_TYPES),
            payload,
            riskScore: 0.5 + Math.random() * 0.45,
            reasoning,
            expiresAt,
        });
    }

    return approvalRepo.createMany(tickets);
}

export async function seedMockData(
    agentRepo: IAgentRepository,
    auditRepo: IAuditRepository,
    approvalRepo: IApprovalRepository,
    userRepo: IUserRepository,
): Promise<{
    agentsCreated: number;
    logsCreated: number;
    approvalsCreated: number;
}> {
    const admin = await userRepo.findByRole('admin');
    if (!admin) {
        throw new Error('No admin user found. Run prisma db seed first.');
    }

    const { agentIds, created: agentsCreated } = await createMockAgents(agentRepo);
    const logsCreated = await createMockLogs(auditRepo, agentIds);
    const approvalsCreated = await createMockApprovals(approvalRepo, agentIds, admin.id);

    return { agentsCreated, logsCreated, approvalsCreated };
}
