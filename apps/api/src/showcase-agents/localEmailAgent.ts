import {
    GovernanceClient,
    type GovernanceClientConfig,
} from '@agentos/governance-sdk';
import { env } from '../config/env.js';

interface OllamaChatResponse {
    model: string;
    message: { role: string; content: string };
    total_duration: number;
    prompt_eval_count?: number;
    eval_count?: number;
}

async function ollamaChat(
    model: string,
    system: string,
    userMessage: string,
): Promise<OllamaChatResponse> {
    const res = await fetch(`${env.OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userMessage },
            ],
            stream: false,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama request failed (${res.status}): ${text}`);
    }

    return (await res.json()) as OllamaChatResponse;
}

function parseSubjectAndBody(text: string): { subject: string; body: string } {
    const lines = text.trim().split('\n');
    const subjectIdx = lines.findIndex((l) => l.startsWith('Subject:'));

    if (subjectIdx !== -1) {
        const subject = (lines[subjectIdx] ?? '')
            .replace(/^Subject:\s*/, '')
            .trim();
        const body = lines.slice(subjectIdx + 1).join('\n').trim();
        return { subject, body };
    }

    return { subject: lines[0]?.trim() ?? '', body: lines.slice(1).join('\n').trim() };
}

export async function runLocalEmailAgent(
    config: GovernanceClientConfig,
    task: string,
    model: string,
): Promise<{
    traceId: string;
    status: string;
    ticketId?: string;
    subject: string;
    body: string;
    model: string;
}> {
    const gov = new GovernanceClient({
        ...config,
        resilience: { onPlatformUnavailable: 'fail-closed', retryAttempts: 2 },
    });

    try {
        // Use wrapLLMCall with Ollama — demonstrates provider-agnostic approach
        const ollamaRes = await gov.withSpan('draft_email_local', () =>
            gov.wrapLLMCall(
                () => ollamaChat(
                    model,
                    'You are an email writing assistant. Draft professional emails. Format your response as:\nSubject: <subject line>\n\n<email body>',
                    `Draft an email for this task: ${task}`,
                ),
                (result) => ({
                    provider: 'ollama',
                    model: result.model,
                    inputTokens: result.prompt_eval_count ?? 0,
                    outputTokens: result.eval_count ?? 0,
                    costUsd: 0,
                }),
            ),
        );

        const raw = ollamaRes.message.content;
        const { subject, body } = parseSubjectAndBody(raw);

        let status = 'APPROVED';
        let ticketId: string | undefined;

        try {
            await gov.callTool(
                'send_email',
                { subject, body },
                async () => {
                    console.log('[LocalEmailAgent] Email sent (simulated):', subject);
                    return { sent: true };
                },
                {
                    riskScore: 0.82,
                    approvalParams: {
                        reasoning: 'Local agent wants to send email to external recipient',
                        payload: { subject, body, recipientType: 'external' },
                    },
                },
            );
        } catch (err) {
            if (err && typeof err === 'object' && 'name' in err && err.name === 'PolicyDeniedError') {
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
            model: ollamaRes.model,
            ...(ticketId ? { ticketId } : {}),
        };
    } finally {
        await gov.shutdown();
    }
}
