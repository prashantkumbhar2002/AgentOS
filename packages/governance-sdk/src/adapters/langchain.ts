import type { GovernanceClient } from '../GovernanceClient.js';

/**
 * LangChain callback handler adapter.
 * Implements the shape of LangChain's BaseCallbackHandler to auto-log
 * LLM and tool calls without manual wrapping.
 *
 * State is keyed on the per-invocation `runId` LangChain provides to every
 * callback, so concurrent LLM/tool runs (e.g. RunnableParallel, parallel tool
 * calls) are tracked independently.
 *
 * Usage:
 *   import { createLangChainCallback } from '@agentos/governance-sdk/adapters/langchain';
 *
 *   const handler = createLangChainCallback(gov);
 *   const llm = new ChatOpenAI({ callbacks: [handler] });
 */
export interface LangChainCallbackHandler {
    name: string;
    handleLLMStart: (llm: { id: string[] }, prompts: string[], runId: string) => void;
    handleLLMEnd: (output: LangChainLLMResult, runId: string) => void;
    handleLLMError: (err: Error, runId: string) => void;
    handleToolStart: (tool: { id: string[]; name: string }, input: string, runId: string) => void;
    handleToolEnd: (output: string, runId: string) => void;
    handleToolError: (err: Error, runId: string) => void;
}

export interface LangChainLLMResult {
    generations: Array<Array<{ text: string }>>;
    llmOutput?: {
        tokenUsage?: {
            promptTokens?: number;
            completionTokens?: number;
        };
        model_name?: string;
    };
}

interface LLMRunState {
    startedAt: number;
}

interface ToolRunState {
    startedAt: number;
    name: string;
}

export function createLangChainCallback(gov: GovernanceClient): LangChainCallbackHandler {
    const llmRuns = new Map<string, LLMRunState>();
    const toolRuns = new Map<string, ToolRunState>();

    const fallbackRunId = (runId: string | undefined): string => runId ?? '__no_run_id__';

    return {
        name: 'AgentOSGovernanceCallback',

        handleLLMStart(_llm: { id: string[] }, _prompts: string[], runId: string) {
            llmRuns.set(fallbackRunId(runId), { startedAt: Date.now() });
        },

        handleLLMEnd(output: LangChainLLMResult, runId: string) {
            const key = fallbackRunId(runId);
            const state = llmRuns.get(key);
            llmRuns.delete(key);
            const latencyMs = state ? Date.now() - state.startedAt : 0;
            const usage = output.llmOutput?.tokenUsage;
            gov.logEvent({
                event: 'llm_call',
                provider: 'langchain',
                model: output.llmOutput?.model_name ?? 'unknown',
                inputTokens: usage?.promptTokens,
                outputTokens: usage?.completionTokens,
                latencyMs,
                success: true,
            });
        },

        handleLLMError(err: Error, runId: string) {
            const key = fallbackRunId(runId);
            const state = llmRuns.get(key);
            llmRuns.delete(key);
            const latencyMs = state ? Date.now() - state.startedAt : 0;
            gov.logEvent({
                event: 'llm_call',
                provider: 'langchain',
                model: 'unknown',
                latencyMs,
                success: false,
                errorMsg: err.message,
            });
        },

        handleToolStart(tool: { id: string[]; name: string }, _input: string, runId: string) {
            toolRuns.set(fallbackRunId(runId), { startedAt: Date.now(), name: tool.name });
        },

        handleToolEnd(_output: string, runId: string) {
            const key = fallbackRunId(runId);
            const state = toolRuns.get(key);
            toolRuns.delete(key);
            if (!state) return;
            const latencyMs = Date.now() - state.startedAt;
            gov.logEvent({
                event: 'tool_call',
                toolName: state.name,
                latencyMs,
                success: true,
            });
        },

        handleToolError(err: Error, runId: string) {
            const key = fallbackRunId(runId);
            const state = toolRuns.get(key);
            toolRuns.delete(key);
            if (!state) return;
            const latencyMs = Date.now() - state.startedAt;
            gov.logEvent({
                event: 'tool_call',
                toolName: state.name,
                latencyMs,
                success: false,
                errorMsg: err.message,
            });
        },
    };
}
