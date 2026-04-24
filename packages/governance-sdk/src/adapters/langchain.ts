import type { GovernanceClient } from '../GovernanceClient.js';

/**
 * LangChain callback handler adapter.
 * Implements the shape of LangChain's BaseCallbackHandler to auto-log
 * LLM and tool calls without manual wrapping.
 *
 * Usage:
 *   import { createLangChainCallback } from '@agentos/governance-sdk/adapters/langchain';
 *
 *   const handler = createLangChainCallback(gov);
 *   const llm = new ChatOpenAI({ callbacks: [handler] });
 */
export interface LangChainCallbackHandler {
    name: string;
    handleLLMStart: (llm: { id: string[] }, prompts: string[]) => void;
    handleLLMEnd: (output: LangChainLLMResult) => void;
    handleLLMError: (err: Error) => void;
    handleToolStart: (tool: { id: string[]; name: string }, input: string) => void;
    handleToolEnd: (output: string) => void;
    handleToolError: (err: Error) => void;
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

export function createLangChainCallback(gov: GovernanceClient): LangChainCallbackHandler {
    let llmStartTime = 0;
    let toolStartTime = 0;
    let currentToolName = '';

    return {
        name: 'AgentOSGovernanceCallback',

        handleLLMStart(_llm: { id: string[] }, _prompts: string[]) {
            llmStartTime = Date.now();
        },

        handleLLMEnd(output: LangChainLLMResult) {
            const latencyMs = Date.now() - llmStartTime;
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

        handleLLMError(err: Error) {
            const latencyMs = Date.now() - llmStartTime;
            gov.logEvent({
                event: 'llm_call',
                provider: 'langchain',
                model: 'unknown',
                latencyMs,
                success: false,
                errorMsg: err.message,
            });
        },

        handleToolStart(tool: { id: string[]; name: string }, _input: string) {
            toolStartTime = Date.now();
            currentToolName = tool.name;
        },

        handleToolEnd(_output: string) {
            const latencyMs = Date.now() - toolStartTime;
            gov.logEvent({
                event: 'tool_call',
                toolName: currentToolName,
                latencyMs,
                success: true,
            });
        },

        handleToolError(err: Error) {
            const latencyMs = Date.now() - toolStartTime;
            gov.logEvent({
                event: 'tool_call',
                toolName: currentToolName,
                latencyMs,
                success: false,
                errorMsg: err.message,
            });
        },
    };
}
