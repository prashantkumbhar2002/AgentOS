# Feature Specification: Analytics & Cost Tracking

**Feature Branch**: `007-analytics-cost-tracking`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "EPIC 6 — Analytics & Cost Tracking"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Organization Cost Summary (Priority: P1)

As a platform admin, I want to see a high-level cost summary (today, last 7 days, last 30 days, all-time) so I can understand how much the organization is spending on AI agents and whether costs are trending up or down.

**Why this priority**: Cost visibility is the primary driver for this feature. Without it, admins have no way to understand spending patterns or justify budgets.

**Independent Test**: Can be fully tested by requesting the cost summary endpoint and verifying it returns aggregated USD totals from audit log data, including a percentage change indicator.

**Acceptance Scenarios**:

1. **Given** audit logs exist with cost data, **When** an admin requests the cost summary, **Then** the system returns today's cost, last 7 days cost, last 30 days cost, total cost, and the percentage change compared to the prior 7-day period.
2. **Given** no audit logs exist (fresh install), **When** an admin requests the cost summary, **Then** the system returns zero for all cost fields and zero for the percentage change.
3. **Given** a date range is provided, **When** the admin requests the cost summary with `fromDate` and `toDate`, **Then** the system returns costs aggregated only within that date range.
4. **Given** `fromDate` is after `toDate`, **When** the admin requests the cost summary, **Then** the system returns an error indicating the date range is invalid.

---

### User Story 2 - View Cost Timeline Per Agent (Priority: P1)

As a platform admin, I want to see a daily cost breakdown per agent over a configurable number of days (7, 30, or 90) so I can identify cost spikes and attribute them to specific agents.

**Why this priority**: Timeline data enables trend analysis and anomaly detection — critical for cost management alongside the summary view.

**Independent Test**: Can be fully tested by requesting the cost timeline endpoint and verifying it returns a date array with per-agent daily cost series, including zero-filled days.

**Acceptance Scenarios**:

1. **Given** audit logs exist for multiple agents over the last 30 days, **When** an admin requests the cost timeline with `days=30`, **Then** the system returns an array of 30 date strings and a series entry per active agent with daily cost values.
2. **Given** an agent had no activity on a specific day within the range, **When** the timeline is generated, **Then** that day's cost for the agent is returned as 0 (not omitted).
3. **Given** a specific `agentId` filter is provided, **When** the admin requests the timeline, **Then** only that agent's cost series is returned.
4. **Given** no audit logs exist, **When** the admin requests the timeline, **Then** the system returns the date array with an empty series list.

---

### User Story 3 - View Platform Usage Statistics (Priority: P1)

As a platform admin, I want to see aggregate usage statistics (total runs, LLM calls, tool calls, average run cost, and approval workflow metrics) so I can understand platform adoption and operational efficiency.

**Why this priority**: Usage stats provide the operational counterpart to cost data — admins need both to make informed decisions.

**Independent Test**: Can be fully tested by requesting the usage stats endpoint and verifying counts are correctly derived from audit log events and approval ticket statuses.

**Acceptance Scenarios**:

1. **Given** audit logs and approval tickets exist, **When** an admin requests usage stats, **Then** the system returns total runs (distinct trace IDs), total LLM calls, total tool calls, average run cost, and approval breakdown (total, auto-approved, approved, denied, expired).
2. **Given** a date range filter is provided, **When** the admin requests usage stats, **Then** only data within that range is included.
3. **Given** no data exists, **When** the admin requests usage stats, **Then** all numeric fields return zero.

---

### User Story 4 - View Agent Leaderboard (Priority: P2)

As a platform admin, I want to see a ranked list of agents sorted by cost, number of runs, or error rate so I can identify top spenders, most active agents, and unreliable agents.

**Why this priority**: The leaderboard enables comparative analysis across agents, which is valuable but depends on having cost and usage data infrastructure in place first.

**Independent Test**: Can be fully tested by requesting the agent leaderboard endpoint with different sort parameters and verifying the ordering and calculated metrics (including health score).

**Acceptance Scenarios**:

1. **Given** multiple agents have audit log data, **When** an admin requests the agent leaderboard sorted by cost, **Then** agents are returned in descending order of total cost with their run count, error rate, average latency, and health score.
2. **Given** a `limit` parameter is provided, **When** the admin requests the leaderboard, **Then** only that many agents are returned.
3. **Given** `sortBy=errorRate`, **When** the admin requests the leaderboard, **Then** agents are sorted by error rate in descending order.
4. **Given** no audit data exists for any agent, **When** the admin requests the leaderboard, **Then** an empty agent list is returned.

---

### User Story 5 - View Model Usage Breakdown (Priority: P2)

As a platform admin, I want to see which LLM models are being used across the platform and their associated costs so I can optimize model selection and negotiate pricing.

**Why this priority**: Model-level visibility complements agent-level analytics but is a secondary concern after understanding overall costs and usage.

**Independent Test**: Can be fully tested by requesting the model usage endpoint and verifying it returns per-model aggregates of call counts, token usage, and cost.

**Acceptance Scenarios**:

1. **Given** audit logs exist with different `model` values, **When** an admin requests model usage, **Then** the system returns a list of models sorted by total cost descending, each with call count, input tokens, output tokens, and total cost.
2. **Given** some audit logs have null `model` values, **When** model usage is generated, **Then** those entries are excluded from the model breakdown.
3. **Given** no audit logs with model data exist, **When** the admin requests model usage, **Then** an empty model list is returned.

---

### Edge Cases

