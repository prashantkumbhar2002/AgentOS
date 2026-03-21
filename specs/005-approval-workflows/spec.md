# Feature Specification: Human-in-the-Loop Approval Workflows

**Feature Branch**: `002-jwt-auth-rbac`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "EPIC 4 — Approval Workflows"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent Requests Human Approval (Priority: P1)

An AI agent determines it needs to perform a risky action (e.g., sending an external email, deleting records). Before proceeding, the agent submits an approval request to the platform, describing the action, its risk level, and reasoning. The platform checks applicable policies: if the policy auto-allows, the agent proceeds immediately; if the policy denies, the agent is blocked; otherwise, a pending approval ticket is created and the agent begins polling for a human decision.

**Why this priority**: This is the core safety mechanism. Without the ability to request and receive approvals, agents cannot perform any governed actions. This is the minimum viable product for the entire approval workflow.

**Independent Test**: Can be fully tested by submitting an approval request for a valid agent and verifying that a pending ticket is created with the correct expiration time, that an SSE event is broadcast, and that the ticket can be retrieved by the agent via polling.

**Acceptance Scenarios**:

1. **Given** a registered agent and no auto-allow policy, **When** the agent submits an approval request with a valid action type and risk score, **Then** a PENDING ticket is created with a 30-minute expiration and returned with a 201 status.
2. **Given** an auto-allow policy matching the action, **When** the agent submits the request, **Then** the system returns AUTO_APPROVED immediately and logs the event.
3. **Given** a deny policy matching the action, **When** the agent submits the request, **Then** the system returns 403 with the blocking policy name and logs the event.
4. **Given** a non-existent agent ID, **When** a request is submitted, **Then** the system returns 400 with "Agent not found".

---

### User Story 2 - Approver Resolves a Ticket (Priority: P1)

A human approver (with admin or approver role) reviews a pending approval ticket and makes a decision — approve or deny. The system records who made the decision and when, broadcasts an SSE event so the dashboard updates in real time, and logs the resolution to the audit trail. The agent, which has been polling the ticket, receives the updated status and proceeds or aborts accordingly.

**Why this priority**: Without the ability to resolve tickets, the approval workflow is incomplete. Agents would be stuck polling forever. This is equally critical as ticket creation.

**Independent Test**: Can be tested by creating a ticket, then resolving it with an approver account, and verifying the ticket status changes, the resolver is recorded, and an SSE event is emitted.

**Acceptance Scenarios**:

1. **Given** a PENDING ticket, **When** an approver submits an APPROVED decision, **Then** the ticket status changes to APPROVED, the resolver's identity and timestamp are recorded, and an SSE event is broadcast.
2. **Given** a PENDING ticket, **When** an approver submits a DENIED decision with a comment, **Then** the ticket status changes to DENIED and the comment is recorded.
3. **Given** an expired ticket, **When** an approver attempts to resolve it, **Then** the system returns 400 "Ticket expired".
4. **Given** an already-resolved ticket, **When** an approver attempts to resolve it again, **Then** the system returns 400 "Ticket already resolved".
5. **Given** a viewer role, **When** the user attempts to resolve a ticket, **Then** the system returns 403 "Insufficient permissions".

---

### User Story 3 - Approver Views Pending Queue (Priority: P2)

An approver opens the approval queue and sees all pending tickets sorted by urgency (nearest expiration first). They can filter by status and agent. The total count of pending tickets is displayed prominently so approvers know their workload at a glance.

**Why this priority**: Approvers need to discover and prioritize tickets efficiently, but this is secondary to the core create/resolve flow.

**Independent Test**: Can be tested by creating multiple tickets with different expiration times, then querying the list and verifying sort order, pagination, and pending count.

**Acceptance Scenarios**:

1. **Given** multiple pending tickets, **When** an approver queries the list with default parameters, **Then** tickets are returned sorted by expiration (most urgent first) with a pending count.
2. **Given** tickets for different agents, **When** the approver filters by a specific agent, **Then** only that agent's tickets are returned.
3. **Given** no pending tickets, **When** the approver queries the list, **Then** an empty list is returned with a pending count of 0.

---

### User Story 4 - Agent Polls for Decision (Priority: P2)

After creating an approval request, the agent repeatedly polls the ticket endpoint to check whether a decision has been made. The agent receives the full ticket object including its current status. If the ticket has been approved, denied, or expired, the agent acts accordingly.

**Why this priority**: Polling is how agents receive decisions. While the create and resolve endpoints must exist first, polling is the mechanism that closes the loop.

