# Feature Specification: Showcase Agents & Mock Data

**Feature Branch**: `008-showcase-agents`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "EPIC 7 — Showcase Agents & Mock Data"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Email Draft Agent for Live Demo (Priority: P1)

As a platform admin, I want to trigger an AI-powered email drafting agent that runs through the full governance loop (LLM call, approval request, tool execution) so I can demonstrate the platform's governance capabilities to stakeholders in a live setting.

**Why this priority**: The email agent is the flagship demo — it shows the complete governance loop (LLM generation, human-in-the-loop approval, tool execution) in a single, easy-to-understand flow.

**Independent Test**: Can be fully tested by triggering the email agent with a task description and verifying that an LLM-generated email is produced, an approval ticket is created, and the final action is gated by the approval outcome.

**Acceptance Scenarios**:

1. **Given** a valid task description, **When** the admin triggers the email agent, **Then** the system generates an email draft using an LLM, creates an approval ticket for the send action, and returns the trace ID and draft content.
2. **Given** an approval ticket is approved, **When** the email agent receives the approval, **Then** it simulates sending the email and logs the action as completed.
3. **Given** an approval ticket is denied, **When** the email agent receives the denial, **Then** it logs the blocked action and stops without sending.
4. **Given** the LLM service API key is not configured, **When** the admin triggers the email agent, **Then** the system returns an error indicating the key is missing.

---

### User Story 2 - Run Research Agent for Live Demo (Priority: P1)

As a platform admin, I want to trigger an AI-powered research agent that performs web searches, synthesizes findings into a report, and requests approval before saving so I can demonstrate multi-step agent workflows with governance checkpoints.

**Why this priority**: The research agent demonstrates a multi-step workflow (search, fetch, synthesize, approve) that showcases governance over complex, multi-tool agent behavior.

**Independent Test**: Can be fully tested by triggering the research agent with a topic and verifying that web searches are executed, a structured report is generated, and an approval ticket is created for the save action.

**Acceptance Scenarios**:

1. **Given** a topic string, **When** the admin triggers the research agent, **Then** the system performs web searches, synthesizes findings into a structured report, and creates an approval ticket for the save action.
2. **Given** the save action is approved, **When** the research agent receives approval, **Then** it simulates saving the report and returns it with a success status.
3. **Given** the save action is denied, **When** the research agent receives the denial, **Then** it still returns the report content but indicates it was not saved.
4. **Given** a web search fails, **When** the research agent encounters the failure, **Then** it logs the failed tool call and continues with available data.

---

### User Story 3 - Seed Mock Data for Dashboards (Priority: P1)

As a platform admin, I want to seed the platform with realistic mock agent activity (audit logs, approval tickets, and registered agents) so that dashboards and analytics display meaningful data for demos and UI development.

**Why this priority**: Without mock data, analytics dashboards and approval queues are empty — making demos and frontend development impractical.

**Independent Test**: Can be fully tested by triggering the mock seed endpoint and verifying that mock agents are registered, audit log entries are created with realistic distributions, and approval tickets exist in various statuses.

**Acceptance Scenarios**:

1. **Given** the platform has no mock data, **When** an admin triggers the mock data seeder, **Then** 3 mock agents are created, 50 audit log entries are generated across multiple trace IDs, and 5 approval tickets are created in mixed statuses.
2. **Given** mock data already exists, **When** the admin triggers the seeder again, **Then** the system does not duplicate agents or data, and returns counts of existing resources.
3. **Given** the seeder creates audit logs, **When** the admin views analytics dashboards, **Then** the mock data produces meaningful charts and statistics (costs, timelines, usage breakdowns).
4. **Given** the seeder creates approval tickets, **When** the admin views the approval queue, **Then** pending tickets appear and can be resolved through the normal approval workflow.

---

### User Story 4 - Register Showcase Agents in Platform (Priority: P2)

As a platform admin, I want all showcase and mock agents to be registered in the platform's agent registry so they appear in agent listings, analytics, and governance dashboards alongside any real agents.

**Why this priority**: Agents must be registered before they can be triggered or appear in dashboards. This is a prerequisite for stories 1-3 but is a behind-the-scenes setup step.

**Independent Test**: Can be tested by checking that all 5 agents (2 showcase + 3 mock) appear in the agent list with correct metadata after seeding.

**Acceptance Scenarios**:

1. **Given** the system is freshly deployed, **When** the database is seeded, **Then** all showcase and mock agents are registered with correct names, risk tiers, tools, and team assignments.
2. **Given** agents are already registered, **When** seeding runs again, **Then** existing agents are not duplicated.

---

### Edge Cases

