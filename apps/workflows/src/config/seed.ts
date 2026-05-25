import { getPrismaClient } from './database.js';
import { hash } from 'bcrypt';

/**
 * Seed database with system user and agent for workflow registration
 */
export async function seedSystemData() {
  const prisma = getPrismaClient();

  try {
    // Create system user (if doesn't exist)
    const systemUser = await prisma.user.upsert({
      where: { email: 'system@agentos.local' },
      update: {},
      create: {
        id: 'system-user',
        email: 'system@agentos.local',
        passwordHash: await hash('system-password', 10),
        name: 'System',
        role: 'admin',
      },
    });

    // Create system agent (if doesn't exist)
    const systemAgent = await prisma.agent.upsert({
      where: { id: 'system-agent' },
      update: {},
      create: {
        id: 'system-agent',
        name: 'System Agent',
        description: 'System agent for built-in workflows',
        ownerTeam: 'AgentOS',
        llmModel: 'claude-sonnet-4-5',
        riskTier: 'LOW',
        environment: 'PROD',
        status: 'ACTIVE',
      },
    });

    console.log('System user and agent seeded');
    return { systemUser, systemAgent };
  } catch (error) {
    console.error('Error seeding system data:', error);
    throw error;
  }
}
