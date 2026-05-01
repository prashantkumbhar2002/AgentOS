## Critical correctness bugs

### 1. ~~SSE approval stream isn't actually filtered by `ticketId`~~ — **FIXED** (2026-05-01, P0 of LangSmith plan)

The original write-up undersold the problem: the route did pass a per-client filter on `ticketId`, but it never checked that the SSE token *belonged to the agent that owned the ticket*. Any holder of a valid SSE token (including a user JWT-derived SSE token) could subscribe to any `ticketId` they could guess or learn from logs.

**Fix shipped** — see `apps/api/src/modules/events/events.routes.ts`:

1. Routes moved out of `app.ts` into a proper `modules/events/` module (registered at `/api/v1/events`).
2. SSE token shapes are now strictly typed and discriminated — agent tokens carry `{ type, agentId }`, user tokens carry `{ type, userId, role }`. The new `verifyAgentSseToken` / `verifyUserSseToken` helpers in `apps/api/src/utils/sse-auth.ts` enforce schema *and* reject the wrong shape per route.
3. `/events/agent-stream` now: (a) requires an agent SSE token; (b) validates `ticketId` is a UUID before any DB work; (c) loads the ticket and rejects with **403 ticket scope** if `ticket.agentId !== payload.agentId`; (d) the SSE filter additionally matches both `ticketId` and `agentId` as defense-in-depth.
4. `/events/stream` (dashboard firehose) now rejects agent tokens — agents must use `/agent-stream`, not the firehose.

**Test coverage**: 15 unit tests on the helper + 16 integration tests on the routes (including the headline "Agent B can't subscribe to Agent A's ticket" case, which now returns 403). The old `sse-token.test.ts` (parallel inline implementation) was deleted in favour of tests against the real production routes.

### 2. `wrapLLMStream` consumes the stream the caller wants to read
```161:166:packages/governance-sdk/src/GovernanceClient.ts
if (stream && typeof (stream as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] === 'function') {
    for await (const _ of stream as unknown as AsyncIterable<unknown>) {
        /* consume to completion */
    }
}
```

We return `stream` to the caller but also iterate it ourselves on the next tick. With native async iterators the second consumer gets nothing (the iterator is exhausted). The Anthropic/OpenAI SDKs' streaming objects often *only* allow a single consumer. Right now `wrapLLMStream` is effectively unusable for its stated purpose. Fix: either accept an `onChunk` callback, return a tee'd iterator, or expect the caller to call `gov.recordStreamComplete(meta)` after consuming.

### 3. `TraceDrawer` tree-builder collapses sibling events
```37:48:apps/web/src/components/audit/TraceDrawer.tsx
function buildSpanTree(events: TraceEvent[]): TraceEvent[] {
  const bySpanId = new Map<string, TraceEvent>()
  ...
  for (const ev of events) {
    const node: TraceEvent = { ...ev, children: [] }
    if (ev.spanId) {
      bySpanId.set(ev.spanId, node)
    }
```

In our model every event inside a span carries the *same* `spanId`. `bySpanId.set` overwrites, so only the last event for a span becomes the parent for its children. Earlier siblings are flattened to root. The tree should group events by `spanId` first (creating a synthetic span node) and parent those nodes by `parentSpanId`.

### 4. LangChain adapter has a concurrency bug
```36:38:packages/governance-sdk/src/adapters/langchain.ts
let llmStartTime = 0;
let toolStartTime = 0;
let currentToolName = '';
```

These are closure-level singletons shared across every LLM/tool invocation handled by the same callback. Any LangChain agent that runs two LLM calls or tools in parallel (very common with `RunnableParallel`, `Map`, parallel tool execution) will record the wrong latency and the wrong tool name. Use the `runId` argument LangChain passes to every callback as a `Map<runId, startTime>` key.

### 5. `EventBuffer` silently drops on flush failure
```27:33:packages/governance-sdk/src/EventBuffer.ts
try {
    await this.flushFn(batch);
} catch {
    console.warn('[EventBuffer] Flush failed, events dropped');
}
```

The whole point of buffering is to survive transient failures. Right now the first 5xx wipes the batch. With our new circuit breaker in front of `fetch`, a brief platform outage = total audit blackout. We should at minimum requeue the batch (subject to a configurable max-buffer cap) and add exponential backoff.

### 6. `flushEvents` no-shutdown hook for short-lived agents
There's no `process.on('beforeExit')` registration. Any CLI-style agent that finishes its work and exits without explicitly calling `await gov.shutdown()` loses everything still in the buffer (up to ~5s of activity by default). Most users will forget. We should auto-register a best-effort flush on `beforeExit`/`SIGINT`/`SIGTERM`.

---

## High-value ergonomics issues

### 7. `callTool` swallows the `ticketId` on denial
When an approval comes back denied, we throw `PolicyDeniedError` whose message embeds the ticket as a string. The original showcase code returned `{ status: 'AWAITING_APPROVAL', ticketId }` so the UI could deep-link. Now the agent's caller has to regex the error message. We should expose `ticketId` as a public field on `PolicyDeniedError`.

