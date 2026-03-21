import {
  GovernanceClient,
  type GovernanceClientConfig,
} from '@agentos/governance-sdk';
import type Anthropic from '@anthropic-ai/sdk';

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

const webSearchTools = [
  { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 2 },
] as unknown as NonNullable<
  Anthropic.MessageCreateParamsNonStreaming['tools']
>;

export async function runResearchAgent(
  config: GovernanceClientConfig,
  topic: string,
): Promise<{
  traceId: string;
  report: string;
  status: string;
  ticketId?: string;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const gov = new GovernanceClient(config);

  const planMsg = await gov.createMessage({
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    system:
      'You are a research assistant. Plan searches for the given topic. Return exactly 2 search queries, one per line. No numbering, no bullets, just the raw queries.',
    messages: [{ role: 'user', content: topic }],
  });

  const planLines = extractText(planMsg)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let query1: string;
  let query2: string;
  if (planLines.length >= 2) {
    query1 = planLines[0]!;
    query2 = planLines[1]!;
  } else if (planLines.length === 1) {
    query1 = planLines[0]!;
    query2 = planLines[0]!;
  } else {
    query1 = topic;
    query2 = topic;
  }

  let searchResult1: string;
  try {
    searchResult1 = await gov.callTool(
      'web_search',
      { query: query1 },
      async () => {
        const msg = await gov.createMessage({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: `Search for: ${query1}` }],
          tools: webSearchTools,
        });
        return extractText(msg);
      },
    );
  } catch {
    searchResult1 = 'Search failed for query 1';
  }

  let searchResult2: string;
  try {
    searchResult2 = await gov.callTool(
      'web_search',
      { query: query2 },
      async () => {
        const msg = await gov.createMessage({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: `Search for: ${query2}` }],
          tools: webSearchTools,
        });
        return extractText(msg);
      },
    );
  } catch {
    searchResult2 = 'Search failed for query 2';
  }

  let fetchResult: string;
  try {
    fetchResult = await gov.callTool(
      'web_fetch',
      { url: 'top result' },
      async () => {
        const msg = await gov.createMessage({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `Fetch and summarize the top result from:\n\n${searchResult1}\n\n${searchResult2}`,
            },
          ],
          tools: webSearchTools,
        });
        return extractText(msg);
      },
    );
  } catch {
    fetchResult = 'Fetch failed';
  }

  const combinedForReport = [
    `Query 1 (${query1}):\n${searchResult1}`,
    `Query 2 (${query2}):\n${searchResult2}`,
    `Fetch summary:\n${fetchResult}`,
  ].join('\n\n');

  const reportMsg = await gov.createMessage({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system:
      'Synthesize the following search results into a structured research report with sections: Key Findings, Details, Sources.',
    messages: [{ role: 'user', content: combinedForReport }],
  });

  const report = extractText(reportMsg);

  const { decision, ticketId } = await gov.requestApproval({
    actionType: 'save_report',
    riskScore: 0.35,
    payload: { reportLength: report.length },
    reasoning: 'Agent wants to save research report to shared storage',
  });

  if (decision === 'APPROVED' || decision === 'AUTO_APPROVED') {
    await gov.callTool(
      'save_report',
      { report },
      async () => {
        console.log('[ResearchAgent] Report saved (simulated)');
        return report;
      },
    );
  }

  return {
    traceId: gov.traceId,
    report,
    status: decision,
    ...(ticketId ? { ticketId } : {}),
  };
}
