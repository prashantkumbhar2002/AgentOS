# Feature Specification: Security Headers + Request Correlation + SSE Token Fix

**Feature Branch**: `feat/enhancements/v1`
**Created**: 2026-03-21
**Status**: Draft
**Input**: FIX-03 — Add security headers, replace SSE query-string JWT with short-lived tokens, add request correlation IDs

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Security Headers Protect Against Common Web Attacks (Priority: P1)

The API currently responds without standard security headers, leaving it vulnerable to clickjacking, MIME-type sniffing, and cross-site scripting attacks. After this fix, every API response includes industry-standard security headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Content-Security-Policy) that protect both the API and any browser-based consumers from common attack vectors.

**Why this priority**: Security headers are a baseline defense mechanism required by most security audits and compliance standards. Their absence is a critical gap that can be exploited without any user interaction.

**Independent Test**: Send any request to any API endpoint and inspect the response headers. All required security headers must be present.

**Acceptance Scenarios**:

1. **Given** any API endpoint, **When** a request is made, **Then** the response includes `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and `Content-Security-Policy` headers
2. **Given** the API is serving responses to the frontend dashboard, **When** the Content-Security-Policy is applied, **Then** the frontend still loads and functions correctly (styles, scripts, images, and API connections all work)
3. **Given** the SSE streaming endpoint, **When** a client connects, **Then** the cross-origin embedding restrictions do not block the EventSource connection

---

### User Story 2 - SSE Authentication Uses Short-Lived Tokens Instead of Main JWT (Priority: P1)

The SSE endpoint currently accepts the main JWT in the query string (`?token=<jwt>`), which gets logged in server access logs, proxy logs, and browser history — exposing the full authentication token. After this fix, clients first request a short-lived SSE-specific token (valid for 30 seconds) via a protected endpoint, then use that disposable token to connect to the SSE stream. Even if the short-lived token is logged, it expires almost immediately and cannot be used for any other API operation.

**Why this priority**: The current SSE auth pattern is a security vulnerability — long-lived JWTs in query strings are a well-known anti-pattern that can lead to token theft through log files, referrer headers, and browser history.

**Independent Test**: Request an SSE token, wait 31 seconds, attempt to connect to the SSE stream with the expired token — connection must be rejected. Also verify the main JWT is no longer accepted on the SSE endpoint.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they request an SSE token, **Then** they receive a short-lived token that expires in 30 seconds
2. **Given** a valid SSE token, **When** the user connects to the SSE stream within 30 seconds, **Then** the connection is established and events flow normally
3. **Given** an expired SSE token (older than 30 seconds), **When** the user attempts to connect to the SSE stream, **Then** the connection is rejected with an authentication error
4. **Given** a main JWT (not an SSE token), **When** the user attempts to connect to the SSE stream, **Then** the connection is rejected — main JWTs are no longer accepted on this endpoint
5. **Given** a valid SSE token, **When** it is intercepted from logs, **Then** it cannot be used to access any other API endpoint (agents, approvals, policies, etc.)

---

### User Story 3 - Request Correlation IDs Enable End-to-End Tracing (Priority: P2)

When investigating production issues, operators currently have no reliable way to correlate a user's error report with the specific server-side log entries for that request. After this fix, every request is assigned a unique correlation ID that appears in all server-side log entries for that request AND in the response headers. Users reporting errors can share this ID, and operators can search logs by it to find the full request context.

**Why this priority**: Request tracing is essential for production debugging. While not a security vulnerability, it directly reduces mean time to diagnosis and is a prerequisite for effective incident response.

**Independent Test**: Send a request, capture the `x-request-id` from the response header, search server logs for that ID — the matching log entry must be found.

**Acceptance Scenarios**:

1. **Given** any API request, **When** the response is received, **Then** the response includes an `x-request-id` header with a unique identifier
2. **Given** a request with a client-provided `x-request-id` header, **When** the server processes the request, **Then** the server uses the client-provided ID (pass-through for distributed tracing) and returns it in the response
3. **Given** a request without a client-provided `x-request-id` header, **When** the server processes the request, **Then** the server generates a new unique ID
4. **Given** any server-side log entry for a request, **When** the log is inspected, **Then** it includes the request's correlation ID
5. **Given** any error response from the API, **When** the response body is inspected, **Then** the `requestId` field matches the `x-request-id` response header

---

### Edge Cases

- What happens when a client sends an SSE token to a non-SSE endpoint? The system must reject it — SSE tokens are scoped exclusively to the streaming endpoint.
- What happens when the SSE token signing secret is not configured? The system must refuse to issue SSE tokens and return an appropriate error, not fall back to insecure behavior.
- What happens when a client sends an extremely long or malformed `x-request-id` header? The server must sanitize or replace it with a generated ID rather than propagating potentially dangerous input.
- What happens when Content-Security-Policy blocks a legitimate frontend resource? The CSP directives must be configured to allow all resources the dashboard needs (inline styles for the CSS framework, data URIs for images, API connections to the backend).
- What happens when the SSE token endpoint is called without authentication? It must return 401 — only authenticated users can request SSE tokens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST include security headers on every HTTP response: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Strict-Transport-Security, Content-Security-Policy, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies
- **FR-002**: Content-Security-Policy directives MUST allow the frontend dashboard to function correctly, including inline styles (required by the CSS framework) and data URIs for images
- **FR-003**: Cross-origin embedding restrictions MUST NOT block SSE (EventSource) connections from the frontend
- **FR-004**: System MUST provide a protected endpoint that issues short-lived SSE-specific tokens valid for 30 seconds
- **FR-005**: SSE-specific tokens MUST contain only the minimum claims needed for SSE authorization (user identity and role) — no full session data
- **FR-006**: SSE-specific tokens MUST be signed with a separate secret from the main authentication tokens
- **FR-007**: The SSE streaming endpoint MUST accept only SSE-specific tokens — main authentication tokens MUST be rejected
- **FR-008**: SSE-specific tokens MUST NOT be accepted by any endpoint other than the SSE streaming endpoint
- **FR-009**: System MUST assign a unique correlation ID to every incoming request
- **FR-010**: If a client provides a correlation ID in the request headers, the system MUST use that ID (pass-through for distributed tracing)
- **FR-011**: The correlation ID MUST appear in every server-side log entry for that request
- **FR-012**: The correlation ID MUST be included in every HTTP response header
- **FR-013**: The correlation ID in error response bodies MUST match the correlation ID in the response header
- **FR-014**: Client-provided correlation IDs MUST be validated for length and format to prevent injection of malicious values

### Key Entities

- **SSE Token**: A short-lived, scoped authentication credential used exclusively for SSE stream connections. Contains user identity and role. Expires in 30 seconds. Signed with a dedicated secret separate from the main auth secret.
- **Request Correlation ID**: A unique identifier assigned to each incoming request. Propagated through all log entries and included in both response headers and error response bodies for end-to-end traceability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of API responses include all 7 standard security headers
- **SC-002**: Zero instances of long-lived authentication tokens appearing in SSE query strings
- **SC-003**: SSE tokens expire and become unusable within 30 seconds of issuance
- **SC-004**: 100% of API responses include a correlation ID in the response headers
- **SC-005**: 100% of server log entries include the request's correlation ID
- **SC-006**: Frontend dashboard continues to function correctly with all security headers enabled (no resource loading failures)
- **SC-007**: SSE-specific tokens cannot be used to access any non-SSE endpoint

## Assumptions

- The existing SSE plugin and frontend `useSSE` hook will be updated to use the new token flow (request token first, then connect)
- The SSE token signing secret will be configured as a separate environment variable
- Client-provided request IDs will be truncated to a maximum of 64 characters to prevent log injection
- The frontend URL for CSP `connect-src` is available from the existing environment configuration

## Scope Boundaries

### In Scope
- Security headers plugin registration and configuration
- SSE token issuance endpoint
- SSE stream endpoint auth refactor to accept only SSE tokens
- Request correlation ID generation and propagation
- Response header injection for correlation IDs
- Frontend `useSSE` hook update for new token flow

### Out of Scope
- CSRF protection (not needed for JWT-authenticated REST APIs)
- Security monitoring or alerting infrastructure
- Rate limiting changes (already configured)
- Full Content-Security-Policy reporting endpoint
- Distributed tracing across microservices (only single-service correlation)
