# Data Model: Frontend — React Dashboard

## No New Persistent Entities

The frontend introduces no new database models. All data comes from the existing backend API (EPICs 2–7).

## Client-Side State

### Auth Store (Zustand — persisted to localStorage)

| Field | Type | Description |
|-------|------|-------------|
| user | `User \| null` | Current user profile (id, email, name, role) |
| token | `string \| null` | JWT access token |
| isAuthenticated | `boolean` | Derived from token presence |

### SSE Event Buffer (in-memory, max 50)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Auto-generated sequence ID |
| type | string | Event type (llm_call, tool_call, approval_requested, etc.) |
| data | object | Parsed event payload |
| timestamp | Date | When the event was received |

## API Data Types (consumed from `packages/types`)

The frontend imports all types from `@agentos/types`. Key types per page:

| Page | Types Consumed |
|------|---------------|
| Login | `LoginInput`, `AuthResponse`, `AuthUser` |
| Dashboard | `AgentSummary`, `AgentStats`, `CostSummary` |
| Agents | `AgentDetail`, `CreateAgentInput`, `AgentListQuery`, `AgentTool` |
| Agent Detail | `AgentDetail`, `AuditLog`, `ApprovalTicket`, `AgentStats` |
| Approvals | `ApprovalTicket`, `ApprovalDecisionInput`, `ApprovalQuery` |
| Audit | `AuditLog`, `AuditQuery`, `TraceIdParams` |
| Analytics | `CostSummary`, `CostTimeline`, `UsageStats`, `AgentLeaderboard`, `ModelUsage` |
| Policies | `Policy`, `PolicyRule`, `AgentPolicy` |

## TanStack Query Key Structure

| Domain | Key Factory |
|--------|------------|
| agents | `['agents']`, `['agents', id]`, `['agents', 'leaderboard']` |
| approvals | `['approvals']`, `['approvals', id]`, `['approvals', { status }]` |
| audit | `['audit']`, `['audit', 'trace', traceId]`, `['audit', 'stats', agentId]` |
| analytics | `['analytics', 'costs']`, `['analytics', 'timeline']`, `['analytics', 'usage']`, `['analytics', 'agents']`, `['analytics', 'models']` |
| policies | `['policies']`, `['policies', id]` |

## SSE → Query Invalidation Map

| SSE Event Type | Invalidated Query Keys |
|----------------|----------------------|
| approval_requested | `['approvals']` |
| approval_resolved | `['approvals']` |
| agent_created | `['agents']` |
| agent_updated | `['agents']` |
| audit_event | `['audit']` |
| * (any) | Dashboard stat queries |
