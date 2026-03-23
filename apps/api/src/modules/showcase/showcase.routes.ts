import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { EmailAgentInputSchema, ResearchAgentInputSchema } from './showcase.schema.js';
import { runEmailDraftAgent } from '../../showcase-agents/emailDraftAgent.js';
import { runResearchAgent } from '../../showcase-agents/researchAgent.js';
import { seedMockData } from '../../showcase-agents/mockAgent.js';
import { env } from '../../config/env.js';
import type { GovernanceClientConfig } from '@agentos/governance-sdk';

export default async function showcaseRoutes(fastify: FastifyInstance) {
    const { agentRepo, auditRepo, approvalRepo, userRepo } = fastify.services;

    fastify.post(
        '/email-agent/run',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = EmailAgentInputSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
            }

            const agent = await agentRepo.findByName('Email Draft Agent');
            if (!agent) {
                return reply.status(404).send({ error: 'Email Draft Agent not registered. Run prisma db seed first.' });
            }

            const token = (request.headers.authorization ?? '').replace('Bearer ', '');
            const config: GovernanceClientConfig = {
                platformUrl: `http://localhost:${env.PORT}`,
                agentId: agent.id,
                apiKey: token,
            };

            try {
                const result = await runEmailDraftAgent(config, parsed.data.task);
                return reply.status(201).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'ANTHROPIC_API_KEY not configured') {
                    return reply.status(500).send({ error: message });
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/research-agent/run',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = ResearchAgentInputSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
            }

            const agent = await agentRepo.findByName('Research Agent');
            if (!agent) {
                return reply.status(404).send({ error: 'Research Agent not registered. Run prisma db seed first.' });
            }

            const token = (request.headers.authorization ?? '').replace('Bearer ', '');
            const config: GovernanceClientConfig = {
                platformUrl: `http://localhost:${env.PORT}`,
                agentId: agent.id,
                apiKey: token,
            };

            try {
                const result = await runResearchAgent(config, parsed.data.topic);
                return reply.status(201).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'ANTHROPIC_API_KEY not configured') {
                    return reply.status(500).send({ error: message });
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/mock/seed',
        { preHandler: [requireRole(['admin'])] },
        async (_request, reply) => {
            try {
                const result = await seedMockData(agentRepo, auditRepo, approvalRepo, userRepo);
                return reply.status(200).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                return reply.status(500).send({ error: message });
            }
        },
    );
}
