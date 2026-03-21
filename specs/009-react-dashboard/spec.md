# Feature Specification: Frontend — React Dashboard

**Feature Branch**: `009-react-dashboard`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "EPIC 8 — Frontend React Dashboard"

## User Scenarios & Testing

### User Story 1 — Platform Login (Priority: P1)

An operator opens the AgentOS dashboard in a browser. They are presented with a login screen showing the AgentOS brand and a simple email/password form. After entering valid credentials, they are redirected to the main dashboard. If credentials are invalid, a clear error message appears without clearing the form. The session persists across browser tabs and survives page reloads.

**Why this priority**: Without authentication, no other page is accessible. This is the gateway to the entire platform.

**Independent Test**: Can be fully tested by navigating to the login page, entering credentials, and verifying the redirect to the dashboard. Delivers secure access to the platform.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they navigate to any protected page, **Then** they are redirected to the login screen
2. **Given** the login form, **When** the user submits valid credentials, **Then** they are redirected to the dashboard and their session is persisted
3. **Given** the login form, **When** the user submits invalid credentials, **Then** an inline error message is displayed and the form remains populated
4. **Given** an authenticated session, **When** the user reloads the page, **Then** they remain authenticated
5. **Given** an expired or revoked session, **When** any page makes an API call, **Then** the user is automatically redirected to login

---

### User Story 2 — Operations Dashboard Overview (Priority: P1)

An operator lands on the main dashboard after login. They see a high-level summary of the platform: total and active agent counts, pending approval count (with visual urgency indicator when approvals are waiting), and today's total cost. Below, a sortable agent health table shows all agents with their status, risk tier, owner, recent cost, and health score. Alongside the table, a live activity feed streams real-time events from the platform, color-coded by event type, auto-scrolling as new events arrive.

**Why this priority**: The dashboard is the primary landing page and provides the operator's first-glance situational awareness.

**Independent Test**: Can be tested by logging in and verifying that stat cards display correct data, the agent health table loads and sorts, and the live feed displays incoming events in real time.

**Acceptance Scenarios**:

1. **Given** a logged-in operator, **When** the dashboard loads, **Then** four stat cards display Total Agents, Active Agents, Pending Approvals, and Today's Cost
2. **Given** pending approvals exist, **When** the dashboard renders, **Then** the Pending Approvals card shows a pulsing indicator
3. **Given** agents are registered, **When** the health table loads, **Then** it shows agent name, status, risk tier, owner, last active time, 7-day cost, and health score — each column sortable
4. **Given** the live feed is connected, **When** an agent performs an action, **Then** the event appears in the feed within seconds, color-coded by type
5. **Given** the agent health table, **When** an operator clicks an agent row, **Then** they navigate to that agent's detail page

---

### User Story 3 — Agent Registry and Registration (Priority: P2)

An operator navigates to the Agent Registry page to browse, search, and filter all registered agents. They can filter by status, risk tier, environment, owner team, or free text. To register a new agent, they click a button that opens a guided multi-step form: first entering basic information, then defining the agent's tools, and finally selecting the risk tier and tags. On submission, the agent appears in the registry.

**Why this priority**: Agent management is a core capability, but operators need the dashboard (P1) before managing individual agents.

**Independent Test**: Can be tested by loading the agents page, applying filters, and completing the registration form end to end.

**Acceptance Scenarios**:

1. **Given** the agent registry page, **When** it loads, **Then** all agents are displayed in a sortable, paginated table
2. **Given** the filter bar, **When** the operator selects status "ACTIVE" and risk tier "HIGH", **Then** only matching agents are shown
3. **Given** the registration modal, **When** the operator completes all three steps with valid data, **Then** the new agent appears in the registry table
4. **Given** step 2 of registration, **When** the operator adds and removes tool entries, **Then** the tool list updates dynamically
5. **Given** an incomplete registration form, **When** the operator tries to proceed, **Then** validation errors are shown on the relevant fields

---

### User Story 4 — Agent Detail View (Priority: P2)

An operator clicks on an agent from the registry or dashboard to view its full detail page. They see a header with the agent's identity (name, status, risk tier, owner, environment) and four summary statistics (total runs, total cost, average latency, health score). Tabbed content lets them explore the agent's tools and policies, trace-grouped audit history, approval ticket history, and (for admins) a settings panel to edit metadata or change status.

**Why this priority**: After seeing agents in the registry, operators need to drill into individual agent details.

**Independent Test**: Can be tested by navigating to a specific agent and verifying the header, stats, and each tab renders correct data.

**Acceptance Scenarios**:

