import Anthropic from '@anthropic-ai/sdk';
import {
    GovernanceClient,
    isPolicyDeniedError,
    type GovernanceClientConfig,
} from '@agentos/governance-sdk';
import { createAnthropicAdapter } from '@agentos/governance-sdk/adapters/anthropic';

function parseSubjectAndBody(text: string): { subject: string; body: string } {
    const trimmed = text.trim();
    const lines = trimmed.split('\n');
    const subjectLineIndex = lines.findIndex((line) =>
        line.startsWith('Subject:'),
    );

    if (subjectLineIndex !== -1) {
        const subject = (lines.at(subjectLineIndex) ?? '')
            .replace(/^Subject:\s*/, '')
            .trim();
        const body = lines.slice(subjectLineIndex + 1).join('\n').trim();
        return { subject, body };
    }

    const subject = lines[0]?.trim() ?? '';
    const body = lines.slice(1).join('\n').trim();
    return { subject, body };
}

export async function runEmailDraftAgent(
    config: GovernanceClientConfig,
    task: string,
): Promise<{
    traceId: string;
    status: string;
    ticketId?: string;
    subject: string;
    body: string;
}> {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const gov = new GovernanceClient({
        ...config,
        budget: { maxCostUsd: 1.0, warnAtUsd: 0.5, onBudgetExceeded: 'warn' },
        resilience: { onPlatformUnavailable: 'fail-closed', retryAttempts: 2 },
    });

    const anthropic = new Anthropic();
    const llm = createAnthropicAdapter(gov, anthropic);

    try {
        const response = await gov.withSpan('draft_email', async () => {
            return llm.createMessage({
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                system:
                    'You are an email writing assistant. Draft professional emails. Format your response as:\nSubject: <subject line>\n\n<email body>',
                messages: [
                    { role: 'user', content: `Draft an email for this task: ${task}` },
                ],
            });
        });

        const block = response.content[0];
        const raw = block?.type === 'text' && typeof block.text === 'string' ? block.text : '';
        const { subject, body } = parseSubjectAndBody(raw);

        // callTool with policy gate: checks policy, requests approval if needed, then executes
        let status = 'APPROVED';
        let ticketId: string | undefined;

        try {
            await gov.callTool(
                'send_email',
                { subject, body },
                async () => {
                    console.log('[EmailDraftAgent] Email sent (simulated):', subject);
                    return { sent: true };
                },
                {
                    riskScore: 0.82,
                    approvalParams: {
                        reasoning: 'Agent wants to send email to external recipient',
                        payload: { subject, body, recipientType: 'external' },
                    },
                },
            );
        } catch (err) {
            if (isPolicyDeniedError(err)) {
                status = 'DENIED';
            } else {
                throw err;
            }
        }

        return {
            traceId: gov.traceId,
            status,
            subject,
            body,
            ...(ticketId ? { ticketId } : {}),
        };
    } finally {
        await gov.shutdown();
    }
}
