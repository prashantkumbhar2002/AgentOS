# Feature Specification: Audit Logging & Observability

**Feature Branch**: `002-jwt-auth-rbac` (consolidated)
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "EPIC 3 — Audit Logging & Observability: Complete audit trail for all AI agent actions, with query/filter/replay capabilities, cost calculation, CSV export, and a governance SDK for automatic log shipping"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ingest an Audit Event (Priority: P1)

An AI agent running in the organization completes an action — an LLM call,
a tool invocation, or a decision — and records the event to the platform.
The platform calculates the cost of the action based on the model used,
persists the event, and notifies connected dashboard users in real time.
The agent's "last active" timestamp is updated so operators see fresh
activity data.

**Why this priority**: Ingestion is the foundation of the entire audit
system. No querying, tracing, or cost analysis is possible until events
flow into the platform.

**Independent Test**: Can be tested by submitting a valid audit event
payload and verifying the event is persisted with a server-calculated
cost, the agent's last-active timestamp is updated, and an SSE event
is broadcast.

**Acceptance Scenarios**:

1. **Given** a registered agent, **When** the agent submits a valid audit
   event with model and token counts, **Then** the system calculates
   costUsd server-side, persists the event, and returns the id, traceId,
   and costUsd.
2. **Given** a valid audit event, **When** the event is persisted,
   **Then** the agent's last-active timestamp is updated without blocking
   the response.
3. **Given** a valid audit event, **When** it is persisted, **Then** all
   connected dashboard users receive a real-time "audit.log" event.
4. **Given** an event referencing a non-existent agent, **When** it is
   submitted, **Then** the system returns a 400 error identifying the
   agent as not found.
5. **Given** an event with missing or invalid fields, **When** it is
   submitted, **Then** the system returns a 400 error with field-level
   details.

---

### User Story 2 — Query and Filter Audit Logs (Priority: P2)

A platform operator opens the audit log viewer and sees a paginated,
reverse-chronological list of all events. They can filter by agent,
trace, event type, success/failure status, and date range. The response
includes a total cost sum for the matching events so operators can see
spending at a glance.

**Why this priority**: Querying is the primary way operators interact
with audit data. Without it, the ingested events are invisible.

**Independent Test**: Can be tested by seeding multiple audit events
with varying attributes and verifying that filter combinations,
pagination, and the total cost sum return correct results.

**Acceptance Scenarios**:

1. **Given** a set of audit events, **When** an operator queries without
   filters, **Then** the system returns the most recent events (page 1,
   default 50 per page) with total count and total cost.
2. **Given** events for multiple agents, **When** an operator filters by
   a specific agent, **Then** only events for that agent are returned.
3. **Given** events spanning multiple days, **When** an operator filters
   by date range, **Then** only events within the range are returned.
4. **Given** a mix of successful and failed events, **When** an operator
   filters by success=false, **Then** only failed events are returned.
5. **Given** no events matching the applied filters, **When** the
   operator views the list, **Then** an empty result set is returned
   with total count and total cost of zero.

---

### User Story 3 — View a Complete Trace (Priority: P3)

A developer investigating an agent's behavior selects a trace identifier
and sees every event in that trace ordered by time. The trace view shows
the agent's name, the total cost across all events, total latency, start
and end timestamps, and whether the overall trace succeeded.

**Why this priority**: Trace-level investigation is how operators
diagnose agent issues, but it depends on events being queryable (US2)
to discover trace identifiers.

**Independent Test**: Can be tested by creating multiple events with
the same trace identifier and verifying the trace endpoint aggregates
and orders them correctly.

**Acceptance Scenarios**:

1. **Given** multiple events sharing a trace identifier, **When** a user
   requests that trace, **Then** the system returns all events ordered
   by time with aggregate cost, latency, timestamps, and success status.
2. **Given** a trace where the last event failed, **When** a user views
   the trace, **Then** the overall trace success is false.
3. **Given** a non-existent trace identifier, **When** a user requests
   it, **Then** the system returns a 404 error.

---

### User Story 4 — Export Audit Logs as CSV (Priority: P4)

An admin or compliance officer exports a filtered set of audit logs as a
CSV file for offline analysis, reporting, or regulatory review. The
export includes agent names resolved from identifiers.

**Why this priority**: Export is a compliance and reporting requirement
but is used less frequently than interactive querying.

**Independent Test**: Can be tested by applying filters and verifying
the response is a downloadable CSV file with correct headers and
data rows matching the filter criteria.