1. **Given** an agent detail page, **When** it loads, **Then** the header shows the agent's name, status badge, risk tier badge, owner team, and environment
2. **Given** the agent has audit history, **When** the Audit Traces tab is selected, **Then** events are grouped by trace ID with expandable rows showing the full timeline
3. **Given** an admin user, **When** they open the Settings tab, **Then** they can edit agent metadata and change agent status
4. **Given** a non-admin user, **When** they view the detail page, **Then** the edit button and Settings tab are hidden

---

### User Story 5 — Approval Queue Management (Priority: P2)

An approver opens the Approval Queue page. Pending tickets appear in the left column, sorted by urgency (soonest expiry first). Each card shows the requesting agent, action type, risk score visualization, reasoning, and a collapsible payload preview. Tickets expiring within 5 minutes are highlighted with visual urgency. The approver clicks Approve or Deny, confirms via a dialog where they can add a comment, and the ticket moves to the resolved column. New approval requests appear in real time via the live event stream.

**Why this priority**: Approval workflow is a critical governance function, but depends on the auth and dashboard foundation.

**Independent Test**: Can be tested by loading the approvals page with pending tickets, approving/denying a ticket, and verifying it moves to the resolved column.

**Acceptance Scenarios**:

1. **Given** pending approval tickets, **When** the page loads, **Then** tickets appear in the left column sorted by expiry time (most urgent first)
2. **Given** a ticket expiring in less than 5 minutes, **When** it renders, **Then** it has a pulsing red border
3. **Given** an approval card, **When** the approver clicks Approve, **Then** a confirmation dialog appears with the full payload and a comment input field
4. **Given** confirmation is submitted, **When** the ticket is resolved, **Then** it disappears from the pending column and appears in the resolved table
5. **Given** a connected live feed, **When** another user creates an approval request, **Then** a new card appears in the pending column automatically

---

### User Story 6 — Audit Log Explorer (Priority: P3)

An operator navigates to the Audit Explorer to investigate agent activity. They filter by agent, event type, date range, or trace ID. The results table shows timestamp, agent, event type (with icon), model or tool used, token counts, cost, latency, and success status. Clicking a row opens a side drawer showing the complete trace timeline — all events in that trace displayed chronologically with total cost and latency. Admins and approvers can export filtered results as CSV.

**Why this priority**: Audit investigation is an important but secondary workflow — operators typically use the dashboard first and drill into audit when investigating specific issues.

**Independent Test**: Can be tested by loading the audit page, applying filters, clicking a row to open the trace drawer, and verifying CSV export.

**Acceptance Scenarios**:

1. **Given** the audit explorer, **When** it loads, **Then** the most recent audit events are shown in a paginated table
2. **Given** the filter bar, **When** the operator filters by agent and event type, **Then** only matching records appear
3. **Given** an audit row, **When** the operator clicks it, **Then** a drawer slides in from the right showing the full trace timeline
4. **Given** the trace drawer, **When** it opens, **Then** it shows trace ID, agent name, total cost, total latency, and a step-by-step timeline
5. **Given** an admin user, **When** they click Export CSV, **Then** a CSV file downloads containing the filtered audit data
6. **Given** a viewer user, **When** they view the audit page, **Then** the Export CSV button is not visible

---

### User Story 7 — Analytics Dashboard (Priority: P3)

A platform manager opens the Analytics page to review operational metrics. They select a time range (7, 30, or 90 days). They see cost summary cards with trend indicators showing change versus the prior period. A multi-line chart shows daily cost per agent over the selected period. Side-by-side charts visualize approval outcome distribution and model usage breakdown. An agent leaderboard table ranks agents by cost, run count, or error rate.

**Why this priority**: Analytics is a reporting layer built on top of all other features — valuable but not required for daily operations.

**Independent Test**: Can be tested by loading the analytics page, switching time ranges, and verifying that charts and leaderboard data update accordingly.

**Acceptance Scenarios**:

1. **Given** the analytics page, **When** it loads with default 7-day range, **Then** cost summary cards show today's cost, period total, and trend versus prior period
2. **Given** the time range selector, **When** the operator selects 30 days, **Then** all charts and metrics update to reflect the 30-day window
3. **Given** cost timeline data, **When** the chart renders, **Then** each agent's daily cost is plotted as a separate line
4. **Given** approval data, **When** the pie chart renders, **Then** it shows the breakdown of auto-approved, approved, denied, and expired outcomes
5. **Given** the agent leaderboard, **When** the operator sorts by error rate, **Then** agents reorder by descending error rate

---

### Edge Cases

