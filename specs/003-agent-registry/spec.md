# Feature Specification: Agent Registry

**Feature Branch**: `003-agent-registry`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "EPIC 2 — Agent Registry: Central registry for AI agent registration, lifecycle management, and real-time status broadcasting"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Register a New Agent (Priority: P1)

A platform engineer registers a new AI agent by providing its name,
description, owner team, LLM model, risk tier, deployment environment,
and the list of tools it can use. The system creates the agent in DRAFT
status and notifies connected dashboard users in real time that a new
agent has been registered.

**Why this priority**: Registration is the entry point for the entire
governance platform. No agent can be monitored, governed, or audited
until it exists in the registry.

**Independent Test**: Can be tested by submitting a valid agent payload
and verifying the agent is persisted in DRAFT status with correct
attributes.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they submit a valid agent
   registration with name, description, owner team, LLM model, risk
   tier, environment, and tools, **Then** the system creates the agent
   in DRAFT status and returns its id, name, status, risk tier, and
   creation timestamp.
2. **Given** an authenticated user, **When** they submit an agent
   registration with missing or invalid fields, **Then** the system
   returns a 400 error with details identifying each invalid field.
3. **Given** an agent is successfully registered, **When** any dashboard
   user has an open event stream, **Then** they receive an
   "agent.registered" event with the agent's id, name, and risk tier.
4. **Given** two agents with the same name on the same team, **When**
   the second is registered, **Then** the system allows it (names are
   not required to be unique).

---

### User Story 2 — Browse and Filter the Agent Registry (Priority: P2)

A platform admin opens the agent registry page and sees a paginated
list of all registered agents. They can filter by status, risk tier,
environment, or owner team, and search by name or description. Each
row shows a summary including tool count and recent cost.

**Why this priority**: Visibility across all agents is the core value
proposition of the registry. Without listing and filtering, operators
cannot discover or triage agents.

**Independent Test**: Can be tested by seeding multiple agents with
varying attributes and verifying that filter combinations and
pagination return the correct subsets.

**Acceptance Scenarios**:

1. **Given** a registry with multiple agents, **When** a user requests
   the agent list without filters, **Then** the system returns the
   first page (default 20 items) with the total count.
2. **Given** agents with different statuses, **When** a user filters by
   status "ACTIVE", **Then** only ACTIVE agents are returned.
3. **Given** agents across teams, **When** a user filters by owner team
   "sales", **Then** only agents owned by the sales team are returned.
4. **Given** a user searches for "email", **When** agents named "Email
   Draft Agent" and "Research Agent" exist, **Then** only the matching
   agent is returned.
5. **Given** no agents match the applied filters, **When** the user
   views the list, **Then** an empty result set is returned with total
   count of zero.

---

### User Story 3 — View Agent Detail with Statistics (Priority: P3)

A developer or admin selects an agent from the registry to view its
full detail: metadata, registered tools, operational statistics (total
runs, 7-day cost, average latency, error rate, health score), recent
audit log entries, pending approval tickets, and assigned governance
policies.

**Why this priority**: Detail view enables informed decisions about
agent governance — whether to approve, suspend, or investigate an
agent — but depends on the list view (US2) to navigate to it.

**Independent Test**: Can be tested by creating an agent with known
audit logs, approvals, and policies, then verifying the detail
endpoint aggregates and returns all expected sections.

**Acceptance Scenarios**:

1. **Given** an existing agent with tools, audit logs, approvals, and
   policies, **When** a user requests its detail, **Then** the system
   returns the full agent object, tools array, computed statistics,
   last 10 audit entries, pending approvals, and assigned policies.
2. **Given** an agent with no audit history, **When** a user requests
   its detail, **Then** statistics show zero runs, zero cost, and a
   health score of 100 (no errors).
3. **Given** a non-existent agent id, **When** a user requests its
   detail, **Then** the system returns a 404 error.

---

### User Story 4 — Manage Agent Lifecycle Status (Priority: P4)

An admin or approver changes an agent's lifecycle status following
strict transition rules. An agent progresses from DRAFT to APPROVED to
ACTIVE. It can be SUSPENDED by an admin and later re-activated. Any
agent can be DEPRECATED (terminal state) by an admin. Each status
change is broadcast as a real-time event to all connected dashboards.

**Why this priority**: Lifecycle governance is the central control
mechanism, but it requires agents to exist (US1) and be discoverable
(US2) before it becomes actionable.

**Independent Test**: Can be tested by creating agents in each status
and attempting valid and invalid transitions, verifying acceptance or
rejection with correct error messages.

**Acceptance Scenarios**:

1. **Given** a DRAFT agent, **When** an approver sets status to
   APPROVED, **Then** the system updates the status and records the
   approver as the approving user.
2. **Given** an APPROVED agent, **When** an admin sets status to ACTIVE,
   **Then** the system updates the status.
3. **Given** a DRAFT agent, **When** a user attempts to set status
   directly to ACTIVE, **Then** the system returns a 400 error
   explaining the required transition path (DRAFT to APPROVED first).
