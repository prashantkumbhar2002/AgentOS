# Feature Specification: Custom Error Hierarchy + Global Error Handler

**Feature Branch**: `feat/enhancements/v1`
**Created**: 2026-03-21
**Status**: Draft
**Input**: FIX-02 — Replace ad-hoc error handling with typed error hierarchy and centralized error handler

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Error Responses for API Consumers (Priority: P1)

API consumers (frontend dashboard, GovernanceClient SDK, third-party integrations) receive inconsistent error response shapes today. Some errors return `{ error: "..." }`, others return `{ error: "...", details: [...] }`, and some include stack traces or raw messages. After this fix, every error response follows a uniform structure with a machine-readable error code, human-readable message, optional details, and a request ID for tracing.

**Why this priority**: API consumers cannot reliably parse error responses today. A consistent error contract is foundational for frontend error handling and debugging in production.

**Independent Test**: Send requests that trigger each error type (401, 403, 404, 400, 409, 500) and verify every response has the same shape: `{ error: <CODE>, message: <string>, requestId: <string> }`.

**Acceptance Scenarios**:

1. **Given** a request with an expired JWT, **When** the request reaches any protected endpoint, **Then** the response is `{ error: "TOKEN_EXPIRED", message: "Token expired", requestId: "<id>" }` with HTTP 401
2. **Given** a request for a non-existent agent ID, **When** GET /api/agents/:id is called, **Then** the response is `{ error: "NOT_FOUND", message: "Agent with id '<id>' not found", requestId: "<id>" }` with HTTP 404
3. **Given** any error response from the API, **When** the response body is inspected, **Then** it always contains `error` (string code), `message` (string), and `requestId` (string) fields

---

### User Story 2 - Developers Throw Typed Errors Instead of Crafting Responses (Priority: P1)

Backend developers currently hand-craft HTTP error responses in every route handler, leading to duplication, inconsistency, and missed edge cases. After this fix, developers simply throw a typed error (e.g., `throw new NotFoundError('Agent', id)`) and the global error handler automatically converts it to the correct HTTP response with the right status code.

**Why this priority**: Eliminates error-handling boilerplate from every route, reduces risk of inconsistent status codes, and makes route handlers focused purely on business logic.

**Independent Test**: Modify a single route to throw a typed error instead of crafting a reply, and verify the response matches the expected format without any route-level error formatting.

**Acceptance Scenarios**:

1. **Given** a route handler that throws a NotFoundError, **When** the request is processed, **Then** the global handler returns HTTP 404 with the structured error response
2. **Given** a route handler that throws a ValidationError with details, **When** the request is processed, **Then** the global handler returns HTTP 400 with the error details included
3. **Given** a route handler that throws an unrecognized error (not an AppError subclass), **When** the request is processed, **Then** the global handler returns HTTP 500 with a generic message (no internal details exposed in production)

---

### User Story 3 - Elimination of String-Based Error Detection (Priority: P2)

The authentication plugin currently uses `error.message.includes('expired')` to detect token expiry, which is fragile and prone to false positives. After this fix, all error detection uses typed error classes or well-known error codes, never string matching on error messages.

**Why this priority**: String matching on error messages breaks when upstream libraries change wording and makes error handling unreliable. Typed errors make the system robust against message changes.

**Independent Test**: Send a request with an expired token and verify the auth plugin correctly identifies it using error codes (not message text), returning the appropriate 401 response.

**Acceptance Scenarios**:

1. **Given** an expired JWT, **When** the auth plugin catches the JWT verification error, **Then** it identifies the error by its code (not by string matching on the message) and returns HTTP 401 with code `TOKEN_EXPIRED`
2. **Given** an invalid JWT, **When** the auth plugin catches the JWT verification error, **Then** it returns HTTP 401 with code `TOKEN_INVALID`
3. **Given** a request with no Authorization header, **When** the auth plugin runs, **Then** it returns HTTP 401 with code `TOKEN_MISSING`

---

### User Story 4 - Operational Observability via Error Logging (Priority: P2)

Operations teams need structured error logs for monitoring and alerting. Today, some errors are logged, others are silently swallowed with `.catch(() => {})`, and log levels are inconsistent. After this fix, client errors (4xx) are logged at warn level and server errors (5xx) at error level, with no errors silently swallowed.

**Why this priority**: Silent error swallowing masks bugs in production. Consistent log levels enable proper monitoring dashboards and alerting thresholds.

**Independent Test**: Trigger both 4xx and 5xx errors and verify the log output shows `warn` for client errors and `error` for server errors, with request context included.

**Acceptance Scenarios**:

1. **Given** a request that results in a 404 Not Found, **When** the error is handled, **Then** the error is logged at `warn` level with the error code and request path
2. **Given** a request that triggers an unexpected server error, **When** the error is handled, **Then** the full error (including stack trace) is logged at `error` level
3. **Given** a background operation that encounters an error, **When** the error occurs, **Then** it is propagated or logged rather than silently caught and ignored

---

