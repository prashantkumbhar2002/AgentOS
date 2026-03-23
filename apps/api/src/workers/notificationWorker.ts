import { Worker, type Job } from 'bullmq';
import { WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';
import { PrismaApprovalRepository } from '../repositories/prisma/PrismaApprovalRepository.js';
import { getRiskLabel } from '../utils/risk-label.js';
import { env } from '../config/env.js';
import { getRedisConnection } from '../plugins/bullmq.js';

const prisma = new PrismaClient();
const approvalRepo = new PrismaApprovalRepository(prisma);

function truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.slice(0, max - 3) + '...';
}

async function handleSlackNotification(job: Job) {
    if (!env.SLACK_BOT_TOKEN || !env.SLACK_CHANNEL_ID) {
        console.warn('[notificationWorker] Slack env vars missing — skipping notification');
        return;
    }

    const { ticketId } = job.data as { ticketId: string };

    const ticket = await approvalRepo.findById(ticketId);

    if (!ticket) {
        console.warn(`[notificationWorker] Ticket ${ticketId} not found`);
        return;
    }

    const { label, emoji } = getRiskLabel(ticket.riskScore);
    const payloadStr = truncate(JSON.stringify(ticket.payload, null, 2), 500);
    const expiresFormatted = ticket.expiresAt.toISOString();

    const slack = new WebClient(env.SLACK_BOT_TOKEN);

    try {
        const result = await slack.chat.postMessage({
            channel: env.SLACK_CHANNEL_ID,
            text: `Approval needed: ${ticket.agentName} wants to ${ticket.actionType}`,
            blocks: [
                {
                    type: 'header',
                    text: { type: 'plain_text', text: `${emoji} Approval Request`, emoji: true },
                },
                {
                    type: 'section',
                    fields: [
                        { type: 'mrkdwn', text: `*Agent:*\n${ticket.agentName}` },
                        { type: 'mrkdwn', text: `*Action:*\n${ticket.actionType}` },
                        { type: 'mrkdwn', text: `*Risk:*\n${emoji} ${label} (${ticket.riskScore})` },
                        { type: 'mrkdwn', text: `*Expires:*\n${expiresFormatted}` },
                    ],
                },
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `*Reasoning:*\n${ticket.reasoning}` },
                },
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `*Payload:*\n\`\`\`${payloadStr}\`\`\`` },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: 'Approve' },
                            style: 'primary',
                            value: `approve:${ticket.id}`,
                            action_id: 'approval_approve',
                        },
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: 'Deny' },
                            style: 'danger',
                            value: `deny:${ticket.id}`,
                            action_id: 'approval_deny',
                        },
                    ],
                },
            ],
        });

        if (result.ts) {
            await approvalRepo.updateSlackMsgTs(ticketId, result.ts);
        }
    } catch (err) {
        console.warn('[notificationWorker] Slack API error:', err);
    }
}

async function handleSlackUpdate(job: Job) {
    if (!env.SLACK_BOT_TOKEN || !env.SLACK_CHANNEL_ID) return;

    const { ticketId, decision, resolverName } = job.data as {
        ticketId: string;
        decision: string;
        resolverName: string;
    };

    const ticket = await approvalRepo.findById(ticketId);

    if (!ticket?.slackMsgTs) return;

    const slack = new WebClient(env.SLACK_BOT_TOKEN);
    const statusText = decision === 'APPROVED' ? '✅ Approved' : '❌ Denied';

    try {
        await slack.chat.update({
            channel: env.SLACK_CHANNEL_ID,
            ts: ticket.slackMsgTs,
            text: `${statusText} by ${resolverName}`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `${statusText} by *${resolverName}*`,
                    },
                },
            ],
        });
    } catch (err) {
        console.warn('[notificationWorker] Failed to update Slack message:', err);
    }
}

export function startNotificationWorker() {
    const connection = getRedisConnection();

    const worker = new Worker(
        'notifications',
        async (job: Job) => {
            switch (job.name) {
                case 'slack-approval-notification':
                    await handleSlackNotification(job);
                    break;
                case 'slack-approval-update':
                    await handleSlackUpdate(job);
                    break;
                default:
                    break;
            }
        },
        {
            connection,
            concurrency: 5,
        },
    );

    worker.on('failed', (job, err) => {
        console.error(`[notificationWorker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
}
