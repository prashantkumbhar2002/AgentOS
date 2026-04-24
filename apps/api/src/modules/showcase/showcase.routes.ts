import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { EmailAgentInputSchema, ResearchAgentInputSchema, LocalAgentInputSchema, MultiProviderInputSchema } from './showcase.schema.js';
import { runEmailDraftAgent } from '../../showcase-agents/emailDraftAgent.js';
import { runResearchAgent } from '../../showcase-agents/researchAgent.js';
import { runLocalEmailAgent } from '../../showcase-agents/localEmailAgent.js';
import { runMultiProviderAgent } from '../../showcase-agents/multiProviderAgent.js';
import { seedMockData } from '../../showcase-agents/mockAgent.js';
import { env } from '../../config/env.js';
import type { GovernanceClientConfig } from '@agentos/governance-sdk';
import { NotFoundError, ValidationError, ExternalServiceError } from '../../errors/index.js';

export default async function showcaseRoutes(fastify: FastifyInstance) {
    const { agentRepo, auditRepo, approvalRepo, userRepo } = fastify.services;

    fastify.post(
        '/email-agent/run',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = EmailAgentInputSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.flatten() });
            }

            const agent = await agentRepo.findByName('Email Draft Agent');
            if (!agent) {
                throw new NotFoundError('Agent', 'Email Draft Agent');
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
                    throw new ExternalServiceError('Anthropic', message);
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
                throw new ValidationError('Validation failed', { issues: parsed.error.flatten() });
            }

            const agent = await agentRepo.findByName('Research Agent');
            if (!agent) {
                throw new NotFoundError('Agent', 'Research Agent');
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
                    throw new ExternalServiceError('Anthropic', message);
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/local-agent/run',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = LocalAgentInputSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.flatten() });
            }

            const agent = await agentRepo.findByName('Email Draft Agent');
            if (!agent) {
                throw new NotFoundError('Agent', 'Email Draft Agent');
            }

            const token = (request.headers.authorization ?? '').replace('Bearer ', '');
            const config: GovernanceClientConfig = {
                platformUrl: `http://localhost:${env.PORT}`,
                agentId: agent.id,
                apiKey: token,
            };

            try {
                const result = await runLocalEmailAgent(config, parsed.data.task, parsed.data.model);
                return reply.status(201).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message.includes('Ollama')) {
                    throw new ExternalServiceError('Ollama', message);
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/multi-provider/run',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const parsed = MultiProviderInputSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.flatten() });
            }

            const agent = await agentRepo.findByName('Email Draft Agent');
            if (!agent) {
                throw new NotFoundError('Agent', 'Email Draft Agent');
            }

            const token = (request.headers.authorization ?? '').replace('Bearer ', '');
            const config: GovernanceClientConfig = {
                platformUrl: `http://localhost:${env.PORT}`,
                agentId: agent.id,
                apiKey: token,
            };

            try {
                const result = await runMultiProviderAgent(config, parsed.data.task);
                return reply.status(201).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (message === 'ANTHROPIC_API_KEY not configured') {
                    throw new ExternalServiceError('Anthropic', message);
                }
                throw err;
            }
        },
    );

    fastify.post(
        '/mock/seed',
        { preHandler: [requireRole(['admin'])] },
        async (_request, reply) => {
            const result = await seedMockData(agentRepo, auditRepo, approvalRepo, userRepo);
            return reply.status(200).send(result);
        },
    );
}