- **Session expiry during use**: If the session expires while the operator is on any page, the next API call triggers automatic redirect to login without data loss in unsaved forms
- **SSE disconnection**: If the live event stream disconnects, the system reconnects automatically with increasing delays (2s, 4s, 8s, up to 30s) and shows a connection status indicator
- **Empty platform state**: A freshly deployed platform with no agents, no approvals, and no audit data shows friendly empty states with contextual guidance (e.g., "No agents registered yet — register your first agent to get started")
- **Large data volumes**: Tables with hundreds of rows paginate smoothly; charts with many agents remain readable; the live feed caps at 50 events to prevent memory issues
- **Concurrent approvals**: If two approvers attempt to resolve the same ticket, the second receives a clear notification that the ticket is already resolved
- **API errors**: All API failures show inline error messages with a retry button; destructive actions show confirmation dialogs before execution
- **Slow network**: Loading states with skeleton placeholders appear for all data-fetching operations; no blank or broken layouts during data load

## Requirements

### Functional Requirements

**Authentication & Session**

- **FR-001**: System MUST display a full-page login form with email and password fields and the AgentOS brand identity
- **FR-002**: System MUST authenticate users against the platform API and persist the session across page reloads and browser tabs
- **FR-003**: System MUST redirect unauthenticated users to the login page when they attempt to access any protected page
- **FR-004**: System MUST automatically end the session and redirect to login when the server returns an authentication error on any API call

**Dashboard**

- **FR-005**: Dashboard MUST display four summary stat cards: Total Agents, Active Agents, Pending Approvals (with pulsing indicator when count > 0), and Today's Cost in USD
- **FR-006**: Dashboard MUST display a sortable agent health table with columns: name, status badge, risk tier tag (color-coded), owner team, last active time, 7-day cost, and health score progress bar
- **FR-007**: Dashboard MUST display a live activity feed that receives real-time events, auto-scrolls, retains a maximum of 50 events, and color-codes events by type
- **FR-008**: Dashboard MUST navigate to the agent detail page when an operator clicks an agent row in the health table

**Agent Registry**

- **FR-009**: Agent registry MUST display all agents in a sortable, filterable table with columns: name, status, risk tier, owner team, tool count, last active, 7-day cost, health score
- **FR-010**: Agent registry MUST provide a filter bar with status dropdown, risk tier multi-select, environment dropdown, owner team text input, and free-text search
- **FR-011**: Agent registry MUST provide a multi-step registration form: Step 1 (basic info), Step 2 (tools list with add/remove), Step 3 (risk tier selection with descriptions, tags input)
- **FR-012**: Registration form MUST validate each step before allowing progression, display validation errors inline, and show a progress indicator

**Agent Detail**

- **FR-013**: Agent detail page MUST display a header with agent name, status badge, risk tier badge, owner team, and environment
- **FR-014**: Agent detail page MUST display four summary statistics: Total Runs, Total Cost, Average Latency, and Health Score (as a circular progress indicator)
- **FR-015**: Agent detail page MUST provide tabbed navigation: Overview (tools and policies), Audit Traces (grouped by trace ID, expandable), Approvals (ticket history), Policies (assigned policies), Settings (admin only — edit metadata and status)
- **FR-016**: Settings tab and edit controls MUST be visible only to users with the admin role

**Approval Queue**

- **FR-017**: Approval queue MUST display pending tickets in a left column sorted by expiry time (most urgent first), and resolved tickets in a right column as a table
- **FR-018**: Each pending approval card MUST show: agent name with badge, action type, risk score visualization (color-coded bar), reasoning text, collapsible payload preview, time remaining countdown, and Approve/Deny action buttons
- **FR-019**: Tickets expiring within 5 minutes MUST display a pulsing red border as a visual urgency indicator
- **FR-020**: Approve and Deny actions MUST open a confirmation dialog showing the full payload and a comment input field before executing
- **FR-021**: Approval queue MUST update in real time — new requests appear automatically, resolved tickets move from pending to resolved column

**Audit Explorer**

- **FR-022**: Audit explorer MUST display audit events in a filterable, paginated table with columns: timestamp, agent name, event type (with icon), model/tool, tokens, cost (USD), latency (ms), success status badge
- **FR-023**: Audit explorer MUST provide a filter bar with agent dropdown, event type multi-select, date range picker, and trace ID search input
- **FR-024**: Clicking an audit row MUST open a side drawer showing the complete trace: trace ID, agent, total cost, total latency, and a step-by-step event timeline with icons
- **FR-025**: Audit explorer MUST provide a CSV export button visible only to users with admin or approver roles

**Analytics**

