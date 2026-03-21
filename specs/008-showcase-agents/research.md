# Research: Showcase Agents & Mock Data

## Decision 1: GovernanceClient Usage Pattern

**Decision**: Each showcase agent creates a new `GovernanceClient` instance per request, with a fresh `traceId` for each run. The API key used is the JWT of the requesting user, obtained from the route handler.

**Rationale**: The GovernanceClient already generates a `traceId` per instantiation. Passing the user's JWT as the `apiKey` lets the agent authenticate against the platform's own API, so all audit logs and approval tickets are correctly attributed.

**Alternatives considered**:
- Service account token: Would decouple agent identity from the triggering user but adds credential management complexity for a demo feature. Rejected for MVP.
- Static GovernanceClient singleton: Loses per-request traceId isolation. Rejected.

## Decision 2: Anthropic Web Search Tool Format

**Decision**: Use the Anthropic API tool type `{ type: "web_search_20250305", name: "web_search", max_uses: 2 }` for the research agent's search step.

**Rationale**: The user explicitly specified this tool format. Anthropic's web search is a server-side tool — the API handles execution. The agent extracts search results from the response content blocks.

**Alternatives considered**:
- Custom search API (SerpAPI, Tavily): Adds a dependency and API key. Rejected — Anthropic's built-in tool is simpler for demos.

## Decision 3: Mock Data Distribution Strategy

**Decision**: Generate 50 audit logs spread across 15 random traceIds and 3 mock agents with these distributions:
- Events: 30% `llm_call`, 50% `tool_call`, 10% `approval_requested`, 10% `approval_resolved`
- Timestamps: randomly distributed over the last 7 days
- Costs: realistic range ($0.001–$0.05 per LLM call, $0 for tool calls)
- Tokens: 500–5000 input, 100–2000 output

**Rationale**: These distributions produce realistic-looking analytics dashboards with visible cost trends, model usage breakdowns, and agent activity patterns.

**Alternatives considered**:
- Fewer logs: 10–20 logs look sparse on dashboards. 50 gives meaningful charts.
- Deterministic timestamps: Would create artificial-looking patterns. Random within 7 days is more realistic.

## Decision 4: Idempotency Strategy for Mock Seeder

**Decision**: Use `findFirst` by agent name before creating. For audit logs and approval tickets, check total count for each mock agent — only create if count is below target.

**Rationale**: Simple and sufficient for a demo seeder. Full upsert on 50+ logs would be complex and unnecessary.

**Alternatives considered**:
- Delete-and-recreate: Destructive — would remove manually-created data or resolved approvals. Rejected.
- UUID-based idempotency keys: Over-engineered for a demo seeder. Rejected.

## Decision 5: ANTHROPIC_API_KEY Configuration

**Decision**: Add `ANTHROPIC_API_KEY` as an optional environment variable in `apps/api/src/config/env.ts`. Showcase agent endpoints check for its presence and return 500 with a clear error if missing.

**Rationale**: The key is only needed for showcase agents, not core platform operation. Making it optional prevents the application from crashing on startup when no key is configured.

**Alternatives considered**:
- Required env var: Would prevent API startup without a key, breaking non-demo environments. Rejected.
- Per-request header: Would require callers to know the key. Less secure and less convenient. Rejected.
