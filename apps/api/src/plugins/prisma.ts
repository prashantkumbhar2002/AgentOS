import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { ServiceContainer } from '../container.js';

declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient;
        services: ServiceContainer;
    }
}

export default fp(
    async (fastify: FastifyInstance) => {
        const prisma = new PrismaClient({
            log:
                process.env['NODE_ENV'] === 'development'
                    ? ['query', 'warn', 'error']
                    : ['warn', 'error'],
        });

        await prisma.$connect();

        fastify.decorate('prisma', prisma);

        fastify.addHook('onClose', async () => {
            await prisma.$disconnect();
        });
    },
    { name: 'prisma' },
);