**Independent Test**: Can be tested by creating a ticket, polling it (status PENDING), resolving it, then polling again (status APPROVED/DENIED) and verifying the updated state is returned.

**Acceptance Scenarios**:

1. **Given** a PENDING ticket, **When** the agent polls the ticket, **Then** the full ticket object with status PENDING is returned.
2. **Given** a resolved ticket, **When** the agent polls the ticket, **Then** the ticket is returned with the resolution status and resolver details.
3. **Given** an expired ticket, **When** the agent polls, **Then** the ticket is returned with status EXPIRED (not a 404).
4. **Given** a non-existent ticket ID, **When** the agent polls, **Then** a 404 is returned.

---

### User Story 5 - Slack Notification & Interactive Resolution (Priority: P3)

When a new approval ticket is created, the system sends a formatted notification to a designated Slack channel with interactive Approve/Deny buttons. Approvers can click a button directly in Slack to resolve the ticket without opening the platform dashboard. The Slack message is updated after resolution to show who approved or denied.

**Why this priority**: Slack integration is a convenience layer. The core workflow functions without it — approvers can use the dashboard. This is additive value.

**Independent Test**: Can be tested by creating a ticket, verifying a Slack message job is queued, simulating Slack button clicks, and confirming the ticket is resolved and the Slack message is updated.

**Acceptance Scenarios**:

1. **Given** a new PENDING ticket, **When** the ticket is created, **Then** a notification job is queued and, when processed, sends a Slack message with the agent name, action type, risk level, reasoning, and Approve/Deny buttons.
2. **Given** a Slack Approve button click, **When** the interaction is received, **Then** the ticket is resolved as APPROVED and the Slack message is updated to remove buttons and show the approver's name.
3. **Given** a Slack notification failure, **When** the message fails to send, **Then** the ticket remains valid and the failure is logged as a warning (the request does not fail).

---

### User Story 6 - Automatic Ticket Expiration (Priority: P3)

Tickets that remain unresolved past their expiration time are automatically marked as EXPIRED by a background job. This prevents stale tickets from accumulating and ensures agents do not wait indefinitely.

**Why this priority**: Expiration is a housekeeping concern. Agents can handle expired tickets gracefully when polling, and the core workflow does not depend on automatic cleanup.

**Independent Test**: Can be tested by creating a ticket with a short expiration, waiting for the cleanup job to run, and verifying the ticket status changes to EXPIRED.

**Acceptance Scenarios**:

1. **Given** a PENDING ticket past its expiration time, **When** the cleanup job runs, **Then** the ticket status is set to EXPIRED.
2. **Given** an already-resolved ticket past its expiration, **When** the cleanup job runs, **Then** the ticket is left unchanged.

---

### User Story 7 - Policy-Based Auto-Decision (Priority: P2)

Before creating a ticket, the system evaluates the agent's action against configured policies. If a policy explicitly allows the action (e.g., "all LOW risk agent actions are auto-allowed"), the system returns AUTO_APPROVED immediately without creating a ticket. If a policy explicitly denies the action (e.g., "delete actions on CRITICAL agents are always denied"), the system blocks with a 403. Both outcomes are logged to the audit trail.

**Why this priority**: Policy evaluation reduces unnecessary human workload and enforces hard safety rules. It is integral to the approval request flow but depends on the policies module (EPIC 5).

**Independent Test**: Can be tested by configuring policies and submitting approval requests, verifying that matching allow policies yield AUTO_APPROVED, deny policies yield 403, and unmatched requests create PENDING tickets.

**Acceptance Scenarios**:

1. **Given** an auto-allow policy for LOW risk actions, **When** a LOW-risk agent submits an approval request, **Then** AUTO_APPROVED is returned immediately and an audit event is logged.
2. **Given** a deny policy for delete actions on CRITICAL agents, **When** a CRITICAL agent requests a delete action, **Then** 403 is returned with the policy name and an audit event is logged.
3. **Given** no matching policy, **When** an agent submits a request, **Then** a PENDING ticket is created (default behavior).

---

### Edge Cases

