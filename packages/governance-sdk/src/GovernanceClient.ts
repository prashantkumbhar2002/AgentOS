import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';

export interface GovernanceClientConfig {
  platformUrl: string;
  agentId: string;
  apiKey: string;
}

export class GovernanceClient {
  private readonly platformUrl: string;
  private readonly agentId: string;
  private readonly apiKey: string;
  private readonly anthropic: Anthropic;
  readonly traceId: string;

  constructor(config: GovernanceClientConfig) {
    this.platformUrl = config.platformUrl.replace(/\/$/, '');
    this.agentId = config.agentId;
    this.apiKey = config.apiKey;
    this.traceId = randomUUID();
    this.anthropic = new Anthropic();
  }

  async logEvent(payload: Record<string, unknown>): Promise<void> {
    try {
      await fetch(`${this.platformUrl}/api/audit/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          agentId: this.agentId,
          traceId: this.traceId,
          ...payload,
        }),
      });
    } catch (err) {
      console.warn('[GovernanceClient] Failed to log event:', err);
    }
  }

  async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    const start = Date.now();
    let response: Anthropic.Message;

    try {
      response = await this.anthropic.messages.create(params);
    } catch (err) {
      const latencyMs = Date.now() - start;
      await this.logEvent({
        event: 'llm_call',
        model: params.model,
        latencyMs,
        success: false,
        errorMsg: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const latencyMs = Date.now() - start;
    await this.logEvent({
      event: 'llm_call',
      model: params.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
      success: true,
    });

    return response;
  }

  async callTool<T>(
    toolName: string,
    inputs: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();

    try {
      const result = await fn();
      const latencyMs = Date.now() - start;
      await this.logEvent({
        event: 'tool_call',
        toolName,
        inputs,
        latencyMs,
        success: true,
      });
      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      await this.logEvent({
        event: 'tool_call',
        toolName,
        inputs,
        latencyMs,
        success: false,
        errorMsg: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async requestApproval(_params: {
    actionType: string;
    payload: unknown;
    reasoning: string;
    riskScore: number;
  }): Promise<never> {
    throw new Error(
      'requestApproval is not yet implemented — awaiting EPIC 4',
    );
  }
}
