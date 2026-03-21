import type { PrismaClient, Agent, Prisma } from '@prisma/client';
import type {
  CreateAgentInput,
  UpdateAgentInput,
  AgentStatus,
  AgentListQuery,
} from '@agentos/types';
import { calculateHealthScore } from '../../utils/health-score.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['APPROVED', 'DEPRECATED'],
  PENDING_APPROVAL: ['APPROVED', 'DEPRECATED'],
  APPROVED: ['ACTIVE', 'DEPRECATED'],
  ACTIVE: ['SUSPENDED', 'DEPRECATED'],
  SUSPENDED: ['ACTIVE', 'DEPRECATED'],
  DEPRECATED: [],
};

export function validateStatusTransition(
  currentStatus: string,
  newStatus: string,
): { valid: boolean; message?: string } {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    if (currentStatus === 'DEPRECATED') {
      return {
        valid: false,
        message: 'DEPRECATED is a terminal state. No further transitions are allowed.',
      };
    }
    const hint =
      currentStatus === 'DRAFT' && newStatus === 'ACTIVE'
        ? ' Agent must be APPROVED first.'
        : '';
    return {
      valid: false,
      message: `Invalid transition: ${currentStatus} → ${newStatus}.${hint}`,
    };
  }
  return { valid: true };
}

export async function createAgent(
  prisma: PrismaClient,
  data: CreateAgentInput,
): Promise<Agent> {
  return prisma.agent.create({
    data: {
      name: data.name,
      description: data.description,
      ownerTeam: data.ownerTeam,
      llmModel: data.llmModel,
      riskTier: data.riskTier,
      environment: data.environment,
      tags: data.tags ?? [],
      tools: {
        create: data.tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
      },
    },
    include: { tools: true },
  });
}

export async function listAgents(
  prisma: PrismaClient,
  query: AgentListQuery,
): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
  const { status, riskTier, environment, ownerTeam, search, page, limit } = query;

  const where: Prisma.AgentWhereInput = {};

  if (status) where.status = status;
  if (riskTier) where.riskTier = riskTier;
  if (environment) where.environment = environment;
  if (ownerTeam) where.ownerTeam = ownerTeam;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tools: true } },
      },
    }),
    prisma.agent.count({ where }),
  ]);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const data = await Promise.all(
    agents.map(async (agent) => {
      const costAgg = await prisma.auditLog.aggregate({
        where: {
          agentId: agent.id,
          createdAt: { gte: sevenDaysAgo },
        },
        _sum: { costUsd: true },
      });

      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        riskTier: agent.riskTier,
        ownerTeam: agent.ownerTeam,
        environment: agent.environment,
        lastActiveAt: agent.lastActiveAt,
        toolCount: agent._count.tools,
        cost7dUsd: costAgg._sum.costUsd ?? 0,
      };
    }),
  );

  return { data, total, page, limit };
}

export async function getAgentById(
  prisma: PrismaClient,
  id: string,
): Promise<unknown | null> {
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      tools: true,
      policies: {
        include: { policy: { include: { rules: true } } },
      },
    },
  });

  if (!agent) return null;

  const stats = await computeAgentStats(prisma, id);

  const recentLogs = await prisma.auditLog.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const pendingApprovals = await prisma.approvalTicket.findMany({
    where: { agentId: id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  const policies = agent.policies.map((ap) => ap.policy);

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    ownerTeam: agent.ownerTeam,
    llmModel: agent.llmModel,
    riskTier: agent.riskTier,
    environment: agent.environment,
    status: agent.status,
    approvedBy: agent.approvedBy,
    tags: agent.tags,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    lastActiveAt: agent.lastActiveAt,
    tools: agent.tools,
    stats,
    recentLogs,
    pendingApprovals,
    policies,
  };
}

export async function computeAgentStats(
  prisma: PrismaClient,
  agentId: string,
): Promise<{
  totalRuns: number;
  totalCost7dUsd: number;
  avgLatencyMs: number;
  errorRate: number;
  healthScore: number;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalRuns, errorCount, costAgg, latencyAgg] = await Promise.all([
    prisma.auditLog.count({ where: { agentId } }),
    prisma.auditLog.count({ where: { agentId, success: false } }),
    prisma.auditLog.aggregate({
      where: { agentId, createdAt: { gte: sevenDaysAgo } },
      _sum: { costUsd: true },
    }),
    prisma.auditLog.aggregate({
      where: { agentId },
      _avg: { latencyMs: true },
    }),
  ]);

  const deniedApprovals = await prisma.approvalTicket.count({
    where: { agentId, status: 'DENIED' },
  });
  const totalApprovals = await prisma.approvalTicket.count({
    where: { agentId },
  });

  const errorRate = totalRuns > 0 ? errorCount / totalRuns : 0;
  const approvalDenyRate = totalApprovals > 0 ? deniedApprovals / totalApprovals : 0;
  const avgLatencyMs = latencyAgg._avg.latencyMs ?? 0;
  const totalCost7dUsd = costAgg._sum.costUsd ?? 0;

  const healthScore = calculateHealthScore(errorRate, approvalDenyRate, avgLatencyMs);

  return {
    totalRuns,
    totalCost7dUsd,
    avgLatencyMs,
    errorRate,
    healthScore,
  };
}

export async function updateAgent(
  prisma: PrismaClient,
  id: string,
  data: UpdateAgentInput,
): Promise<Agent | null> {
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) return null;

  const updateData: Prisma.AgentUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.ownerTeam !== undefined) updateData.ownerTeam = data.ownerTeam;
  if (data.llmModel !== undefined) updateData.llmModel = data.llmModel;
  if (data.riskTier !== undefined) updateData.riskTier = data.riskTier;
  if (data.environment !== undefined) updateData.environment = data.environment;
  if (data.tags !== undefined) updateData.tags = data.tags;

  if (data.tools !== undefined) {
    await prisma.agentTool.deleteMany({ where: { agentId: id } });
    updateData.tools = {
      create: data.tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    };
  }

  return prisma.agent.update({
    where: { id },
    data: updateData,
    include: { tools: true },
  });
}

export async function updateAgentStatus(
  prisma: PrismaClient,
  id: string,
  newStatus: AgentStatus,
  userId: string,
): Promise<{ agent: Agent; oldStatus: string } | null> {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return null;

  const oldStatus = agent.status;

  const updateData: Prisma.AgentUpdateInput = { status: newStatus };
  if (newStatus === 'APPROVED') {
    updateData.approvedBy = userId;
  }

  const updated = await prisma.agent.update({
    where: { id },
    data: updateData,
  });

  return { agent: updated, oldStatus };
}
