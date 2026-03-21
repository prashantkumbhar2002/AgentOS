# Quickstart: Audit Logging & Observability

## Prerequisites

- PostgreSQL running (via docker compose)
- Prisma migrations applied
- At least one agent registered (from EPIC 2 seed or POST /api/agents)
- Valid JWT token

## Scenario 1: Ingest an Audit Event

```bash
# Log an LLM call event
curl -X POST http://localhost:3000/api/audit/log \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "<agent-uuid>",
    "traceId": "<trace-uuid>",
    "event": "llm_call",
    "model": "claude-sonnet-4-5",
    "inputTokens": 1500,
    "outputTokens": 500,
    "latencyMs": 1200,
    "success": true
  }'

# Expected: 201 with { id, traceId, costUsd: 0.012000 }
```

## Scenario 2: Query Audit Logs

```bash
# List all events for an agent
curl "http://localhost:3000/api/audit/logs?agentId=<agent-uuid>" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 with { data: [...], total, page, totalCostUsd }

# Filter by date range and event type
curl "http://localhost:3000/api/audit/logs?event=llm_call&fromDate=2026-03-01&toDate=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

## Scenario 3: View a Trace

```bash
curl "http://localhost:3000/api/audit/traces/<trace-uuid>" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 with { traceId, agentName, events: [...], totalCost, success }
```

## Scenario 4: Export as CSV

```bash
curl "http://localhost:3000/api/audit/logs?export=csv&agentId=<agent-uuid>" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit-export.csv

# Expected: CSV file with headers and matching rows
# Note: Requires admin or approver role
```

## Scenario 5: Agent Statistics

```bash
curl "http://localhost:3000/api/audit/stats/<agent-uuid>" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 with { totalRuns, totalCalls, totalCostUsd, avgLatencyMs, errorRate, successRate, topTools }
```

## Scenario 6: SDK Usage

```typescript
import { GovernanceClient } from '@agentos/governance-sdk';

const client = new GovernanceClient({
  platformUrl: 'http://localhost:3000',
  agentId: '<agent-uuid>',
  apiKey: '<jwt-token>',
});

// Automatically logs llm_call event
const response = await client.createMessage({
  model: 'claude-sonnet-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

// Automatically logs tool_call event
const result = await client.callTool('search', { query: 'test' }, async () => {
  return { results: ['item1', 'item2'] };
});
```

## Validation Checklist

- [ ] POST /api/audit/log returns 201 with server-calculated costUsd
- [ ] POST /api/audit/log returns 400 for non-existent agentId
- [ ] GET /api/audit/logs returns filtered, paginated results with totalCostUsd
- [ ] GET /api/audit/traces/:traceId returns ordered events with aggregates
- [ ] GET /api/audit/logs?export=csv returns downloadable CSV
- [ ] GET /api/audit/stats/:agentId returns correct aggregations
- [ ] GovernanceClient.createMessage logs llm_call event
- [ ] GovernanceClient.callTool logs tool_call event
- [ ] SDK swallows network errors without throwing
