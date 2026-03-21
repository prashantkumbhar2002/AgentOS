import {
  GovernanceClient,
  type GovernanceClientConfig,
} from '@agentos/governance-sdk';

function extractMessageText(response: {
  content: Array<{ type: string; text?: string }>;
}): string {
  const block = response.content[0];
  if (block?.type === 'text' && typeof block.text === 'string') {
    return block.text;
  }
  return '';
}

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

  const gov = new GovernanceClient(config);

  const response = await gov.createMessage({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system:
      'You are an email writing assistant. Draft professional emails. Format your response as:\nSubject: <subject line>\n\n<email body>',
    messages: [
      { role: 'user', content: `Draft an email for this task: ${task}` },
    ],
  });

  const raw = extractMessageText(response);
  const { subject, body } = parseSubjectAndBody(raw);

  const { decision, ticketId } = await gov.requestApproval({
    actionType: 'send_email',
    payload: { subject, body, recipientType: 'external' },
    reasoning: 'Agent wants to send email to external recipient',
    riskScore: 0.82,
    pollIntervalMs: 2000,
    maxWaitMs: 30000,
  });

  if (decision === 'APPROVED' || decision === 'AUTO_APPROVED') {
    await gov.callTool(
      'send_email',
      { subject, body },
      async () => {
        console.log('[EmailDraftAgent] Email sent (simulated):', subject);
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
    ...(ticketId ? { ticketId } : {}),
  };
}
