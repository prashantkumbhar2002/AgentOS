import Anthropic from '@anthropic-ai/sdk';
import {
    GovernanceClient,
    isPolicyDeniedError,
    type GovernanceClientConfig,
} from '@agentos/governance-sdk';
import { createAnthropicAdapter } from '@agentos/governance-sdk/adapters/anthropic';

function extractText(msg: { content: Array<{ type: string; text?: string }> }): string {
    return msg.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
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

    const gov = new GovernanceClient({
        ...config,
        budget: { maxCostUsd: 5.0, warnAtUsd: 3.0, onBudgetExceeded: 'warn' },
        resilience: { onPlatformUnavailable: 'fail-closed', retryAttempts: 2 },
    });

    const anthropic = new Anthropic();
    const llm = createAnthropicAdapter(gov, anthropic);

    try {
        // Step 1: Plan search queries
        const planMsg = await gov.withSpan('plan_queries', () =>
            llm.createMessage({
                model: 'claude-sonnet-4-5',
                max_tokens: 256,
                system:
                    'You are a research assistant. Plan searches for the given topic. Return exactly 2 search queries, one per line. No numbering, no bullets, just the raw queries.',
                messages: [{ role: 'user', content: topic }],
            }),
        );

        const planLines = extractText(planMsg)
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);

        const query1 = planLines[0] ?? topic;
        const query2 = planLines[1] ?? planLines[0] ?? topic;

        // Step 2: Search (nested LLM calls inside tool spans)
        let searchResult1: string;
        try {
            searchResult1 = await gov.withSpan('web_search_1', () =>
                gov.callTool('web_search', { query: query1 }, async () => {
                    const msg = await llm.createMessage({
                        model: 'claude-sonnet-4-5',
                        max_tokens: 1024,
                        messages: [{ role: 'user', content: `Search for: ${query1}` }],
                        tools: webSearchTools,
                    });
                    return extractText(msg);
                }),
            );
        } catch {
            searchResult1 = 'Search failed for query 1';
        }

        let searchResult2: string;
        try {
            searchResult2 = await gov.withSpan('web_search_2', () =>
                gov.callTool('web_search', { query: query2 }, async () => {
                    const msg = await llm.createMessage({
                        model: 'claude-sonnet-4-5',
                        max_tokens: 1024,
                        messages: [{ role: 'user', content: `Search for: ${query2}` }],
                        tools: webSearchTools,
                    });
                    return extractText(msg);
                }),
            );
        } catch {
            searchResult2 = 'Search failed for query 2';
        }

        // Step 3: Fetch & summarize
        let fetchResult: string;
        try {
            fetchResult = await gov.withSpan('web_fetch', () =>
                gov.callTool('web_fetch', { url: 'top result' }, async () => {
                    const msg = await llm.createMessage({
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
                }),
            );
        } catch {
            fetchResult = 'Fetch failed';
        }

        // Step 4: Synthesize report
        const combinedForReport = [
            `Query 1 (${query1}):\n${searchResult1}`,
            `Query 2 (${query2}):\n${searchResult2}`,
            `Fetch summary:\n${fetchResult}`,
        ].join('\n\n');

        const reportMsg = await gov.withSpan('synthesize_report', () =>
            llm.createMessage({
                model: 'claude-sonnet-4-5',
                max_tokens: 2048,
                system:
                    'Synthesize the following search results into a structured research report with sections: Key Findings, Details, Sources.',
                messages: [{ role: 'user', content: combinedForReport }],
            }),
        );

        const report = extractText(reportMsg);

        // Step 5: Save report with policy-gated callTool
        let status = 'APPROVED';
        let ticketId: string | undefined;

        try {
            await gov.callTool(
                'save_report',
                { reportLength: report.length },
                async () => {
                    console.log('[ResearchAgent] Report saved (simulated)');
                    return report;
                },
                {
                    riskScore: 0.35,
                    approvalParams: {
                        reasoning: 'Agent wants to save research report to shared storage',
                        payload: { reportLength: report.length },
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
            report,
            status,
            ...(ticketId ? { ticketId } : {}),
        };
    } finally {
        await gov.shutdown();
    }
}
