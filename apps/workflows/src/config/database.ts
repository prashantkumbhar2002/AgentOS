import { PrismaClient } from '@prisma/client';

/**
 * Database client for workflow service
 * 
 * Uses Prisma to connect to the AgentOS PostgreSQL database
 * for workflow definition storage and execution tracking.
 */

// Singleton Prisma client
let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

/**
 * Disconnect from database (for graceful shutdown)
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
