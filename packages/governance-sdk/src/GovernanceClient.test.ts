import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernanceClient } from './GovernanceClient.js';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

function createClient() {
  return new GovernanceClient({
    platformUrl: 'http://localhost:3000',
    agentId: VALID_UUID,
    apiKey: 'test-api-key',
  });
}

describe('GovernanceClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a unique traceId on construction', () => {
    const client1 = createClient();
    const client2 = createClient();
    expect(client1.traceId).toBeDefined();
    expect(client2.traceId).toBeDefined();
    expect(client1.traceId).not.toBe(client2.traceId);
  });

  it('logEvent sends POST with correct body and auth header', async () => {
    const client = createClient();
    await client.logEvent({ event: 'tool_call', toolName: 'search' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/audit/log');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-api-key',
    });

    const body = JSON.parse(options.body as string);
    expect(body.agentId).toBe(VALID_UUID);
    expect(body.traceId).toBe(client.traceId);
    expect(body.event).toBe('tool_call');
    expect(body.toolName).toBe('search');
  });

  it('logEvent swallows network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const client = createClient();

    await expect(client.logEvent({ event: 'tool_call' })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      '[GovernanceClient] Failed to log event:',
      expect.any(Error),
    );
  });

  it('callTool logs tool_call event with latency', async () => {
    const client = createClient();
    const result = await client.callTool('search', { query: 'test' }, async () => 'result');

    expect(result).toBe('result');
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(((fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.event).toBe('tool_call');
    expect(body.toolName).toBe('search');
    expect(body.success).toBe(true);
    expect(typeof body.latencyMs).toBe('number');
  });

  it('callTool re-throws fn errors after logging', async () => {
    const client = createClient();
    const error = new Error('tool failed');

    await expect(
      client.callTool('broken-tool', {}, async () => {
        throw error;
      }),
    ).rejects.toThrow('tool failed');

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(((fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.success).toBe(false);
    expect(body.errorMsg).toBe('tool failed');
  });

  it('requestApproval throws not-implemented error', async () => {
    const client = createClient();
    await expect(
      client.requestApproval({
        actionType: 'send_email',
        payload: {},
        reasoning: 'test',
        riskScore: 0.5,
      }),
    ).rejects.toThrow('requestApproval is not yet implemented — awaiting EPIC 4');
  });
});