### 8. `requestApproval` returns `decision: 'DENIED'` for any non-2xx create
```299:301:packages/governance-sdk/src/GovernanceClient.ts
if (!createRes.ok) {
    return { decision: 'DENIED', ticketId: '' };
}
```

A 401 (bad API key), 429 (rate limited), 500 (server bug), and a true policy denial are indistinguishable to the agent. This makes debugging integration issues painful and causes auto-deny on transient failures. Either propagate a typed error or return a richer status.

### 9. Server-side `budgetUsd` is a column with no enforcement
We added the column to `Agent`, exposed it through the schema, but no API path checks it. The audit `/log` and `/batch` endpoints sum `costUsd` without comparing to the budget. A misbehaving agent ignoring `budgetExceeded` client-side will rack up unlimited spend. The batch handler is the natural place: after computing `totalCostUsd`, query the agent's running total and reject (or alert) if over budget.

### 10. `checkPolicy` requires a user JWT but agents authenticate with API keys
All the new `/policies/check` route uses the standard `authenticate` middleware. Looking at how agents call it — `Authorization: Bearer ${this.apiKey}` — this is the agent API key, not a user JWT. If `authenticate` only accepts JWTs, every policy check will 401 in production and the SDK will fail-closed on every tool call. Worth a quick verification; if confirmed, we need either an `authenticateAgent` middleware or a unified token verifier.

### 11. Budget warning math is buggy at zero cost
```
this.cumulativeCostUsd += costUsd;
if (warnAtUsd && previousCost < warnAtUsd && this.cumulativeCostUsd >= warnAtUsd) { warn() }
```

If `costUsd` is `0` (Ollama, free models), the warn never fires legitimately — but it also doesn't fire when the threshold has *already* been crossed and a prior small cost arrives. Edge case, but worth either (a) only checking when `costUsd > 0`, or (b) firing once on any crossing.

### 12. `traceId` is fixed for the lifetime of the client
`new GovernanceClient()` mints one `traceId`. If a long-lived service handles many independent requests with one shared client (the recommended pattern), every request gets the same trace and the dashboard becomes useless. We need `gov.startTrace()` / `gov.withTrace(fn)` (or accept `traceId` as an option per call).

---

## Medium-priority improvements

### 13. Retry uses linear backoff; circuit breaker is global
`fetchWithResilience` does `delay * (i + 1)`. Standard practice is exponential with jitter. Also, one circuit breaker covers all endpoints — a flaky `policies/check` could trip the breaker and stop our audit batches even though `/audit/batch` is healthy. A breaker per host+path is more useful.

### 14. Audit batch's "agent exists" check is N queries
```92:98:apps/api/src/modules/audit/audit.routes.ts
for (const agentId of agentIds) {
    const agentExists = await agentService.getAgentById(agentId);
```

One `findMany({ where: { id: { in: agentIds } } })` does it in a single round-trip. With a buffer of 20 events from 5 agents this is the difference between 1 query and 5 per flush.

### 15. SSE first-attempt budget is 10s before falling back to polling
That's a long time for a snappy dashboard. If `EventSource` isn't available we resolve `null` immediately, which is good — but if the connection hangs at TCP we wait the full 10s. A 1.5–2s SSE connect timeout, then poll, would feel much better and degrade gracefully.

### 16. `PolicyDeniedError` detection in showcase agents uses brittle name-checks
`if ('name' in err && err.name === 'PolicyDeniedError')` works but is unidiomatic and fragile when SDK is dual-published as ESM/CJS (instanceof can fail across realms). Export a type guard `isPolicyDeniedError(err)` that tolerates both.

### 17. No tests cover the new paths
Our test suite passes but doesn't exercise: span tree assembly on the dashboard, batch endpoint, SSE approval roundtrip, circuit-breaker open/half-open transitions, budget enforcement, or LangChain callback. The bugs above (#1–#4) would all have been caught by integration tests.

### 18. `EventSource` is not in Node < 18.0 globals; we silently skip SSE
`typeof EventSource !== 'undefined'` is correct but means Node-only agents *always* poll — no warning, no doc. Either lazy-`require('eventsource')` (a tiny dependency) or document the polyfill clearly.

---

## Lower-priority polish

19. **No public JSDoc** on `GovernanceClient` methods — IDE hover gives nothing useful to integrators.
20. **`adapters/openai.ts` and `adapters/anthropic.ts` are very thin** — they only wrap a single API method (`chat.completions.create`, `messages.create`). They don't help with `responses.create`, embeddings, image gen, or streaming variants.
21. **No SDK-side metrics** — no way to ask "how many events buffered? how many flushes failed? is the breaker open?" Useful for observability dashboards built around the SDK itself.
22. **README/quickstart still shows old `createMessage` example** — needs updating now that we've removed it (breaking change unmentioned in docs).
23. **Spans have no error/status field** — when `withSpan(fn)` rejects we don't tag the span as failed; the dashboard can't visually distinguish a successful span from a failed one without inspecting child events.
24. **Migration is unapplied** — the `20260405000000_add_span_and_budget_fields` SQL exists on disk but no DB has it. First deploy needs a `prisma migrate deploy` step in the deploy runbook.
