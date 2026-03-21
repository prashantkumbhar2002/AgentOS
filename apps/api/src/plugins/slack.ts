import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { resolveTicket } from '../modules/approvals/approvals.service.js';

function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const sigBase = `v0:${timestamp}:${body}`;
  const computed = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBase).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    if (!env.SLACK_BOT_TOKEN || !env.SLACK_SIGNING_SECRET) {
      fastify.log.info('Slack env vars not configured — skipping Slack interactions route');
      return;
    }

    fastify.post(
      '/slack/interactions',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const signature = request.headers['x-slack-signature'] as string;
        const timestamp = request.headers['x-slack-request-timestamp'] as string;

        if (!signature || !timestamp) {
          return reply.status(401).send({ error: 'Missing Slack signature' });
        }

        const bodyStr = typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body);

        if (!verifySlackSignature(env.SLACK_SIGNING_SECRET!, signature, timestamp, bodyStr)) {
          return reply.status(401).send({ error: 'Invalid Slack signature' });
        }

        let payload: Record<string, unknown>;
        try {
          const parsed = typeof request.body === 'string'
            ? JSON.parse(request.body)
            : request.body;
          payload = parsed.payload ? JSON.parse(parsed.payload as string) : parsed;
        } catch {
          return reply.status(400).send({ error: 'Invalid payload' });
        }

        const actions = payload['actions'] as Array<{ value: string }> | undefined;
        if (!actions || actions.length === 0) {
          return reply.status(200).send();
        }

        const actionValue = actions[0]!.value;
        const [action, ticketId] = actionValue.split(':');

        if (!ticketId || (action !== 'approve' && action !== 'deny')) {
          return reply.status(400).send({ error: 'Invalid action' });
        }

        const decision = action === 'approve' ? 'APPROVED' : 'DENIED';

        const slackUser = payload['user'] as Record<string, string> | undefined;
        const slackUserName = slackUser?.['real_name'] ?? slackUser?.['name'] ?? 'Slack User';

        const platformUser = await fastify.prisma.user.findFirst({
          where: { name: { contains: slackUserName } },
        });

        if (!platformUser) {
          return reply.status(200).send({
            response_type: 'ephemeral',
            text: 'Could not map your Slack identity to a platform user. Please resolve via the dashboard.',
          });
        }

        try {
          const result = await resolveTicket(
            fastify.prisma,
            ticketId,
            platformUser.id,
            decision as 'APPROVED' | 'DENIED',
          );

          if (result) {
            fastify.sse.broadcast({
              type: 'approval.resolved',
              payload: {
                ticketId: result.id,
                decision: result.status,
                resolvedBy: result.resolvedBy?.name,
                agentId: result.agentId,
              },
            });
          }

          return reply.status(200).send({
            response_type: 'in_channel',
            text: `${decision === 'APPROVED' ? '✅' : '❌'} ${decision} by ${platformUser.name}`,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          return reply.status(200).send({
            response_type: 'ephemeral',
            text: message,
          });
        }
      },
    );
  },
  { name: 'slack', dependencies: ['prisma', 'sse'] },
);