### User Story 5 - Request Traceability via Request IDs (Priority: P3)

When a user reports an error, support teams need to trace the exact request that failed. After this fix, every error response includes a `requestId` that correlates to server-side logs, enabling end-to-end request tracing.

**Why this priority**: Reduces mean time to diagnosis for production issues. Users can share the requestId from the error response, and operators can search logs by that ID.

**Independent Test**: Send a request that triggers an error, capture the `requestId` from the response, and verify the same ID appears in the server-side error log entry.

**Acceptance Scenarios**:

1. **Given** any error response from the API, **When** the response body is inspected, **Then** it contains a `requestId` field
2. **Given** a requestId from an error response, **When** server logs are searched for that ID, **Then** the corresponding log entry is found with full error context

---

### Edge Cases

- What happens when an error occurs inside the error handler itself? The system must not enter an infinite loop; it should fall through to a bare-minimum 500 response.
- What happens when a route throws a non-Error object (e.g., `throw "string"` or `throw 42`)? The handler must treat it as an unknown 500 error.
- What happens when a Zod schema validation fails? The handler must return 400 with structured validation details.
- What happens when a downstream service (Slack, Anthropic) is unreachable? The handler must return 503 with the service name but no internal connection details.
- What happens when rate limiting kicks in? Existing Fastify rate-limit responses should pass through unchanged (429 Too Many Requests).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a base error class (`AppError`) with fields: `code` (string), `message` (string), `statusCode` (number), and optional `details` (key-value pairs)
- **FR-002**: System MUST provide typed error subclasses for each error category: not-found (404), validation (400), authentication (401), authorization (403), conflict (409), invalid-transition (400), policy-blocked (403), and external-service-error (503)
- **FR-003**: System MUST provide a single centralized error handler that intercepts all unhandled errors from route handlers and converts them to structured HTTP responses
- **FR-004**: Every error response MUST include three mandatory fields: `error` (machine-readable code), `message` (human-readable text), and `requestId` (unique request identifier)
- **FR-005**: The error handler MUST log client errors (4xx) at warn level and server errors (5xx) at error level
- **FR-006**: The error handler MUST never expose internal error details (stack traces, internal messages) in production environments
- **FR-007**: The authentication system MUST identify token errors using typed error codes, not string matching on error messages
- **FR-008**: All existing route handlers MUST be refactored to throw typed errors instead of manually constructing HTTP error responses
- **FR-009**: The system MUST NOT silently swallow errors — all `.catch(() => {})` patterns must be replaced with proper error handling or explicit logging
- **FR-010**: The error handler MUST pass through framework-level errors (rate limiting, content-type parsing) without interfering
- **FR-011**: The error handler MUST handle JWT-specific error codes from the auth framework and map them to the appropriate authentication error responses
- **FR-012**: Each error class MUST set the correct `name` property matching the class name for accurate stack trace identification
- **FR-013**: Error details (when present) MUST be included in the response body under a `details` field to aid debugging
- **FR-014**: The system MUST provide unit tests verifying each error class produces the correct status code, error code, and message format

### Key Entities

- **AppError**: Base error entity with code, message, statusCode, and optional details. All domain-specific errors inherit from this.
- **Error Response**: Standardized API response shape for all errors — contains error code, message, optional details, and requestId.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of API error responses follow the standardized shape (`error`, `message`, `requestId` fields present)
- **SC-002**: Zero instances of string-based error detection (`message.includes()`, `message.startsWith()`, etc.) remain in the codebase
- **SC-003**: Zero instances of silently swallowed errors (`.catch(() => {})` or empty catch blocks) remain in production code
- **SC-004**: All error types (8 subclasses) have passing unit tests verifying status code, error code, and message format
- **SC-005**: Client errors (4xx) produce warn-level logs and server errors (5xx) produce error-level logs with full context
- **SC-006**: Internal error details (stack traces, raw messages) are never exposed to end users in production mode
- **SC-007**: Mean time to diagnose a reported error is reduced by providing requestId correlation between user-facing errors and server logs

## Assumptions

- The existing Fastify `request.id` mechanism will be used to generate requestIds (no custom ID generation needed)
- Rate-limit responses from `@fastify/rate-limit` should pass through the error handler unchanged (they already produce proper 429 responses)
- The error hierarchy is designed for the backend API only — frontend error display is handled separately by the React dashboard
- Existing integration tests may need minor updates to accommodate the new response shape (e.g., checking for `error` code field instead of free-form `error` message)

## Scope Boundaries

### In Scope
- Base error class and 8 typed subclasses
- Global Fastify error handler plugin
- Refactoring all existing route handlers to throw typed errors
- Refactoring the auth plugin to use error codes instead of string matching
- Removing all silent error swallowing patterns
- Unit tests for error classes

### Out of Scope
- Frontend error handling or error display UI changes
- Error monitoring/alerting infrastructure (Sentry, DataDog, etc.)
- Request ID propagation to downstream services
- Custom error pages or error UX
- Retry logic for transient errors