4. **Given** an ACTIVE agent, **When** an admin sets status to
   SUSPENDED, **Then** the system updates the status.
5. **Given** a SUSPENDED agent, **When** an admin sets status to ACTIVE,
   **Then** the system re-activates the agent.
6. **Given** any agent, **When** an admin sets status to DEPRECATED,
   **Then** the status is updated and the agent cannot transition to
   any other status afterward.
7. **Given** an ACTIVE agent, **When** a viewer attempts to change its
   status, **Then** the system returns a 403 error.
8. **Given** a status change, **When** dashboard users have an open
   event stream, **Then** they receive an "agent.status_changed" event
   with the agent id, old status, new status, and who made the change.

---

### User Story 5 — Update Agent Metadata (Priority: P5)

An admin updates an existing agent's metadata — name, description,
owner team, LLM model, risk tier, environment, tools, or tags —
without changing its lifecycle status.

**Why this priority**: Metadata correction is needed but is a lower
frequency operation that depends on the agent already existing and
being discoverable.

**Independent Test**: Can be tested by updating individual fields and
verifying that only the specified fields change while the rest remain
unmodified.

**Acceptance Scenarios**:

1. **Given** an existing agent, **When** an admin sends a partial update
   with a new description, **Then** only the description changes and
   all other fields are preserved.
2. **Given** an existing agent, **When** a non-admin user attempts to
   update it, **Then** the system returns a 403 error.
3. **Given** a non-existent agent id, **When** an admin attempts to
   update it, **Then** the system returns a 404 error.

---

### User Story 6 — Deprecate (Soft Delete) an Agent (Priority: P6)

An admin removes an agent from active use by setting its status to
DEPRECATED. The agent record is retained for audit history but is
excluded from active listings by default. An ACTIVE agent cannot be
deprecated directly — it must be suspended first.

**Why this priority**: Agent retirement is an end-of-lifecycle
operation that depends on all other registry functions being in place.

**Independent Test**: Can be tested by attempting to deprecate agents
in various statuses and verifying the correct acceptance or rejection.

**Acceptance Scenarios**:

1. **Given** a SUSPENDED agent, **When** an admin deprecates it,
   **Then** the agent status becomes DEPRECATED.
2. **Given** an ACTIVE agent, **When** an admin attempts to deprecate
   it, **Then** the system returns a 400 error instructing the admin
   to suspend the agent first.
3. **Given** a DEPRECATED agent, **When** an admin attempts to change
   its status to ACTIVE, **Then** the system returns a 400 error
   (DEPRECATED is terminal).
4. **Given** a non-admin user, **When** they attempt to deprecate an
   agent, **Then** the system returns a 403 error.

---

### User Story 7 — Real-Time Event Stream (Priority: P7)

A dashboard user opens a persistent connection to receive real-time
events from the platform. The stream delivers agent registrations,
status changes, and other platform events as they happen. The
connection sends periodic heartbeats to stay alive and cleans up
resources when the user disconnects.

**Why this priority**: The SSE infrastructure is a cross-cutting
concern that enhances all other stories but is not required for their
core functionality to work.

**Independent Test**: Can be tested by opening an event stream,
triggering an agent registration, and verifying the event is received.
Disconnect the client and verify server-side cleanup.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they open an event stream
   connection, **Then** the system establishes a persistent connection
   and begins sending heartbeat pings every 30 seconds.
2. **Given** an open event stream, **When** a new agent is registered
   elsewhere, **Then** the stream delivers an "agent.registered" event
   with the agent's id, name, and risk tier.
3. **Given** an open event stream, **When** an agent's status changes,
   **Then** the stream delivers an "agent.status_changed" event with
   the agent id, old status, new status, and who changed it.
4. **Given** an open event stream, **When** the client disconnects,
   **Then** the server removes the client from active connections and
   releases resources.
5. **Given** an unauthenticated request, **When** a user attempts to
   open an event stream, **Then** the system rejects the connection
   with a 401 error.

---

### Edge Cases

- **Duplicate agent names**: Allowed — agent names are not unique.
  Multiple agents on the same team can share a name.
- **Deprecating an ACTIVE agent**: Rejected with 400. The admin must
  suspend the agent first, then deprecate it.
- **Empty list results**: Return an empty array with total count of
  zero and the requested pagination parameters.