- **FR-026**: Analytics page MUST provide a time range selector with 7-day, 30-day, and 90-day options that updates all displayed metrics
- **FR-027**: Analytics page MUST display cost summary cards showing today's cost, period total, and a trend indicator comparing to the prior equivalent period
- **FR-028**: Analytics page MUST display a multi-line cost timeline chart with one line per agent over the selected period
- **FR-029**: Analytics page MUST display two side-by-side charts: an approval outcome distribution chart and a model usage chart showing call counts and cost per model
- **FR-030**: Analytics page MUST display a sortable agent leaderboard table with columns for cost, runs, error rate, and other performance metrics

**Cross-Cutting**

- **FR-031**: All pages MUST display skeleton loading placeholders during data fetch operations
- **FR-032**: All pages MUST display inline error messages with a retry button when API calls fail
- **FR-033**: All pages MUST display contextual empty state messages when no data is available
- **FR-034**: All destructive actions (deny approval, suspend agent, delete agent) MUST require confirmation via a dialog before execution
- **FR-035**: All successful mutations (approve, deny, register, update) MUST display a brief success notification
- **FR-036**: All monetary values MUST be displayed in USD with a $ prefix and 4 decimal places for small amounts
- **FR-037**: All timestamps MUST display as relative time for recent events (e.g., "3 minutes ago") and absolute time for older events
- **FR-038**: The live event stream MUST reconnect automatically with exponential backoff (2s, 4s, 8s, capped at 30s) when the connection is lost

**Color System**

- **FR-039**: Agent status MUST be displayed using a consistent color scheme: Draft (slate), Approved (blue), Active (green), Suspended (amber), Deprecated (red)
- **FR-040**: Risk tier MUST be displayed using a consistent color scheme: Low (green), Medium (yellow), High (orange), Critical (red)
- **FR-041**: Event types MUST be displayed using a consistent color scheme: LLM call (blue), Tool call (violet), Approval requested (orange), Approval resolved (green), Action blocked (red)

### Key Entities

- **Operator Session**: Represents an authenticated user's browser session — user identity, authorization token, and authentication state persisted across page loads
- **Dashboard Summary**: An aggregated snapshot of platform health — agent counts, pending approval count, today's cost, and per-agent health metrics
- **Agent Registry Entry**: A browsable representation of a registered agent — identity, status, risk classification, tools, cost metrics, and health score
- **Approval Card**: A pending governance decision — requesting agent, action details, risk visualization, reasoning, countdown timer, and resolution controls
- **Audit Trace**: A grouped view of all events from a single agent execution — chronological timeline with cost and latency aggregates
- **Analytics View**: A configurable time-ranged report — cost summaries, cost trends per agent, approval outcomes, model usage, and agent rankings

## Success Criteria

### Measurable Outcomes

- **SC-001**: An operator can log in and reach the dashboard within 5 seconds of submitting valid credentials
- **SC-002**: The dashboard displays real-time events within 3 seconds of the event occurring on the platform
- **SC-003**: All 7 pages load and display data within 2 seconds on a standard broadband connection
- **SC-004**: An approver can review and resolve a pending approval ticket in under 30 seconds (view card → click approve/deny → confirm → done)
- **SC-005**: An operator can register a new agent through the 3-step form in under 2 minutes
- **SC-006**: An operator can filter and locate a specific audit event within 15 seconds using the filter bar
- **SC-007**: All data tables support sorting by any column, and the sort completes within 500 milliseconds
- **SC-008**: The live event stream recovers from a disconnection and resumes delivering events within 30 seconds
- **SC-009**: The platform displays appropriate loading, error, and empty states — no blank or broken layouts under any data condition

## Assumptions

- The backend API (EPICs 2–7) is fully operational and provides all required endpoints
- The platform is used exclusively on desktop browsers (Chrome, Firefox, Edge) at viewport widths of 1280px or wider
- Dark theme is the only supported theme — no light mode toggle
- The live event stream endpoint (SSE) is the only real-time mechanism — no polling fallback is needed
- All date/time values are displayed in the user's local timezone
- The maximum number of agents in a deployment is in the hundreds, not thousands — client-side sorting is acceptable
- The frontend shares type definitions with the backend via the shared types package
- Users are pre-created by administrators — no self-registration flow

## Out of Scope

- Mobile responsive layout (desktop-first only)
- Dark/light theme toggle (dark theme only)
- User management UI (create, edit, delete users)
- Policy rule builder UI with visual conditions editor
- Internationalization / localization
- Offline mode or service worker caching
- Browser notification integration
- Keyboard shortcut system
- Frontend unit/component testing (covered in a future EPIC)
