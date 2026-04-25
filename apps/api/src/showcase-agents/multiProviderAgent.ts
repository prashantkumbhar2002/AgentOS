import Anthropic from '@anthropic-ai/sdk';
import {
    GovernanceClient,
    isPolicyDeniedError,
    type GovernanceClientConfig,
} from '@agentos/governance-sdk';
import { createAnthropicAdapter } from '@agentos/governance-sdk/adapters/anthropic';

/**
 * Multi-provider showcase agent.
 * Demonstrates using Anthropic and a generic wrapLLMCall (simulating a second provider)
 * within the same governance trace, with span-based tracing.
 */
export async function runMultiProviderAgent(
    config: GovernanceClientConfig,
    task: string,
): Promise<{
    traceId: string;
    anthropicResult: string;
    secondResult: string;
    status: string;
}> {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const gov = new GovernanceClient({
        ...config,
        budget: { maxCostUsd: 2.0, warnAtUsd: 1.0, onBudgetExceeded: 'warn' },
        resilience: { onPlatformUnavailable: 'fail-closed', retryAttempts: 2 },
    });

    const anthropic = new Anthropic();
    const llm = createAnthropicAdapter(gov, anthropic);

    try {
        // Step 1: Anthropic drafts initial content
        const anthropicMsg = await gov.withSpan('anthropic_draft', () =>
            llm.createMessage({
                model: 'claude-sonnet-4-5',
                max_tokens: 512,
                system: 'You are a helpful assistant. Provide a concise response.',
                messages: [{ role: 'user', content: task }],
            }),
        );

        const anthropicResult = anthropicMsg.content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('\n');

        // Step 2: "Second provider" refines the result
        // This demonstrates wrapLLMCall with any async function — here we use
        // Anthropic again but log it as a different provider to show the pattern
        const secondResult = await gov.withSpan('second_provider_refine', () =>
            gov.wrapLLMCall(
                async () => {
                    const msg = await anthropic.messages.create({
                        model: 'claude-sonnet-4-5',
                        max_tokens: 512,
                        system: 'You are an editor. Refine and improve the following text. Be concise.',
                        messages: [{ role: 'user', content: anthropicResult }],
                    });
                    return msg.content
                        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                        .map((b) => b.text)
                        .join('\n');
                },
                {
                    provider: 'second-provider',
                    model: 'claude-sonnet-4-5',
                },
            ),
        );

        // Step 3: Save combined result with policy gate
        let status = 'APPROVED';
        try {
            await gov.callTool(
                'save_result',
                { resultLength: secondResult.length },
                async () => {
                    console.log('[MultiProviderAgent] Result saved (simulated)');
                    return secondResult;
                },
                {
                    riskScore: 0.2,
                    approvalParams: {
                        reasoning: 'Agent wants to save combined multi-provider result',
                        payload: { resultLength: secondResult.length },
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
            anthropicResult,
            secondResult,
            status,
        };
    } finally {
        await gov.shutdown();
    }
}