- **Invalid status transitions**: Return 400 with a message describing
  the required transition path (e.g., "Invalid transition: DRAFT to
  ACTIVE. Agent must be APPROVED first.").
- **DEPRECATED is terminal**: No status transition out of DEPRECATED
  is permitted.
- **Agent detail for an agent with no activity**: Statistics should
  default to zero runs, zero cost, zero latency, zero error rate,
  and a health score of 100.
- **Search with special characters**: Search terms are matched against
  agent name and description using case-insensitive containment.
- **Pagination beyond available data**: Return an empty data array
  when the requested page exceeds the total number of pages.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow any authenticated user to register a
  new agent with name, description, owner team, LLM model, risk tier,
  environment, tools, and optional tags.
- **FR-002**: System MUST create newly registered agents in DRAFT
  status.
- **FR-003**: System MUST validate all registration input fields and
  return field-level error details on validation failure.
- **FR-004**: System MUST provide a paginated list of agents with
  filtering by status, risk tier, environment, and owner team, plus
  search by name or description.
- **FR-005**: System MUST return agent summaries in list view including
  tool count and 7-day cost.
- **FR-006**: System MUST return a full agent detail view including
  tools, computed statistics (total runs, 7-day cost, average latency,
  error rate, health score), last 10 audit entries, pending approvals,
  and assigned policies.
- **FR-007**: System MUST compute health scores using a weighted
  formula: 40% inverse error rate + 30% inverse approval deny rate +
  30% latency factor, scaled to 0-100.
- **FR-008**: System MUST enforce lifecycle status transitions:
  DRAFT to APPROVED, APPROVED to ACTIVE, ACTIVE to SUSPENDED,
  SUSPENDED to ACTIVE, and any status to DEPRECATED.
- **FR-009**: System MUST reject invalid status transitions with a
  descriptive error message identifying the required path.
- **FR-010**: System MUST restrict status changes to admin and approver
  roles, with SUSPENDED and DEPRECATED restricted to admin only.
- **FR-011**: System MUST record the approving user's identity when an
  agent transitions to APPROVED status.
- **FR-012**: System MUST allow only admins to update agent metadata.
- **FR-013**: System MUST support partial metadata updates, preserving
  unmodified fields.
- **FR-014**: System MUST implement soft delete by setting agent status
  to DEPRECATED, preventing direct deprecation of ACTIVE agents.
- **FR-015**: System MUST broadcast real-time events for agent
  registrations and status changes to all connected dashboard users.
- **FR-016**: System MUST maintain persistent event stream connections
  with 30-second heartbeat pings and clean up resources on client
  disconnect.
- **FR-017**: System MUST authenticate event stream connections using
  a token provided as a query parameter.
- **FR-018**: System MUST return 404 for requests referencing
  non-existent agents.

### Key Entities

- **Agent**: Represents a registered AI agent in the organization.
  Key attributes: unique identifier, name, description, owner team,
  LLM model identifier, risk tier (LOW | MEDIUM | HIGH | CRITICAL),
  deployment environment (DEV | STAGING | PROD), lifecycle status
  (DRAFT | PENDING_APPROVAL | APPROVED | ACTIVE | SUSPENDED |
  DEPRECATED), approving user reference, tags, creation and update
  timestamps, and last active timestamp.
- **AgentTool**: Represents a capability or tool that an agent can
  invoke. Key attributes: name, description, and a reference to the
  owning agent. An agent can have zero or more tools.
- **AgentStatistics** *(computed, not persisted)*: Aggregated
  operational metrics for an agent: total runs, 7-day cost in USD,
  average latency in milliseconds, error rate (0.0-1.0), and health
  score (0-100).

### Assumptions

- The Agent and AgentTool data models already exist in the database
  schema from project bootstrapping (EPIC 1 seeded sample data using
  these models).
- Agent names are not unique — the system uses generated unique
  identifiers, not names, for all lookups and references.
- The health score algorithm uses audit log data that may not exist
  for newly registered agents; in this case, defaults produce a
  health score of 100.
- The SSE event stream is a shared infrastructure component used by
  this epic and all future epics. It is not specific to the agent
  registry.
- Event stream authentication uses a query parameter token because
  the browser EventSource API does not support custom headers.
- Cost calculations depend on audit log data from EPIC 3 (Audit &
  Observability). Until that epic is implemented, cost and run count
  will be zero.
- The 7-day cost aggregation window is a rolling 7-day period ending
  at the time of the request.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Platform engineers can register a new agent and see it
  appear in the registry in under 3 seconds.
- **SC-002**: The agent list loads with filters applied and returns
  results within 2 seconds for a registry of up to 1,000 agents.
- **SC-003**: 100% of invalid status transitions are rejected with a
  descriptive error message identifying the required path.
- **SC-004**: Dashboard users with an open event stream see agent
  registrations and status changes within 1 second of the event
  occurring.
- **SC-005**: Health scores are consistently computed using the
  weighted formula and fall within the 0-100 range for all agents.
- **SC-006**: 100% of write operations (register, update, status
  change, deprecate) are restricted to the appropriate roles, with
  unauthorized attempts receiving a 403 rejection.
- **SC-007**: Event stream connections remain stable for at least
  1 hour with heartbeats maintaining the connection, and server
  resources are released within 5 seconds of client disconnect.
- **SC-008**: Partial metadata updates preserve all unmodified fields
  with zero data loss.

### Out of Scope

- Agent versioning / rollback
- Agent cloning
- Multi-tenancy scoping
- Agent-to-agent trust relationships
