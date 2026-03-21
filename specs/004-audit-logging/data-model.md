# Data Model: Audit Logging & Observability

## Entities

### AuditLog (existing — defined in EPIC 1 Prisma schema)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key, auto-generated |
| agentId | UUID | Yes | FK → Agent.id |
| traceId | UUID | Yes | Groups events into a single agent session |
| event | String | Yes | One of: llm_call, tool_call, approval_requested, approval_resolved, action_blocked, action_taken |
| model | String | No | LLM model identifier (e.g., "claude-sonnet-4-5") |
| toolName | String | No | Name of the tool invoked |
| inputs | JSON | No | Input payload (sanitized before storage) |
| outputs | JSON | No | Output payload (sanitized before storage) |
| inputTokens | Int | No | Number of input tokens for LLM calls |
| outputTokens | Int | No | Number of output tokens for LLM calls |
| costUsd | Float | No | Server-calculated cost in USD (6-decimal precision) |
| latencyMs | Int | No | Operation duration in milliseconds |
| success | Boolean | Yes | Default: true |
| errorMsg | String | No | Error message if success=false |
| metadata | JSON | No | Arbitrary metadata for extensibility |
| createdAt | DateTime | Yes | Auto-set on creation |

**Indexes** (existing):
- `@@index([agentId])` — filter by agent
- `@@index([traceId])` — trace lookups
- `@@index([createdAt])` — time-range queries
- `@@index([event])` — filter by event type

### Agent (existing — update only)

| Field | Type | Notes |
|-------|------|-------|
| lastActiveAt | DateTime? | Updated on every audit event ingestion (fire-and-forget) |

No schema changes needed — all fields already exist.

## Computed Aggregates (not persisted)

### AgentStatistics

| Field | Type | Computation |
|-------|------|-------------|
| totalRuns | Int | COUNT(DISTINCT traceId) for agent |
| totalCalls | Int | COUNT(*) for agent |
| totalCostUsd | Float | SUM(costUsd) for agent |
| avgLatencyMs | Float | AVG(latencyMs) for agent |
| errorRate | Float | COUNT(success=false) / COUNT(*) |
| successRate | Float | COUNT(success=true) / COUNT(*) |
| topTools | Array | GROUP BY toolName, COUNT(*), ORDER BY count DESC, LIMIT 10 |

### TraceView

| Field | Type | Computation |
|-------|------|-------------|
| traceId | UUID | From query param |
| agentId | UUID | From first event in trace |
| agentName | String | Resolved from Agent.name |
| events | AuditLog[] | All events for traceId, ordered by createdAt ASC |
| totalCost | Float | SUM(costUsd) across trace events |
| totalLatencyMs | Int | SUM(latencyMs) across trace events |
| startedAt | DateTime | MIN(createdAt) of trace events |
| completedAt | DateTime | MAX(createdAt) of trace events |
| success | Boolean | ALL events have success=true |

## Relationships

```
Agent (1) ──── (many) AuditLog
  │                     │
  │ lastActiveAt        │ agentId (FK)
  │ updated on          │ traceId (groups events)
  │ every ingestion     │
```

## State Transitions

AuditLog has no lifecycle states — it is an append-only record. Once
created, it is never modified or deleted (within the scope of this epic).

## Validation Rules

- `agentId` MUST reference an existing Agent record
- `event` MUST be one of the 6 defined event types
- `costUsd` is NEVER accepted from the client — always server-calculated
- `inputs` and `outputs` MUST be sanitized before storage (strip potential PII/secrets)
- Token counts (`inputTokens`, `outputTokens`) must be non-negative integers when provided
