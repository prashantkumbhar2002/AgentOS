# API Contracts: Analytics & Cost Tracking

All endpoints require `Authorization: Bearer <JWT>`. Any authenticated user can access analytics (no role restriction).

---

## GET /api/analytics/costs

**Description**: Organization-wide cost summary across time windows.

**Query Parameters**:

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| fromDate | ISO 8601 date string | No | — | Optional lower bound |
| toDate | ISO 8601 date string | No | — | Optional upper bound |

**Response 200**:
```json
{
  "todayUsd": 12.345678,
  "last7dUsd": 89.123456,
  "last30dUsd": 345.678901,
  "totalUsd": 1234.567890,
  "changeVs7dAgo": -12.5
}
```

**Response 400** (fromDate > toDate):
```json
{
  "error": "fromDate must be before toDate"
}
```

**Notes**:
- `changeVs7dAgo` is a percentage: `((current7d - previous7d) / previous7d) * 100`
- If `previous7d` is 0, `changeVs7dAgo` is 0 (not Infinity)
- All USD values use 6-decimal precision

---

## GET /api/analytics/costs/timeline

**Description**: Daily cost per agent over last N days.

**Query Parameters**:

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| days | 7 \| 30 \| 90 | No | 30 | Lookback window |
| agentId | UUID string | No | — | Filter to single agent |

**Response 200**:
```json
{
  "dates": ["2026-03-15", "2026-03-16", "2026-03-17"],
  "series": [
    {
      "agentId": "uuid-1",
      "agentName": "Agent Alpha",
      "dailyCosts": [0.123456, 0.0, 0.456789]
    }
  ]
}
```

**Notes**:
- `dates` array always has exactly `days` entries (today going back)
- `dailyCosts` array has same length as `dates`, zero-filled for inactive days
- If no agents have data, `series` is an empty array
- Dates are in `YYYY-MM-DD` format (UTC)

---

## GET /api/analytics/usage

**Description**: Platform-wide usage statistics.

**Query Parameters**:

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| fromDate | ISO 8601 date string | No | — | Optional lower bound |
| toDate | ISO 8601 date string | No | — | Optional upper bound |

**Response 200**:
```json
{
  "totalRuns": 150,
  "totalLlmCalls": 420,
  "totalToolCalls": 230,
  "avgRunCostUsd": 0.082345,
  "totalApprovals": 45,
  "autoApproved": 12,
  "approved": 20,
  "denied": 8,
  "expired": 5
}
```

**Notes**:
- `totalRuns` = distinct count of `traceId` in AuditLog
- `totalLlmCalls` = count where `event = 'llm_call'`
- `totalToolCalls` = count where `event = 'tool_call'`
- `avgRunCostUsd` = total cost / totalRuns (0 if no runs)
- Approval counts from ApprovalTicket grouped by status

---

## GET /api/analytics/agents

**Description**: Per-agent leaderboard ranked by cost, runs, or error rate.

**Query Parameters**:

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| sortBy | "cost" \| "runs" \| "errorRate" | No | "cost" | Sort field |
| limit | number (1–100) | No | 10 | Max agents returned |

**Response 200**:
```json
{
  "agents": [
    {
      "agentId": "uuid-1",
      "agentName": "Agent Alpha",
      "ownerTeam": "engineering",
      "totalCostUsd": 123.456789,
      "totalRuns": 50,
      "errorRate": 0.04,
      "avgLatencyMs": 1200,
      "healthScore": 85
    }
  ]
}
```

**Notes**:
- `errorRate` = (failed events / total events) per agent — Float 0.0–1.0
- `healthScore` = `calculateHealthScore(errorRate, approvalDenyRate, avgLatencyMs)` — integer 0–100
- `approvalDenyRate` for health score = denied tickets / total tickets per agent (0 if no tickets)
- Sorted descending by the selected `sortBy` field

---

## GET /api/analytics/models

**Description**: Usage breakdown by LLM model.

**Query Parameters**: None.

**Response 200**:
```json
{
  "models": [
    {
      "model": "claude-sonnet-4-5",
      "callCount": 300,
      "totalInputTokens": 1500000,
      "totalOutputTokens": 750000,
      "totalCostUsd": 89.123456
    }
  ]
}
```

**Notes**:
- Sorted by `totalCostUsd` descending
- Audit logs with `model = null` are excluded
- Returns empty `models` array if no model data exists
