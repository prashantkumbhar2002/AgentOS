import { randomUUID } from 'node:crypto';
import type { CreateAgentInput, UpdateAgentInput, AgentListQuery } from '@agentos/types';
import type { IAgentRepository, AgentApiPrincipal, AgentBatchInfo } from '../interfaces/IAgentRepository.js';
import type { AgentDetail, AgentSummary, PaginatedResult } from '../../types/dto.js';

interface ApiKeyRecord {
    hash: string;
    hint: string;
}

export class MockAgentRepository implements IAgentRepository {
    readonly store = new Map<string, AgentDetail>();
    private readonly apiKeys = new Map<string, ApiKeyRecord>();

    async findById(id: string): Promise<AgentDetail | null> {
        return this.store.get(id) ?? null;
    }

    async findMany(filter: AgentListQuery): Promise<PaginatedResult<AgentSummary>> {
        let agents = [...this.store.values()];

        if (filter.status) agents = agents.filter((a) => a.status === filter.status);
        if (filter.riskTier) agents = agents.filter((a) => a.riskTier === filter.riskTier);
        if (filter.environment) agents = agents.filter((a) => a.environment === filter.environment);
        if (filter.ownerTeam) agents = agents.filter((a) => a.ownerTeam === filter.ownerTeam);
        if (filter.search) {
            const s = filter.search.toLowerCase();
            agents = agents.filter((a) => a.name.toLowerCase().includes(s) || a.description.toLowerCase().includes(s));
        }

        const total = agents.length;
        const start = (filter.page - 1) * filter.limit;
        const page = agents.slice(start, start + filter.limit);

        const data: AgentSummary[] = page.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            riskTier: a.riskTier,
            ownerTeam: a.ownerTeam,
            environment: a.environment,
            lastActiveAt: a.lastActiveAt,
            toolCount: a.tools.length,
            cost7dUsd: 0,
        }));

        return { data, total, page: filter.page, limit: filter.limit };
    }

    async findByName(name: string): Promise<AgentDetail | null> {
        for (const agent of this.store.values()) {
            if (agent.name === name) return agent;
        }
        return null;
    }

    async create(data: CreateAgentInput): Promise<AgentDetail> {
        const now = new Date();
        const agent: AgentDetail = {
            id: randomUUID(),
            name: data.name,
            description: data.description,
            ownerTeam: data.ownerTeam,
            llmModel: data.llmModel,
            riskTier: data.riskTier,
            environment: data.environment,
            status: 'DRAFT',
            approvedBy: null,
            tags: data.tags ?? [],
            budgetUsd: null,
            createdAt: now,
            updatedAt: now,
            lastActiveAt: null,
            tools: (data.tools ?? []).map((t) => ({ id: randomUUID(), name: t.name, description: t.description })),
            apiKeyHint: null,
            hasApiKey: false,
        };
        this.store.set(agent.id, agent);
        return agent;
    }

    async update(id: string, data: UpdateAgentInput): Promise<AgentDetail | null> {
        const existing = this.store.get(id);
        if (!existing) return null;

        const updated: AgentDetail = {
            ...existing,
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.ownerTeam !== undefined ? { ownerTeam: data.ownerTeam } : {}),
            ...(data.llmModel !== undefined ? { llmModel: data.llmModel } : {}),
            ...(data.riskTier !== undefined ? { riskTier: data.riskTier } : {}),
            ...(data.environment !== undefined ? { environment: data.environment } : {}),
            ...(data.tags !== undefined ? { tags: data.tags } : {}),
            ...(data.budgetUsd !== undefined ? { budgetUsd: data.budgetUsd } : {}),
            updatedAt: new Date(),
            tools: data.tools
                ? data.tools.map((t) => ({ id: randomUUID(), name: t.name, description: t.description }))
                : existing.tools,
        };
        this.store.set(id, updated);
        return updated;
    }

    async updateStatus(id: string, status: string, approvedBy?: string): Promise<AgentDetail | null> {
        const existing = this.store.get(id);
        if (!existing) return null;

        const updated: AgentDetail = {
            ...existing,
            status,
            approvedBy: approvedBy ?? existing.approvedBy,
            updatedAt: new Date(),
        };
        this.store.set(id, updated);
        return updated;
    }

    async exists(id: string): Promise<boolean> {
        return this.store.has(id);
    }

    async updateLastActiveAt(id: string): Promise<void> {
        const existing = this.store.get(id);
        if (existing) {
            this.store.set(id, { ...existing, lastActiveAt: new Date() });
        }
    }

    async findNameById(id: string): Promise<string | null> {
        return this.store.get(id)?.name ?? null;
    }

    async findByApiKeyHash(hash: string): Promise<AgentApiPrincipal | null> {
        for (const [agentId, record] of this.apiKeys) {
            if (record.hash === hash) {
                const agent = this.store.get(agentId);
                if (!agent) return null;
                return { id: agent.id, name: agent.name, status: agent.status };
            }
        }
        return null;
    }

    async setApiKey(id: string, hash: string, hint: string): Promise<void> {
        this.apiKeys.set(id, { hash, hint });
        const agent = this.store.get(id);
        if (agent) {
            this.store.set(id, { ...agent, apiKeyHint: hint, hasApiKey: true });
        }
    }

    async findInfoByIds(ids: string[]): Promise<AgentBatchInfo[]> {
        const out: AgentBatchInfo[] = [];
        for (const id of ids) {
            const agent = this.store.get(id);
            if (agent) {
                out.push({ id: agent.id, status: agent.status, budgetUsd: agent.budgetUsd });
            }
        }
        return out;
    }

    seed(overrides: Partial<AgentDetail> = {}): AgentDetail {
        const now = new Date();
        const agent: AgentDetail = {
            id: randomUUID(),
            name: 'Test Agent',
            description: 'Test',
            ownerTeam: 'engineering',
            llmModel: 'claude-sonnet-4-5',
            riskTier: 'MEDIUM',
            environment: 'DEV',
            status: 'ACTIVE',
            approvedBy: null,
            tags: [],
            budgetUsd: null,
            createdAt: now,
            updatedAt: now,
            lastActiveAt: null,
            tools: [],
            apiKeyHint: null,
            hasApiKey: false,
            ...overrides,
        };
        this.store.set(agent.id, agent);
        return agent;
    }
}
