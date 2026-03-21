import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function seedUsers() {
  const users = [
    {
      email: 'admin@agentos.dev',
      password: 'admin123',
      name: 'Platform Admin',
      role: 'admin',
    },
    {
      email: 'approver@agentos.dev',
      password: 'approver123',
      name: 'Agent Approver',
      role: 'approver',
    },
    {
      email: 'viewer@agentos.dev',
      password: 'viewer123',
      name: 'Read Only Viewer',
      role: 'viewer',
    },
  ];

  for (const user of users) {
    const passwordHash = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, name: user.name, role: user.role },
      create: {
        email: user.email,
        passwordHash,
        name: user.name,
        role: user.role,
      },
    });
    console.log(`  Upserted user: ${user.email} (${user.role})`);
  }
}

async function seedAgents() {
  const agents = [
    {
      name: 'Email Draft Agent',
      description: 'Drafts and sends emails on behalf of sales team',
      ownerTeam: 'sales',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'HIGH' as const,
      environment: 'PROD' as const,
      status: 'ACTIVE' as const,
      tags: ['email', 'sales', 'automation'],
    },
    {
      name: 'Research Agent',
      description: 'Researches topics and synthesizes findings',
      ownerTeam: 'product',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'MEDIUM' as const,
      environment: 'PROD' as const,
      status: 'ACTIVE' as const,
      tags: ['research', 'product', 'analysis'],
    },
  ];

  for (const agent of agents) {
    const existing = await prisma.agent.findFirst({
      where: { name: agent.name },
    });

    if (existing) {
      await prisma.agent.update({
        where: { id: existing.id },
        data: agent,
      });
      console.log(`  Updated agent: ${agent.name}`);
    } else {
      await prisma.agent.create({ data: agent });
      console.log(`  Created agent: ${agent.name}`);
    }
  }
}

async function seedPolicies() {
  const policies = [
    {
      name: 'External Email Approval',
      description:
        'Sending email to external domain requires human approval',
      rules: [
        {
          actionType: 'send_email',
          riskTiers: ['MEDIUM' as const, 'HIGH' as const, 'CRITICAL' as const],
          effect: 'REQUIRE_APPROVAL' as const,
          conditions: { recipientDomain: 'external' },
        },
      ],
    },
    {
      name: 'Delete Protection',
      description:
        'Delete record action is always denied for CRITICAL agents',
      rules: [
        {
          actionType: 'delete_record',
          riskTiers: ['CRITICAL' as const],
          effect: 'DENY' as const,
          conditions: null,
        },
      ],
    },
    {
      name: 'Low Risk Auto-Allow',
      description:
        'All actions by LOW risk agents are automatically allowed',
      rules: [
        {
          actionType: '*',
          riskTiers: ['LOW' as const],
          effect: 'ALLOW' as const,
          conditions: null,
        },
      ],
    },
  ];

  for (const policyData of policies) {
    const { rules, ...policyFields } = policyData;

    const policy = await prisma.policy.upsert({
      where: { name: policyFields.name },
      update: { description: policyFields.description },
      create: policyFields,
    });

    await prisma.policyRule.deleteMany({
      where: { policyId: policy.id },
    });

    for (const rule of rules) {
      await prisma.policyRule.create({
        data: { ...rule, policyId: policy.id },
      });
    }

    console.log(`  Upserted policy: ${policyFields.name} (${rules.length} rules)`);
  }
}

async function main() {
  console.log('Seeding database...\n');

  console.log('Users:');
  await seedUsers();

  console.log('\nAgents:');
  await seedAgents();

  console.log('\nPolicies:');
  await seedPolicies();

  console.log('\nSeeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
