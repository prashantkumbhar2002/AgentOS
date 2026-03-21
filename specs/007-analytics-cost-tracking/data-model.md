# Data Model: Analytics & Cost Tracking

## No New Entities

This feature introduces **no new Prisma models**. All analytics data is derived from existing tables via aggregation queries.

## Source Tables

### AuditLog (existing)

| Field | Type | Used For |
|-------|------|----------|
| id | UUID | — |
| agentId | String | Agent grouping (timeline, leaderboard) |
| traceId | String | Run counting (distinct count = total runs) |
| event | String | Event classification (`llm_call`, `tool_call`) |
| model | String? | Model usage breakdown grouping |
| inputTokens | Int? | Model input token aggregation |
| outputTokens | Int? | Model output token aggregation |
| costUsd | Float? | Cost aggregation (null treated as 0) |
| latencyMs | Int? | Average latency for leaderboard |
| success | Boolean | Error rate calculation (false = error) |
| createdAt | DateTime | Time-windowed aggregation |

**Indexes** (existing):
- `@@index([agentId])` — agent filtering
- `@@index([traceId])` — trace lookups
- `@@index([createdAt])` — date range filtering
- `@@index([event])` — event type filtering

**Index to add**:
- `@@index([agentId, createdAt])` — composite for agent+date range queries (timeline, leaderboard)

### ApprovalTicket (existing)

| Field | Type | Used For |
|-------|------|----------|
| id | UUID | — |
| agentId | String | Per-agent approval stats |
| status | ApprovalStatus | Status counting (APPROVED, DENIED, EXPIRED, AUTO_APPROVED, PENDING) |
| createdAt | DateTime | Time-windowed approval stats |

### Agent (existing)

| Field | Type | Used For |
|-------|------|----------|
| id | UUID | Join key for agent names |
| name | String | Display in timeline series and leaderboard |
| ownerTeam | String | Leaderboard context |

## Aggregation Patterns

### Cost Summary
- `prisma.auditLog.aggregate({ _sum: { costUsd } })` with date filters for today, 7d, 30d, total
- Week-over-week: compare current 7d sum vs prior 7d sum

### Cost Timeline
- `prisma.auditLog.groupBy({ by: ['agentId'], _sum: { costUsd }, where: { createdAt: { gte, lte } } })`
- Application-level: generate date array, left-join with grouped results, zero-fill

### Usage Stats
- Distinct traceId count: `prisma.auditLog.findMany({ distinct: ['traceId'] })` or count query
- Event counts: `prisma.auditLog.count({ where: { event: 'llm_call' } })`
- Approval status counts: `prisma.approvalTicket.groupBy({ by: ['status'], _count: true })`

### Agent Leaderboard
- `prisma.auditLog.groupBy({ by: ['agentId'], _sum: { costUsd }, _avg: { latencyMs }, _count: true })`
- Error rate: count where `success=false` / total count per agent
- Health score: `calculateHealthScore(errorRate, approvalDenyRate, avgLatencyMs)`

### Model Usage
- `prisma.auditLog.groupBy({ by: ['model'], _sum: { costUsd, inputTokens, outputTokens }, _count: true, where: { model: { not: null } } })`