- **LLM service unavailable**: If the external LLM API key is not configured, showcase agent endpoints return an informative error rather than failing silently.
- **No approvers available**: The email agent creates an approval ticket and the agent's workflow pauses; the ticket remains pending until someone acts or it expires (up to 30 minutes).
- **Web search failure**: The research agent logs the failed tool call and continues synthesizing a report from available data rather than aborting entirely.
- **Idempotent seeding**: Running the mock seed multiple times does not create duplicate agents or data — the system checks for existing resources before creating.
- **Mock agents are pure simulation**: Mock agents do not make real LLM calls; they generate synthetic audit log and approval data only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an email drafting showcase agent that uses an LLM to generate a professional email from a task description.
- **FR-002**: The email agent MUST request human approval before executing the send action, creating a governance-tracked approval ticket with the draft content.
- **FR-003**: The email agent MUST log the outcome (approved and sent, or denied and blocked) through the governance audit trail.
- **FR-004**: System MUST provide a research showcase agent that uses web search capabilities to gather information on a given topic.
- **FR-005**: The research agent MUST synthesize search results into a structured report using an LLM.
- **FR-006**: The research agent MUST request human approval before saving the report, creating an approval ticket.
- **FR-007**: The research agent MUST gracefully handle web search failures by logging the error and continuing with partial data.
- **FR-008**: System MUST provide a mock data seeder that creates 3 mock agents, 50 audit log entries, and 5 approval tickets with realistic data distributions.
- **FR-009**: The mock data seeder MUST distribute audit log entries across the last 7 days with realistic timestamps, cost values, and token counts.
- **FR-010**: The mock data seeder MUST create approval tickets in mixed statuses: 2 approved, 1 denied, and 2 pending.
- **FR-011**: The mock data seeder MUST be idempotent — running it multiple times must not create duplicate agents or data.
- **FR-012**: All showcase agent trigger endpoints MUST require authentication.
- **FR-013**: The mock data seed endpoint MUST require admin-level authorization.
- **FR-014**: Both showcase agents MUST return an informative error when the external LLM API key is not configured.
- **FR-015**: All showcase and mock agents MUST be registered in the platform's agent registry with appropriate metadata (name, risk tier, tools, team).
- **FR-016**: Both showcase agents MUST route all actions through the governance client so every LLM call, tool call, and approval is audited.
- **FR-017**: The email agent MUST assign a risk score of 0.82 (HIGH) to the send action, reflecting the sensitivity of external communication.
- **FR-018**: The research agent MUST assign a risk score of 0.35 (LOW-MEDIUM) to the save action, reflecting lower sensitivity of internal report storage.

### Key Entities

- **Email Draft Agent**: A showcase agent that drafts professional emails and requests approval to send. Registered with HIGH risk tier and tools for email operations. Owned by the platform demo team.
- **Research Agent**: A showcase agent that performs web searches, synthesizes reports, and requests approval to save. Registered with MEDIUM risk tier and tools for search and report operations. Owned by the platform demo team.
- **Mock CRM Agent**: A simulated agent registered with MEDIUM risk tier and CRM-related tools. Used for generating realistic dashboard data.
- **Mock Analytics Agent**: A simulated agent registered with LOW risk tier and analytics-related tools. Used for generating realistic dashboard data.
- **Mock Compliance Agent**: A simulated agent registered with CRITICAL risk tier and compliance-related tools. Used for generating realistic dashboard data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The email draft agent completes its full governance loop (draft, approve/deny, execute/block) within 60 seconds of being triggered.
- **SC-002**: The research agent produces a structured report from a topic query, executing at least 2 web searches and 1 synthesis step, within 90 seconds.
- **SC-003**: The mock data seeder populates dashboards with at least 50 audit log entries, 5 approval tickets, and 3 registered agents in a single invocation.
- **SC-004**: All 5 agents (2 showcase + 3 mock) appear in the platform's agent registry with correct metadata after seeding.
- **SC-005**: Analytics dashboards display meaningful data (cost summaries, timelines, usage statistics) after running the mock seeder.
- **SC-006**: The mock seeder can be run multiple times without creating duplicate data — subsequent runs complete without errors.
- **SC-007**: Showcase agents correctly gate their actions on human approval — approved actions execute, denied actions are blocked and logged.

## Assumptions

- The governance client SDK is available and functional, providing methods for LLM calls, tool calls, approval requests, and audit logging.
- An external LLM API key is required for the two showcase agents (email and research) but not for the mock data seeder.
- The approval workflow (EPIC 4) and policy engine (EPIC 5) are functional — approval tickets are created, evaluated, and resolved through existing infrastructure.
- Analytics endpoints (EPIC 6) are functional — mock data appears in cost summaries, timelines, and usage statistics.
- The database seed script already creates an admin user that can be used as the resolver for seeded approval tickets.
- Web search capabilities depend on the external LLM provider's tool support.

## Out of Scope

- Real email sending (no SendGrid, SES, or SMTP integration)
- Persistent report storage (no S3, Google Drive, or file system)
- Multi-step research with more than 2 search queries
- Real LLM calls for mock agents (mock agents generate synthetic data only)
- Scheduling or automated recurring runs of showcase agents
- Frontend UI for triggering showcase agents (API-only in this epic)
