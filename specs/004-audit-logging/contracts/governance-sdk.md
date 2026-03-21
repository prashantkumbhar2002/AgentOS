# SDK Contract: GovernanceClient

## Package: `@agentos/governance-sdk`

### Constructor

```text
new GovernanceClient({
  platformUrl: string,   // e.g., "https://agentos.example.com"
  agentId: string,       // UUID of the registered agent
  apiKey: string         // JWT or API key for authentication
})
```

- Generates a new `traceId` (UUID v4) on construction
- All events logged by this instance share the same traceId

### Methods

#### createMessage(params)

Wraps `anthropic.messages.create(params)`. Automatically logs an
`llm_call` audit event with:
- model (from params)
- inputTokens, outputTokens (from Anthropic response usage)
- latencyMs (measured)
- success (true if no error)
- errorMsg (if error thrown, captured before re-throwing)

Returns the original Anthropic response. If logging fails, the
failure is swallowed (console.warn) and the response is still returned.

#### callTool<T>(toolName, inputs, fn)

Wraps an arbitrary async function `fn`. Automatically logs a
`tool_call` audit event with:
- toolName
- inputs (sanitized)
- latencyMs (measured)
- success (true if fn resolves)
- errorMsg (if fn rejects, captured before re-throwing)

Returns the result of `fn`. If logging fails, the failure is
swallowed and the result is still returned.

#### requestApproval({ actionType, payload, reasoning, riskScore })

Posts to `POST /api/approvals` on the platform. Polls for a decision.

**Note**: This method depends on EPIC 4 (Approvals). Until that epic
is implemented, calling this method throws:
`Error: "requestApproval is not yet implemented — awaiting EPIC 4"`

#### logEvent(payload) [internal]

Internal method. Posts to `POST /api/audit/log` on the platform.
Used by createMessage and callTool. On network failure: catches the
error, logs `console.warn`, does not throw.

### Error Handling Contract

- **LLM/Tool errors**: Re-thrown to the caller after logging the event.
  The audit event captures the error with `success: false`.
- **Logging/network errors**: Swallowed silently (console.warn). The
  caller's operation is never interrupted.
- **Guarantee**: The SDK adds no more than 10ms of latency to any
  wrapped operation beyond the operation's own execution time.
