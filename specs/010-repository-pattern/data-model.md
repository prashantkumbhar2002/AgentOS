# Data Model: Repository Pattern Refactor

No database schema changes. This document defines the TypeScript interfaces that form the repository abstraction layer.

## Repository Interfaces

### IAgentRepository

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| `findById(id)` | `string` | `AgentDetail \| null` | Includes tools, policy count |
| `findMany(filter)` | `AgentFilter` | `PaginatedResult<AgentSummary>` | With 7d cost aggregation |
| `create(data)` | `CreateAgentInput` | `AgentDetail` | Nested tool creation |
| `update(id, data)` | `string, UpdateAgentInput` | `AgentDetail \| null` | Optional tool replacement |
| `updateStatus(id, status, approvedBy?)` | `string, AgentStatus, string?` | `AgentDetail \| null` | Sets approvedBy if APPROVED |
| `exists(id)` | `string` | `boolean` | Lightweight existence check |
| `updateLastActiveAt(id)` | `string` | `void` | Fire-and-forget timestamp update |

### IAuditRepository

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| `create(data)` | `CreateAuditLogInput` | `AuditLogEntry` | Includes computed costUsd |
| `findMany(filter)` | `AuditFilter` | `PaginatedResult<AuditLogEntry>` | With total cost aggregation |
| `findByTraceId(traceId)` | `string` | `AuditLogEntry[]` | Ordered by createdAt ASC |
| `getAgentStats(agentId)` | `string` | `RawAgentAuditStats` | Grouped counts, costs, latency |
| `exportRows(filter)` | `AuditFilter` | `AuditLogEntry[]` | All matching rows (no pagination) |

### IApprovalRepository

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| `create(data)` | `CreateTicketInput` | `ApprovalTicketDetail` | With agent name included |
| `findById(id)` | `string` | `ApprovalTicketDetail \| null` | With agent and resolver info |
| `findMany(filter)` | `ApprovalFilter` | `PaginatedResult<ApprovalTicketSummary>` | Plus pendingCount |
| `resolve(id, data)` | `string, ResolveInput` | `ApprovalTicketDetail` | Updates status, resolvedBy, resolvedAt |
| `expireStale(before)` | `Date` | `number` | Count of expired tickets |
| `updateSlackMsgTs(id, ts)` | `string, string` | `void` | Slack message tracking |
| `getPendingCount()` | — | `number` | Global pending count |

### IPolicyRepository

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| `create(data)` | `CreatePolicyInput` | `PolicyDetail` | With rules |
| `findById(id)` | `string` | `PolicyDetail \| null` | With rules and agent assignments |
| `findMany(filter)` | `PolicyFilter` | `PaginatedResult<PolicyDetail>` | |
| `update(id, data)` | `string, UpdatePolicyInput` | `PolicyDetail \| null` | |
| `delete(id)` | `string` | `void` | Deletes rules too |
| `findByName(name)` | `string` | `PolicyDetail \| null` | For uniqueness check |
| `getAssignedAgentCount(id)` | `string` | `number` | For deletion guard |
| `assignToAgent(policyId, agentId)` | `string, string` | `void` | |
| `unassignFromAgent(policyId, agentId)` | `string, string` | `void` | |
| `findAssignment(policyId, agentId)` | `string, string` | `boolean` | Existence check |
| `getAgentPoliciesWithRules(agentId)` | `string` | `PolicyWithRules[]` | For evaluator |
| `getGlobalPoliciesWithRules()` | — | `PolicyWithRules[]` | For evaluator |

### IAnalyticsRepository

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| `getCostAggregates(ranges)` | `DateRange[]` | `CostAggregate[]` | Sum of costUsd per range |
| `getCostByAgentByDay(days, agentId?)` | `number, string?` | `DailyCostEntry[]` | For timeline chart |
| `getUsageCounts(dateFilter?)` | `DateFilter?` | `UsageCounts` | Event type counts, distinct traces |
| `getApprovalCountsByStatus(dateFilter?)` | `DateFilter?` | `ApprovalStatusCounts` | For pie chart |
| `getAgentMetrics(limit)` | `number` | `AgentMetricRow[]` | Cost, runs, errors per agent |
| `getModelMetrics()` | — | `ModelMetricRow[]` | Per-model call count, tokens, cost |

## Key DTOs

### Common

```
PaginatedResult<T> { data: T[], total: number, page: number, limit: number }
```

### Agent DTOs

```
AgentSummary { id, name, status, riskTier, environment, ownerTeam, toolCount, lastActiveAt, cost7dUsd, healthScore }
AgentDetail  { ...AgentSummary, description, llmModel, tags, tools: AgentToolDTO[], createdAt, updatedAt, approvedBy? }
AgentToolDTO { id, name, description }
```

### Audit DTOs

```
AuditLogEntry { id, agentId, agentName?, traceId, event, model?, toolName?, inputTokens?, outputTokens?, costUsd?, latencyMs?, success, errorMsg?, createdAt }
RawAgentAuditStats { totalRuns, totalLlmCalls, totalToolCalls, totalCostUsd, avgLatencyMs, errorCount, totalCount, topTools: { name, count }[] }
```

### Approval DTOs

```
ApprovalTicketSummary { id, agentId, agentName, actionType, riskScore, status, expiresAt, createdAt, resolvedAt? }
ApprovalTicketDetail  { ...ApprovalTicketSummary, payload, reasoning, resolvedBy?, resolverName?, comment?, slackMsgTs? }
```

### Policy DTOs

```
PolicyDetail   { id, name, description, isActive, priority, createdAt, rules: PolicyRuleDTO[], agents?: PolicyAgentDTO[] }
PolicyRuleDTO  { id, actionType, riskTiers: string[], effect, conditions? }
PolicyAgentDTO { agentId, agentName }
PolicyWithRules { id, name, isActive, rules: PolicyRuleDTO[] }
```

### Analytics DTOs

```
CostAggregate       { rangeKey: string, totalUsd: number }
DailyCostEntry      { date: string, agentId: string, agentName: string, costUsd: number }
UsageCounts         { totalRuns, totalLlmCalls, totalToolCalls, avgRunCostUsd }
ApprovalStatusCounts { approved, denied, expired, autoApproved, pending }
AgentMetricRow      { agentId, agentName, riskTier, totalCost, totalRuns, errorCount, totalCount, avgLatencyMs }
ModelMetricRow      { model, callCount, totalInputTokens, totalOutputTokens, totalCostUsd }
```
