# Feature Specification: Authentication & User Management

**Feature Branch**: `002-jwt-auth-rbac`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "EPIC 1 — Authentication & User Management: JWT-based auth with RBAC for AgentOS platform"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — User Login (Priority: P1)

A platform user navigates to the login screen, enters their email address and
password, and receives an access token that grants them entry to the platform.
The system verifies the credentials and returns the user's identity along with
their assigned role. If the credentials are invalid — whether because the email
does not exist or the password is wrong — the system returns a single,
identical error so that an attacker cannot distinguish between the two cases.

**Why this priority**: Without authentication, no other feature in AgentOS is
usable. Login is the gateway to every downstream capability.

**Independent Test**: Can be fully tested by submitting valid and invalid
credentials and verifying that the correct token or error is returned.

**Acceptance Scenarios**:

1. **Given** a registered user with valid credentials, **When** they submit
   their email and password, **Then** the system returns an access token and
   the user's profile (id, name, email, role).
2. **Given** an email that does not exist in the system, **When** a login
   attempt is made, **Then** the system returns a 401 error with the message
   "Invalid credentials" (no user-enumeration hint).
3. **Given** a registered user with a wrong password, **When** they attempt to
   log in, **Then** the system returns the same 401 "Invalid credentials"
   error.
4. **Given** a single IP address, **When** more than 10 login attempts are
   made within 15 minutes, **Then** subsequent attempts are rejected with a
   429 status until the window resets.

---

### User Story 2 — Protected Resource Access & Identity (Priority: P2)

An authenticated user accesses any protected endpoint by presenting their
access token in the request header. The system validates the token on every
request. Additionally, the user can retrieve their own profile information
at any time to confirm their identity and role.

**Why this priority**: Token validation middleware is the prerequisite for
every protected route in the platform. The "me" endpoint enables the
frontend to bootstrap the user session.

**Independent Test**: Can be tested by making requests with valid, expired,
malformed, and missing tokens, and verifying correct acceptance or rejection.

**Acceptance Scenarios**:

1. **Given** a user with a valid access token, **When** they request their
   own profile, **Then** the system returns their id, name, email, and role.
2. **Given** an expired token, **When** a protected endpoint is accessed,
   **Then** the system returns 401 with "Token expired".
3. **Given** a malformed or tampered token, **When** a protected endpoint is
   accessed, **Then** the system returns 401 with "Invalid token".
4. **Given** no token is provided, **When** a protected endpoint is accessed,
   **Then** the system returns 401 with "Unauthorized".
5. **Given** the health-check endpoint, **When** accessed without a token,
   **Then** it responds successfully (not protected).

---

### User Story 3 — Role-Based Authorization (Priority: P3)

The platform enforces role-based access on every protected route. Each user
holds one of three roles — admin, approver, or viewer — and the system
restricts operations accordingly. Admins have full control; approvers can
resolve approval tickets and read all data; viewers can only read. A route
can require a single role or accept any of a set of roles.

**Why this priority**: RBAC is essential for governance integrity, but it
builds on top of working authentication (US1 + US2). Without role guards,
all authenticated users would have equal access.

**Independent Test**: Can be tested by accessing role-restricted endpoints
with tokens for each role and verifying acceptance or 403 rejection.

**Acceptance Scenarios**:

1. **Given** an admin user, **When** they access any endpoint, **Then** they
   are granted access.
2. **Given** an approver user, **When** they access a read-only endpoint or
   an approval-resolution endpoint, **Then** they are granted access.
3. **Given** an approver user, **When** they attempt an admin-only operation,
   **Then** the system returns 403 "Insufficient permissions".
4. **Given** a viewer user, **When** they attempt any write operation,
   **Then** the system returns 403 "Insufficient permissions".
5. **Given** a route that accepts multiple roles (e.g., admin or approver),
   **When** either role accesses it, **Then** they are granted access, and a
   viewer is rejected with 403.

---

### User Story 4 — Token Refresh (Priority: P4)

An authenticated user whose session is still valid can request a new access
token, resetting the expiry window without re-entering credentials. This
enables long-running sessions (e.g., an admin monitoring dashboards) without
forcing re-login every time the token approaches expiry.

**Why this priority**: Useful for UX continuity but not blocking — users
can always log in again. Lower priority than core auth and RBAC.

**Independent Test**: Can be tested by submitting a valid token to the
refresh endpoint and verifying a new token is returned with a reset expiry.

**Acceptance Scenarios**:

1. **Given** a user with a valid (non-expired) access token, **When** they
   request a token refresh, **Then** the system returns a new access token
   with a fresh 8-hour expiry window.
2. **Given** a user with an expired token, **When** they request a refresh,
   **Then** the system returns 401 "Token expired".

---

### User Story 5 — Development Seed Data (Priority: P5)

A developer or demo operator runs a seed script that populates the system
with a pre-defined set of users, sample AI agents, and sample policy rules.
The script is idempotent — running it multiple times does not create
duplicate records. This provides a ready-to-use environment for development
and live demonstrations.

**Why this priority**: Seed data is a developer experience enhancement that
accelerates onboarding but is not required for the auth system to function.