- Agent polls an expired ticket: the ticket is returned with status EXPIRED, not a 404
- Two approvers click Slack buttons simultaneously: first writer wins via a database transaction; the second receives a "Ticket already resolved" error
- Slack notification fails (service unavailable): the ticket is still created successfully; a warning is logged
- Risk score of exactly 0: the action still requires approval if no auto-allow policy matches (safe default)
- Approval request for a non-existent agent: returns 400 "Agent not found"
- Viewer role attempts to resolve a ticket: returns 403 "Insufficient permissions"

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow any authenticated user to create an approval request for a registered agent.
- **FR-002**: System MUST evaluate applicable policies before creating a ticket: auto-allow, deny, or require approval.
- **FR-003**: System MUST create a PENDING ticket with a 30-minute expiration when approval is required.
- **FR-004**: System MUST queue a notification to the messaging service when a new ticket is created.
- **FR-005**: System MUST return the full ticket object (including current status) when polled by an agent.
- **FR-006**: System MUST allow admin and approver roles to resolve pending tickets with APPROVED or DENIED decisions.
- **FR-007**: System MUST reject resolution attempts on expired tickets with "Ticket expired".
- **FR-008**: System MUST reject resolution attempts on already-resolved tickets with "Ticket already resolved".
- **FR-009**: System MUST record the resolver's identity and timestamp on resolution.
- **FR-010**: System MUST broadcast a real-time event when a ticket is created.
- **FR-011**: System MUST broadcast a real-time event when a ticket is resolved.
- **FR-012**: System MUST log an audit event for every approval resolution.
- **FR-013**: System MUST list approval tickets with filters for status and agent, defaulting to pending tickets sorted by urgency.
- **FR-014**: System MUST include a count of total pending tickets in list responses.
- **FR-015**: System MUST send a formatted notification to the messaging service with action details, risk level, reasoning, and interactive resolution buttons.
- **FR-016**: System MUST accept interactive resolution responses from the messaging service and resolve the corresponding ticket.
- **FR-017**: System MUST update the notification message after resolution to reflect the decision and resolver.
- **FR-018**: System MUST automatically expire PENDING tickets that have passed their expiration time via a background job running at regular intervals.
- **FR-019**: System MUST use a database transaction for resolution to prevent race conditions when multiple approvers act simultaneously.
- **FR-020**: System MUST return 403 with the blocking policy name when a deny policy matches the requested action.
- **FR-021**: System MUST return AUTO_APPROVED immediately when an allow policy matches, without creating a ticket.
- **FR-022**: System MUST classify risk scores into labeled tiers: 0.0–0.39 (LOW), 0.40–0.69 (MEDIUM), 0.70–0.89 (HIGH), 0.90–1.0 (CRITICAL).

### Key Entities

- **ApprovalTicket**: Represents a pending or resolved approval request. Contains the requesting agent's identity, the action being requested, the risk assessment, the current status (PENDING, APPROVED, DENIED, EXPIRED, AUTO_APPROVED), the resolver's identity, expiration time, and a reference to the messaging notification.
- **Agent**: The AI agent requesting approval. Its name is included in notifications for human context.
- **User**: The human who resolves a ticket. Their identity is recorded for audit and accountability.
- **PolicyRule**: Defines auto-allow or auto-deny rules that short-circuit the approval flow. Evaluated before ticket creation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents can submit an approval request and receive a ticket within 2 seconds.
- **SC-002**: Approvers can resolve a ticket (approve or deny) within 3 interactions (view list, select ticket, submit decision).
- **SC-003**: Resolved decisions are visible to polling agents within 5 seconds of resolution.
- **SC-004**: Expired tickets are automatically cleaned up within 10 minutes of their expiration time.
- **SC-005**: 100% of approval resolutions are recorded in the audit trail.
- **SC-006**: Messaging service notifications are delivered within 30 seconds of ticket creation (when the service is available).
- **SC-007**: Simultaneous resolution attempts from multiple approvers result in exactly one resolution — no duplicates or data corruption.
- **SC-008**: Policy auto-decisions (allow/deny) bypass ticket creation entirely, reducing approver workload for rule-covered actions.
- **SC-009**: The approval queue displays pending tickets sorted by urgency with the most time-critical tickets first.

## Assumptions

- The policies module (EPIC 5) provides a policy evaluation function that can be imported. If not yet built, the approval request flow defaults to REQUIRE_APPROVAL for all actions (no auto-allow or auto-deny).
- The messaging service (Slack) is configured via environment variables. If credentials are missing, notification jobs fail gracefully with warnings.
- The existing SSE infrastructure from EPIC 2 is used for real-time event broadcasting.
- The existing audit logging infrastructure from EPIC 3 is used for recording approval events.
- Background job infrastructure (BullMQ + Redis) is configured at the application level.
- Ticket expiration is 30 minutes from creation, not configurable in v1.
- No self-approval restrictions in v1 — any admin or approver can resolve any ticket.

## Out of Scope

- Multi-step approval chains (requiring multiple approvers)
- Approval delegation
- Email notification fallback
- Mobile push notifications
- Approval templates or reusable payloads
- Configurable expiration times per ticket or per policy
