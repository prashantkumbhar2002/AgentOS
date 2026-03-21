# API Contract: Audit Logging

## POST /api/audit/log

**Purpose**: Ingest a single audit event from an agent.

**Auth**: Bearer JWT (any authenticated role)
**Rate Limit**: 1000 req/min per agentId (from request body)

**Request Body** (AuditEventSchema):
```json
{
  "agentId": "uuid",
  "traceId": "uuid",
  "event": "llm_call | tool_call | approval_requested | approval_resolved | action_blocked | action_taken",
  "model": "claude-sonnet-4-5",
  "toolName": "search",
  "inputs": {},
  "outputs": {},
  "inputTokens": 1500,
  "outputTokens": 500,
  "latencyMs": 1200,
  "success": true,
  "errorMsg": null,
  "metadata": {}
}
```

**Response 201**:
```json
{
  "id": "uuid",
  "traceId": "uuid",
  "costUsd": 0.012000
}
```

**Response 400**: Zod validation errors or `{ "error": "Agent not found" }`
**Side effects**: Broadcasts SSE `audit.log` event; updates agent.lastActiveAt (fire-and-forget)

---

## GET /api/audit/logs

**Purpose**: Query audit logs with filters and pagination.

**Auth**: Bearer JWT (any authenticated role)

**Query Parameters** (AuditQuerySchema):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| agentId | UUID | — | Filter by agent |
| traceId | UUID | — | Filter by trace |
| event | String | — | Filter by event type |
| success | Boolean | — | Filter by success/failure |
| fromDate | ISO Date | — | Start of date range |
| toDate | ISO Date | — | End of date range |
| page | Int | 1 | Page number |
| limit | Int | 50 | Items per page (max 100) |
| export | String | — | If "csv", triggers CSV download |

**Response 200** (JSON):
```json
{
  "data": [ /* AuditLog[] */ ],
  "total": 1234,
  "page": 1,
  "totalCostUsd": 45.123456
}
```

**Response 200** (CSV, when export=csv):
- Content-Type: text/csv
- Content-Disposition: attachment; filename="audit-export-2026-03-21.csv"
- Columns: id, agentId, agentName, traceId, event, model, toolName, inputTokens, outputTokens, costUsd, latencyMs, success, createdAt
- Restricted to admin and approver roles (403 for others)

---

## GET /api/audit/traces/:traceId

**Purpose**: Get all events for one trace, ordered by time.

**Auth**: Bearer JWT (any authenticated role)

**Response 200**:
```json
{
  "traceId": "uuid",
  "agentId": "uuid",
  "agentName": "Email Draft Agent",
  "events": [ /* AuditLog[] ordered by createdAt ASC */ ],
  "totalCost": 0.045000,
  "totalLatencyMs": 3500,
  "startedAt": "2026-03-21T10:00:00.000Z",
  "completedAt": "2026-03-21T10:00:03.500Z",
  "success": true
}
```

**Response 404**: `{ "error": "Trace not found" }`

---

## GET /api/audit/stats/:agentId

**Purpose**: Aggregate stats for one agent (used by agent detail page).

**Auth**: Bearer JWT (any authenticated role)

**Response 200** (AgentStatsSchema):
```json
{
  "totalRuns": 150,
  "totalCalls": 2340,
  "totalCostUsd": 12.345678,
  "avgLatencyMs": 850,
  "errorRate": 0.032,
  "successRate": 0.968,
  "topTools": [
    { "name": "search", "count": 890 },
    { "name": "send_email", "count": 450 }
  ]
}
```

**Response 404**: `{ "error": "Agent not found" }`