- **No data (fresh install)**: All endpoints return zeros in numeric fields and empty arrays in list fields — never null or error.
- **Invalid date range** (`fromDate > toDate`): System returns 400 with error message "fromDate must be before toDate".
- **Invalid sort parameter**: Validation catches it and returns 400 with structured error details.
- **Single agent in timeline**: Timeline returns a single series entry for that agent.
- **Agents with zero cost**: Included in leaderboard with 0 cost, still ranked and showing other metrics.
- **Null cost entries in audit logs**: Treated as 0 in aggregations (not excluded).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an organization-wide cost summary including today's cost, last 7 days cost, last 30 days cost, total cost (all in USD), and a percentage change comparing the current 7-day period to the prior 7-day period.
- **FR-002**: System MUST support optional `fromDate` and `toDate` query parameters on the cost summary endpoint to filter the aggregation window.
- **FR-003**: System MUST return a 400 error when `fromDate` is after `toDate`.
- **FR-004**: System MUST provide a daily cost timeline returning an array of date strings and per-agent cost series over a configurable window of 7, 30, or 90 days.
- **FR-005**: System MUST zero-fill days with no activity in the cost timeline — dates must never be omitted.
- **FR-006**: System MUST support filtering the cost timeline by a specific `agentId`.
- **FR-007**: System MUST provide platform usage statistics including total runs (distinct trace IDs), total LLM calls, total tool calls, and average run cost in USD.
- **FR-008**: System MUST provide approval workflow metrics including total approvals, auto-approved count, approved count, denied count, and expired count.
- **FR-009**: System MUST support optional date range filtering on the usage statistics endpoint.
- **FR-010**: System MUST provide an agent leaderboard with per-agent metrics: total cost, total runs, error rate, average latency, and a calculated health score.
- **FR-011**: System MUST support sorting the agent leaderboard by cost, runs, or error rate.
- **FR-012**: System MUST support a configurable `limit` parameter on the agent leaderboard (default 10).
- **FR-013**: System MUST provide a model usage breakdown listing each LLM model with call count, total input tokens, total output tokens, and total cost in USD, sorted by cost descending.
- **FR-014**: System MUST require authentication (JWT) on all analytics endpoints.
- **FR-015**: System MUST aggregate data from existing audit log and approval ticket records — no new data models are introduced.
- **FR-016**: System MUST return zeros and empty arrays (not nulls or errors) when no data exists for any analytics endpoint.
- **FR-017**: All analytics endpoints MUST respond within 500 milliseconds under normal load.
- **FR-018**: System MUST use set-based aggregation queries — never loading all individual records into application memory.

### Key Entities

- **Cost Summary**: Represents aggregated cost data across configurable time windows. Key attributes: today's cost, 7-day cost, 30-day cost, total cost, week-over-week percentage change. Derived from audit log cost entries.
- **Cost Timeline**: Represents a time-series of daily costs per agent. Key attributes: ordered date array, per-agent series with daily cost values. Derived from audit log cost entries grouped by date and agent.
- **Usage Statistics**: Represents platform-wide usage metrics. Key attributes: run count (distinct traces), LLM call count, tool call count, average cost per run, approval status counts. Derived from audit logs and approval tickets.
- **Agent Leaderboard Entry**: Represents an agent's performance summary. Key attributes: agent identity, total cost, run count, error rate, average latency, health score. Derived from audit logs grouped by agent.
- **Model Usage Entry**: Represents usage for a specific LLM model. Key attributes: model name, call count, token counts (input/output), total cost. Derived from audit logs grouped by model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Platform admins can view organization-wide cost data across four time windows (today, 7-day, 30-day, all-time) in a single request.
- **SC-002**: Cost trends are quantified with a week-over-week percentage change indicator, enabling admins to detect spending increases or decreases.
- **SC-003**: Daily cost timelines display data for every day in the selected window (7, 30, or 90 days), with zero-filled gaps, enabling accurate trend visualization.
- **SC-004**: Platform usage can be assessed through at least 9 distinct metrics (runs, LLM calls, tool calls, avg cost, total approvals, auto-approved, approved, denied, expired).
- **SC-005**: Agent performance comparison is available through a sortable, limited leaderboard covering cost, activity, reliability, and health dimensions.
- **SC-006**: Model-level cost attribution enables admins to see which LLM models consume the most budget.
- **SC-007**: All analytics endpoints respond within 500 milliseconds, ensuring a responsive dashboard experience.

## Assumptions

- All cost data is stored in USD in the `costUsd` field of audit log records. No currency conversion is needed.
- The audit log `event` field distinguishes between LLM calls and tool calls (e.g., `llm_call` vs `tool_call`) for usage counting.
- The `traceId` field in audit logs groups related events into a single "run" — a distinct count of trace IDs represents total runs.
- The health score calculation follows the algorithm established in EPIC 2 (agent management).
- A composite database index on `(agentId, createdAt)` for audit logs is required but not yet present — must be added.
- Approval ticket statuses (`PENDING`, `APPROVED`, `DENIED`, `EXPIRED`, `AUTO_APPROVED`) are already defined and populated by EPIC 4.
- Authentication and RBAC infrastructure from prior epics is available. All analytics endpoints require a valid JWT but no specific role restriction (any authenticated user can view analytics).

## Out of Scope

- Budget alerts and threshold notifications
- Projected cost forecasting
- Per-user cost attribution
- Chargeback and department-level billing
- Real-time streaming metrics (SSE/WebSocket for live dashboards)
- Frontend dashboard components (this epic covers API only)
- Custom date granularity (hourly, weekly) — only daily granularity is supported