**Acceptance Scenarios**:

1. **Given** audit events exist matching the applied filters, **When**
   an admin requests a CSV export, **Then** the system returns a
   downloadable CSV with all expected columns and matching rows.
2. **Given** no events match the applied filters, **When** an admin
   requests a CSV export, **Then** the system returns a CSV with the
   header row only.
3. **Given** a non-admin, non-approver user, **When** they attempt a
   CSV export, **Then** the system returns a 403 error.

---

### User Story 5 — View Agent Statistics (Priority: P5)

A platform user viewing an agent's detail page sees aggregated
operational statistics: total runs, total calls, cumulative cost,
average latency, error rate, success rate, and the most frequently
used tools. These statistics power the agent detail view built in
the Agent Registry epic.

**Why this priority**: Statistics enable data-driven governance
decisions but depend on audit events being ingested and queryable.

**Independent Test**: Can be tested by seeding audit events for
an agent and verifying the stats endpoint returns correct aggregations.

**Acceptance Scenarios**:

1. **Given** an agent with multiple audit events, **When** a user
   requests its statistics, **Then** the system returns accurate
   totals, averages, rates, and a ranked list of tools by usage.
2. **Given** an agent with no audit events, **When** a user requests
   its statistics, **Then** the system returns zero counts, zero cost,
   and an empty tools list.
3. **Given** a non-existent agent identifier, **When** a user requests
   its statistics, **Then** the system returns a 404 error.

---

### User Story 6 — Cost Calculation (Priority: P6)

The platform automatically calculates the dollar cost of every LLM call
based on the model used and the number of input/output tokens. Costs
are expressed with 6-decimal precision in USD. Unknown models receive
a cost of zero rather than causing errors.

**Why this priority**: Cost tracking is a core governance feature but
is a server-side computation embedded within event ingestion rather
than a user-facing flow.

**Independent Test**: Can be tested by providing known model/token
combinations and verifying the calculated cost matches expected values
to 6-decimal precision.

**Acceptance Scenarios**:

1. **Given** a known model and token counts, **When** the cost is
   calculated, **Then** the result matches the expected price to
   6-decimal USD precision.
2. **Given** an unknown model, **When** the cost is calculated,
   **Then** the result is zero — no error is raised.
3. **Given** zero input and output tokens, **When** the cost is
   calculated, **Then** the result is zero.

---

### User Story 7 — Governance SDK (Priority: P7)

A developer building an AI agent uses the governance SDK to instrument
their agent. The SDK wraps LLM API calls and tool invocations,
automatically recording audit events to the platform. Network failures
in log shipping are silently swallowed so they never interrupt the
agent's primary work.

**Why this priority**: The SDK is the integration point for external
agents but depends on the audit ingestion endpoint (US1) being available.

**Independent Test**: Can be tested by instantiating the SDK, performing
a wrapped function call, and verifying an audit event is sent to the
platform endpoint.

**Acceptance Scenarios**:

1. **Given** a configured SDK instance, **When** the developer wraps
   an LLM call, **Then** the SDK automatically logs an "llm_call" event
   with model, tokens, latency, and cost.
2. **Given** a configured SDK instance, **When** the developer wraps
   a tool invocation, **Then** the SDK automatically logs a "tool_call"
   event with tool name, inputs, success, and latency.
3. **Given** the platform endpoint is unreachable, **When** the SDK
   attempts to log an event, **Then** it swallows the error and does
   not throw, allowing the agent to continue.
4. **Given** a new SDK instance, **When** it is created, **Then** it
   generates a unique trace identifier for all events in that session.

---

### Edge Cases

- **Unknown model in cost calculation**: Return costUsd = 0, never
  throw an error.
- **Audit event for non-existent agent**: Return 400 with
  "Agent not found" — do not silently create orphan records.
- **Trace identifier not found**: Return 404 with "Trace not found".
- **CSV export with no results**: Return a valid CSV containing only
  the header row.
- **High-volume ingestion**: The ingestion endpoint must respond
  quickly; the agent's last-active timestamp update must not block
  the response.
- **SDK network failure**: Log a warning internally, never throw an
  exception that would disrupt the agent's execution.
- **Cost precision**: All monetary values use 6-decimal USD precision
  to capture sub-cent LLM token costs accurately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept audit events containing agent
  identifier, trace identifier, event type, and optional fields for
  model, tool name, inputs, outputs, token counts, latency, success
  status, error message, and metadata.
