import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { CreatePolicyInput, UpdatePolicyInput, PolicyListQuery } from '@agentos/types';

export async function createPolicy(prisma: PrismaClient, data: CreatePolicyInput) {
  const existing = await prisma.policy.findUnique({ where: { name: data.name } });
  if (existing) {
    throw new Error('Policy name already exists');
  }

  return prisma.policy.create({
    data: {
      name: data.name,
      description: data.description,
      rules: {
        create: data.rules.map((r) => ({
          actionType: r.actionType,
          riskTiers: r.riskTiers,
          effect: r.effect,
          conditions: r.conditions
            ? (r.conditions as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        })),
      },
    },
    include: { rules: true },
  });
}

export async function listPolicies(prisma: PrismaClient, query: PolicyListQuery) {
  const { isActive, page, limit } = query;

  const where: Record<string, unknown> = {};
  if (isActive !== undefined) where['isActive'] = isActive;

  const [data, total] = await Promise.all([
    prisma.policy.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { rules: true },
    }),
    prisma.policy.count({ where }),
  ]);

  return { data, total, page, limit };
}

export async function getPolicyById(prisma: PrismaClient, id: string) {
  const policy = await prisma.policy.findUnique({
    where: { id },
    include: {
      rules: true,
      agents: {
        include: {
          agent: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!policy) return null;

  return {
    ...policy,
    agents: policy.agents.map((a) => ({
      agentId: a.agent.id,
      agentName: a.agent.name,
    })),
  };
}

export async function updatePolicy(
  prisma: PrismaClient,
  id: string,
  data: UpdatePolicyInput,
) {
  const existing = await prisma.policy.findUnique({ where: { id } });
  if (!existing) return null;

  if (data.name && data.name !== existing.name) {
    const nameConflict = await prisma.policy.findUnique({ where: { name: data.name } });
    if (nameConflict) {
      throw new Error('Policy name already exists');
    }
  }

  return prisma.policy.update({
    where: { id },
    data,
    include: { rules: true },
  });
}

export async function deletePolicy(prisma: PrismaClient, id: string) {
  const policy = await prisma.policy.findUnique({
    where: { id },
    include: { _count: { select: { agents: true } } },
  });

  if (!policy) return null;

  if (policy._count.agents > 0) {
    throw new Error(
      `Cannot delete policy assigned to ${policy._count.agents} agents. Unassign first.`,
    );
  }

  await prisma.policyRule.deleteMany({ where: { policyId: id } });
  await prisma.policy.delete({ where: { id } });

  return { id, deleted: true };
}

export async function assignToAgent(
  prisma: PrismaClient,
  policyId: string,
  agentId: string,
) {
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy) throw new Error('Policy not found');

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error('Agent not found');

  const existing = await prisma.agentPolicy.findUnique({
    where: { agentId_policyId: { agentId, policyId } },
  });
  if (existing) throw new Error('Policy already assigned to this agent');

  await prisma.agentPolicy.create({ data: { agentId, policyId } });

  return { policyId, agentId, assigned: true };
}

export async function unassignFromAgent(
  prisma: PrismaClient,
  policyId: string,
  agentId: string,
) {
  const existing = await prisma.agentPolicy.findUnique({
    where: { agentId_policyId: { agentId, policyId } },
  });
  if (!existing) throw new Error('Assignment not found');

  await prisma.agentPolicy.delete({
    where: { agentId_policyId: { agentId, policyId } },
  });

  return { policyId, agentId, unassigned: true };
}