**Independent Test**: Can be tested by running the seed script once, verifying
records exist, running it again, and verifying no duplicates are created.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** the seed script runs, **Then** three
   users are created:
   - "Platform Admin" (admin role, admin@agentos.dev)
   - "Agent Approver" (approver role, approver@agentos.dev)
   - "Read Only Viewer" (viewer role, viewer@agentos.dev)
2. **Given** an empty database, **When** the seed script runs, **Then** two
   sample agents are created:
   - "Email Draft Agent" (high risk tier, production, sales team)
   - "Research Agent" (medium risk tier, production, product team)
3. **Given** an empty database, **When** the seed script runs, **Then** three
   sample policies are created:
   - "External Email Approval" — external email actions require approval
   - "Delete Protection" — delete actions denied for critical agents
   - "Low Risk Auto-Allow" — low-risk agent actions are auto-allowed
4. **Given** a database already containing seed data, **When** the seed
   script runs again, **Then** no duplicate records are created (upsert
   behavior).

---

### Edge Cases

- **User enumeration prevention**: Login failures for non-existent emails and
  wrong passwords MUST return the identical error message and status code.
- **Token edge cases**: Expired tokens return "Token expired"; malformed
  tokens return "Invalid token"; missing tokens return "Unauthorized" — three
  distinct messages for three distinct failure modes.
- **Role escalation**: No API endpoint allows a non-admin user to change
  their own role or another user's role to a higher privilege level.
- **Rate-limit boundary**: The 11th login attempt from the same IP within
  15 minutes MUST be rejected; the 10th MUST still be accepted.
- **Seed idempotency**: The seed script MUST use upsert-style operations so
  that re-running it never produces duplicate users, agents, or policies.
- **Password storage**: Passwords MUST be stored as irreversible hashes —
  never in plain text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users via email and password, returning
  an access token and user profile on success.
- **FR-002**: System MUST return identical 401 error responses for unknown
  email and incorrect password to prevent user enumeration.
- **FR-003**: System MUST rate-limit login attempts to 10 per IP per 15-minute
  window, returning 429 when exceeded.
- **FR-004**: System MUST validate the access token on every protected
  endpoint request and reject invalid, expired, or missing tokens with 401.
- **FR-005**: System MUST provide an endpoint that returns the authenticated
  user's profile (id, name, email, role).
- **FR-006**: System MUST enforce role-based access control with three roles:
  admin (full access), approver (resolve tickets + read all), viewer
  (read-only).
- **FR-007**: System MUST return 403 "Insufficient permissions" when an
  authenticated user accesses a resource above their role level.
- **FR-008**: System MUST support role guards that accept a single role or
  an array of permitted roles per endpoint.
- **FR-009**: System MUST provide a token refresh endpoint that issues a new
  token with a reset expiry for users with a valid (non-expired) token.
- **FR-010**: System MUST provide an idempotent seed script that populates
  three default users, two sample agents, and three sample policies.
- **FR-011**: Access tokens MUST expire after 8 hours.
- **FR-012**: Passwords MUST be stored as one-way hashes — never in plain
  text.
- **FR-013**: Health-check and authentication endpoints MUST be accessible
  without a token.

### Key Entities

- **User**: Represents a human operator of the platform. Key attributes:
  unique identifier, email address, hashed password, display name, role
  (admin | approver | viewer), and creation timestamp.
- **Agent** *(seeded only in this feature)*: Represents a managed AI agent.
  Key attributes: name, risk tier (LOW | MEDIUM | HIGH), environment
  (e.g., PROD), owner team, and status (ACTIVE | INACTIVE).
- **PolicyRule** *(seeded only in this feature)*: Represents a governance
  rule that determines whether an agent action is auto-allowed, requires
  approval, or is denied. Key attributes: name, description, action type,
  and decision outcome.

### Assumptions

- Authentication uses email/password only — OAuth, social login, SSO, and
  2FA are explicitly out of scope.
- Password reset and email verification flows are out of scope for this
  feature.
- Multi-tenancy and organizational hierarchy are not addressed.
- The Agent and PolicyRule models will be fully specified in their respective
  feature epics; this feature only seeds minimal sample data.
- Token refresh extends the session with a new token — there is no separate
  refresh-token mechanism (the access token itself is presented for refresh).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the login flow (enter credentials and
  receive confirmation of identity) in under 2 seconds.
- **SC-002**: 100% of protected endpoints reject requests with missing,
  expired, or malformed tokens and return the correct 401 status.
- **SC-003**: 100% of role-restricted endpoints correctly allow or deny
  access based on the user's role, returning 403 for insufficient
  permissions.
- **SC-004**: Login rate limiting activates after exactly 10 failed attempts
  per IP within a 15-minute window, with zero false positives for IPs under
  the threshold.
- **SC-005**: The seed script can be executed 5 consecutive times against
  the same database without creating any duplicate records.
- **SC-006**: No authentication error response reveals whether a given email
  address exists in the system (zero user-enumeration vectors).
- **SC-007**: Stored passwords cannot be reversed or read in plain text from
  the database by any user, including admins.

### Out of Scope

- OAuth / social login
- Password reset flows
- Email verification
- Multi-tenancy / organizations
- Two-factor authentication (2FA)