- **FR-002**: System MUST calculate cost in USD server-side based on
  the model and token counts — cost values from the client MUST be
  ignored.
- **FR-003**: System MUST update the originating agent's last-active
  timestamp on every audit event without blocking the ingestion
  response.
- **FR-004**: System MUST broadcast a real-time event to connected
  dashboards for every ingested audit event.
- **FR-005**: System MUST validate the agent identifier on ingestion
  and reject events for non-existent agents with a 400 error.
- **FR-006**: System MUST provide paginated, filterable audit log
  queries with filters for agent, trace, event type, success status,
  and date range.
- **FR-007**: System MUST return a total cost sum alongside paginated
  query results.
- **FR-008**: System MUST provide a trace view that aggregates all
  events for a single trace identifier, ordered chronologically, with
  total cost, total latency, start/end timestamps, and overall success.
- **FR-009**: System MUST support CSV export of filtered audit logs,
  restricted to admin and approver roles.
- **FR-010**: System MUST include resolved agent names (not just
  identifiers) in CSV exports.
- **FR-011**: System MUST provide per-agent statistical aggregations:
  total runs, total calls, cumulative cost, average latency, error
  rate, success rate, and top tools ranked by usage count.
- **FR-012**: System MUST return zero-value statistics for agents
  with no audit history.
- **FR-013**: System MUST calculate costs with 6-decimal USD precision
  and return zero for unknown models without raising errors.
- **FR-014**: System MUST provide an SDK that wraps LLM calls and tool
  invocations, automatically shipping audit events to the platform.
- **FR-015**: The SDK MUST generate a unique trace identifier per
  session and attach it to all events.
- **FR-016**: The SDK MUST silently handle network errors during log
  shipping — agent execution MUST NOT be interrupted.
- **FR-017**: System MUST enforce rate limiting on audit ingestion at
  a per-agent level.
- **FR-018**: System MUST support six event types: llm_call, tool_call,
  approval_requested, approval_resolved, action_blocked, action_taken.

### Key Entities

- **AuditLog**: A single recorded event from an AI agent. Key
  attributes: unique identifier, agent reference, trace identifier,
  event type, optional model name, optional tool name, optional
  input/output payloads, optional token counts, server-calculated cost,
  optional latency, success flag, optional error message, optional
  metadata, and creation timestamp.
- **Agent** (existing): Updated with a last-active timestamp on every
  audit event ingestion.
- **AgentStatistics** *(computed, not persisted)*: Aggregated
  operational metrics for an agent: total runs (unique traces), total
  calls, cumulative cost, average latency, error rate, success rate,
  and top tools by usage.

### Assumptions

- The AuditLog data model already exists in the database schema from
  project bootstrapping (EPIC 1 created the Prisma schema).
- Cost calculation uses a static pricing table maintained in source
  code. Prices are updated via code changes, not runtime configuration.
- "Total runs" in agent statistics counts unique trace identifiers,
  while "total calls" counts individual audit log entries.
- The SDK's `requestApproval` method depends on the Approvals endpoint
  from EPIC 4. Until that epic is implemented, `requestApproval` will
  throw a not-implemented error.
- CSV export does not use streaming for the initial implementation;
  result sets are bounded by the query filters applied.
- The ingestion rate limit (per-agent) is separate from the global
  API rate limit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: AI agents can record audit events and receive a response
  with cost information in under 50 milliseconds.
- **SC-002**: Operators can query and filter audit logs with results
  returned within 2 seconds for up to 100,000 stored events.
- **SC-003**: 100% of LLM-call events have an accurate, server-
  calculated cost based on the model pricing table.
- **SC-004**: Trace views reconstruct the complete event sequence for
  a given trace with correct chronological ordering.
- **SC-005**: CSV exports include all filtered events with resolved
  agent names and are downloadable as a valid CSV file.
- **SC-006**: Agent statistics accurately reflect total runs, cost,
  latency, and error rates as verified against the underlying events.
- **SC-007**: The governance SDK records audit events without adding
  more than 10 milliseconds of latency to the wrapped operation.
- **SC-008**: SDK logging failures never interrupt agent execution —
  0% failure propagation rate.
- **SC-009**: Dashboard users with an open event stream see audit
  events within 1 second of ingestion.

### Out of Scope

- Log streaming to external SIEM (Splunk, Datadog)
- Log retention policies / auto-deletion
- Real-time anomaly detection
- Log tamper detection / signing
