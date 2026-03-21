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
  const showcaseAgents = [
    {
      name: 'Email Draft Agent',
      description: 'Drafts and sends emails on behalf of users',
      ownerTeam: 'platform-demo',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'HIGH' as const,
      environment: 'PROD' as const,
      status: 'ACTIVE' as const,
      tags: ['email', 'showcase', 'demo'],
      tools: [
        { name: 'send_email', description: 'Send emails to recipients' },
        { name: 'read_inbox', description: 'Read email inbox' },
      ],
    },
    {
      name: 'Research Agent',
      description: 'Researches topics using web search and synthesizes reports',
      ownerTeam: 'platform-demo',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'MEDIUM' as const,
      environment: 'PROD' as const,
      status: 'ACTIVE' as const,
      tags: ['research', 'showcase', 'demo'],
      tools: [
        { name: 'web_search', description: 'Search the web' },
        { name: 'web_fetch', description: 'Fetch web page content' },
        { name: 'save_report', description: 'Save research reports' },
      ],
    },
  ];

  const mockAgents = [
    {
      name: 'Mock CRM Agent',
      description: 'Simulated CRM agent for demo purposes',
      ownerTeam: 'platform-demo',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'MEDIUM' as const,
      environment: 'DEV' as const,
      status: 'ACTIVE' as const,
      tags: ['crm', 'mock', 'demo'],
      tools: [
        { name: 'crm_read', description: 'Read CRM records' },
        { name: 'crm_write', description: 'Write CRM records' },
        { name: 'send_notification', description: 'Send notifications' },
      ],
    },
    {
      name: 'Mock Analytics Agent',
      description: 'Simulated analytics agent for demo purposes',
      ownerTeam: 'platform-demo',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'LOW' as const,
      environment: 'DEV' as const,
      status: 'ACTIVE' as const,
      tags: ['analytics', 'mock', 'demo'],
      tools: [
        { name: 'query_db', description: 'Query database' },
        { name: 'generate_chart', description: 'Generate charts' },
        { name: 'export_csv', description: 'Export CSV files' },
      ],
    },
    {
      name: 'Mock Compliance Agent',
      description: 'Simulated compliance agent for demo purposes',
      ownerTeam: 'platform-demo',
      llmModel: 'claude-sonnet-4-5',
      riskTier: 'CRITICAL' as const,
      environment: 'DEV' as const,
      status: 'ACTIVE' as const,
      tags: ['compliance', 'mock', 'demo'],
      tools: [
        { name: 'audit_read', description: 'Read audit records' },
        { name: 'flag_record', description: 'Flag records for review' },
        { name: 'notify_compliance', description: 'Notify compliance team' },
      ],
    },
  ];

  const allAgents = [...showcaseAgents, ...mockAgents];

  for (const agentDef of allAgents) {
    const { tools, ...agentData } = agentDef;
    const existing = await prisma.agent.findFirst({
      where: { name: agentData.name },
    });

    if (existing) {
      await prisma.agent.update({
        where: { id: existing.id },
        data: agentData,
      });
      const existingTools = await prisma.agentTool.findMany({
        where: { agentId: existing.id },
      });
      if (existingTools.length === 0) {
        for (const tool of tools) {
          await prisma.agentTool.create({
            data: { ...tool, agentId: existing.id },
          });
        }
      }
      console.log(`  Updated agent: ${agentData.name}`);
    } else {
      await prisma.agent.create({
        data: {
          ...agentData,
          tools: { create: tools },
        },
      });
      console.log(`  Created agent: ${agentData.name}`);
    }
  }
}

async function assignPolicyToEmailAgent() {
  const emailAgent = await prisma.agent.findFirst({
    where: { name: 'Email Draft Agent' },
  });
  const emailPolicy = await prisma.policy.findFirst({
    where: { name: 'External Email Approval' },
  });

  if (emailAgent && emailPolicy) {
    await prisma.agentPolicy.upsert({
      where: {
        agentId_policyId: {
          agentId: emailAgent.id,
          policyId: emailPolicy.id,
        },
      },
      update: {},
      create: {
        agentId: emailAgent.id,
        policyId: emailPolicy.id,
      },
    });
    console.log(`  Assigned "${emailPolicy.name}" to "${emailAgent.name}"`);
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

  console.log('\nPolicy Assignments:');
  await assignPolicyToEmailAgent();

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
