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
    const gov = new GovernanceClient(config);

    const start = Date.now();
    let ollamaRes: OllamaChatResponse;

    try {
        ollamaRes = await ollamaChat(
            model,
            'You are an email writing assistant. Draft professional emails. Format your response as:\nSubject: <subject line>\n\n<email body>',
            `Draft an email for this task: ${task}`,
        );
    } catch (err) {
        const latencyMs = Date.now() - start;
        await gov.logEvent({
            event: 'llm_call',
            model,
            latencyMs,
            success: false,
            errorMsg: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }

    const latencyMs = Date.now() - start;
    const inputTokens = ollamaRes.prompt_eval_count ?? 0;
    const outputTokens = ollamaRes.eval_count ?? 0;

    await gov.logEvent({
        event: 'llm_call',
        model: ollamaRes.model,
        inputTokens,
        outputTokens,
        costUsd: 0,
        latencyMs,
        success: true,
    });

    const raw = ollamaRes.message.content;
    const { subject, body } = parseSubjectAndBody(raw);

    const { decision, ticketId } = await gov.requestApproval({
        actionType: 'send_email',
        payload: { subject, body, recipientType: 'external' },
        reasoning: 'Local agent wants to send email to external recipient',
        riskScore: 0.82,
        pollIntervalMs: 2000,
        maxWaitMs: 30000,
    });

    if (decision === 'APPROVED' || decision === 'AUTO_APPROVED') {
        await gov.callTool(
            'send_email',
            { subject, body },
            async () => {
                console.log('[LocalEmailAgent] Email sent (simulated):', subject);
                return { sent: true };
            },
        );
    } else if (decision === 'DENIED') {
        await gov.logEvent({
            event: 'action_blocked',
            actionType: 'send_email',
            reason: 'Approval denied',
        });
    }

    return {
        traceId: gov.traceId,
        status: decision,
        subject,
        body,
        model: ollamaRes.model,
        ...(ticketId ? { ticketId } : {}),
    };
}
