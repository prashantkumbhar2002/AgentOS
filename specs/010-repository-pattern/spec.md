# Feature Specification: Repository Pattern Refactor

**Feature Branch**: `feat/enhancements/v1`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "FIX-01: Repository Pattern + Unit-Testable Business Logic"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Unit Tests Business Logic Without a Database (Priority: P1)

A developer working on the governance platform needs to write and run unit tests for business logic (agent lifecycle transitions, approval ticket creation rules, policy evaluation priority) without requiring a running database. Currently, every test requires a live PostgreSQL connection, making tests slow and flaky. After this refactor, the developer creates a service instance with in-memory mock repositories and tests pure business logic in milliseconds.

**Why this priority**: This is the core value of the refactor — decoupling business logic from data access. Without this, the entire effort has no purpose. A developer should be able to verify that an agent status transition from DRAFT to ACTIVE is blocked without ever connecting to a database.

**Independent Test**: Can be fully tested by instantiating a service with a mock repository, calling a business logic method, and asserting the result — all without any database, network, or external dependency.

**Acceptance Scenarios**:

1. **Given** a service class with a mock repository injected, **When** a developer calls a business logic method (e.g., validate status transition), **Then** the method returns the correct result without any database call.
2. **Given** a mock repository pre-loaded with test data, **When** a developer tests a service method that queries and transforms data, **Then** the service returns correctly typed results identical in shape to what the real system would return.
3. **Given** a service method that enforces a business rule (e.g., "cannot delete a policy assigned to agents"), **When** the rule is violated, **Then** the service throws a structured error — testable without a database.
4. **Given** any service in the system, **When** a developer inspects its constructor, **Then** it accepts only repository interfaces — never a database client directly.

---

### User Story 2 - Existing Platform Behavior Remains Unchanged (Priority: P1)

All existing platform functionality — agent registration, approval workflows, policy evaluation, audit logging, analytics — must continue to work identically after the refactor. No API response, status code, validation behavior, or data flow changes. This is a purely internal structural improvement that is invisible to end users and API consumers.

**Why this priority**: Equal to Story 1 because a refactor that breaks existing functionality is worse than no refactor. Zero regressions is a hard requirement.

**Independent Test**: Can be fully tested by running the complete existing integration test suite and verifying 100% of tests pass with no modifications to test expectations.

**Acceptance Scenarios**:

1. **Given** the full set of existing integration tests, **When** run against the refactored codebase, **Then** all tests pass with identical assertions.
2. **Given** any API endpoint, **When** called with the same inputs as before the refactor, **Then** the response body, status code, and headers are identical.
3. **Given** the approval workflow (agent requests action → policy evaluation → ticket creation → human resolution), **When** executed end-to-end, **Then** the outcome is identical to the pre-refactor behavior.

---

### User Story 3 - Developer Adds a New Service Method with Confidence (Priority: P2)

When a developer needs to add new business logic (e.g., a new analytics query, a new agent capability), they follow a clear pattern: define the data access need in a repository interface, implement it in the repository layer, and write the business logic in the service layer. The service can be tested immediately with a mock repository before the real data access implementation is even complete.

**Why this priority**: This is the long-term productivity payoff. The pattern makes future development faster and safer, but it only delivers value after Stories 1 and 2 are complete.

**Independent Test**: Can be tested by adding a new method to a repository interface, implementing a mock, writing a service test, and verifying it passes — all before touching the real data layer.

**Acceptance Scenarios**:

1. **Given** a repository interface, **When** a developer adds a new method signature, **Then** the mock implementation can be updated and the corresponding service method tested immediately.
2. **Given** the established pattern (interface → implementation → service → test), **When** a new developer reads the codebase, **Then** they can identify where to add data access logic vs. business logic without ambiguity.

---

### User Story 4 - System Returns Strongly Typed Results Everywhere (Priority: P2)

All service methods return explicitly typed data transfer objects instead of opaque or untyped results. When a route handler calls a service method, the developer sees exactly what fields are available at compile time. No casting, no guessing, no runtime surprises.

**Why this priority**: Type safety downstream of services eliminates an entire class of runtime bugs and makes the codebase self-documenting. It depends on the repository abstraction being in place (Story 1).

**Independent Test**: Can be tested by verifying that every service method has an explicit return type annotation that is not `unknown`, `any`, or a raw database model type.

**Acceptance Scenarios**:

1. **Given** any service method, **When** a developer inspects its return type, **Then** it is a named, documented type — never `unknown` or `any`.
2. **Given** a route handler calling a service method, **When** the developer accesses properties on the result, **Then** the compiler provides full auto-complete and type checking.

---

### User Story 5 - Platform Wires Dependencies at Startup (Priority: P2)

When the platform starts, all repositories and services are instantiated and wired together in a single composition root. This ensures that the entire dependency graph is validated at boot time — if a dependency is missing or misconfigured, the platform fails fast with a clear error rather than crashing at runtime when a request hits the missing dependency.

**Why this priority**: Centralized wiring is the glue that makes the repository pattern work in practice. Without it, dependency injection is ad-hoc and error-prone.

**Independent Test**: Can be tested by calling the composition root function and verifying that all expected services are returned as a typed object.

**Acceptance Scenarios**:

1. **Given** the platform startup sequence, **When** the composition root is invoked, **Then** all services are instantiated with their required repositories.
2. **Given** a misconfigured or missing dependency, **When** the platform starts, **Then** it fails immediately with a descriptive error message.
3. **Given** any route handler, **When** it needs to call business logic, **Then** it accesses the service through the centralized container — never by constructing services ad-hoc.

---

### Edge Cases

- A service method calls multiple repository methods in sequence — the mock must maintain consistent state across calls within a single test.
- A repository method returns `null` (entity not found) — the service must handle this and return a structured not-found response, testable with mocks.
- Concurrent modifications to the same entity — the service layer's optimistic concurrency checks must work identically with both real and mock repositories.
- A service depends on multiple repositories (e.g., approval service needs both approval and agent repositories) — the composition root must inject all dependencies.
- Empty result sets from repositories — services must handle gracefully and return appropriate empty responses.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a repository abstraction for each data domain (agents, audit logs, approvals, policies) that defines all data access operations as a contract.
- **FR-002**: System MUST implement each repository contract with a concrete implementation that uses the current data access technology.
- **FR-003**: All service modules MUST depend only on repository contracts — never on a specific data access implementation.
- **FR-004**: System MUST provide a composition root that instantiates all repositories and services, wiring dependencies at platform startup.
- **FR-005**: All services MUST be available to route handlers through a centralized, decorated container on the platform instance.
- **FR-006**: System MUST provide in-memory mock implementations of each repository contract for use in unit testing.
- **FR-007**: Each service module MUST have at least 5 unit tests that use mock repositories and require no external dependencies (no database, no network).
- **FR-008**: All existing integration tests MUST continue to pass with zero modifications to test expectations or assertions.
- **FR-009**: All service methods MUST return explicitly named, typed data transfer objects — `unknown`, `any`, and raw database model types are forbidden as return types.
- **FR-010**: The agent service MUST enforce lifecycle state transitions (valid transition map) as pure business logic testable without a database.
- **FR-011**: The approval service MUST enforce ticket expiration rules, resolution authorization, and optimistic concurrency as pure business logic.
- **FR-012**: The policy service MUST enforce unique name constraints and deletion guards (cannot delete assigned policies) as pure business logic.
- **FR-013**: The audit service MUST enforce cost calculation and agent last-active timestamp updates as part of log ingestion.
- **FR-014**: The analytics module MUST access data through repository methods — aggregation queries are data access concerns, not business logic.
- **FR-015**: Mock repositories MUST maintain in-memory state so that sequential operations within a single test produce consistent results (e.g., create then findById returns the created entity).
- **FR-016**: The composition root MUST fail fast at startup if any required dependency cannot be instantiated.

### Key Entities

- **Repository Contract**: A typed interface defining all data access operations for a domain. Specifies method signatures with input types and return types. Contains no business logic.
- **Repository Implementation**: A concrete class that fulfills a repository contract using the actual data store. Contains query construction and data mapping, but no business rules.
- **Mock Repository**: An in-memory implementation of a repository contract that stores data in local collections. Used exclusively for unit testing services without external dependencies.
- **Service**: A class containing business logic for a domain. Receives repository contracts via constructor injection. Contains validation rules, state transitions, authorization checks, and data transformation — but no data access code.
- **Composition Root (Container)**: A single function that creates all repository implementations and service instances, wiring dependencies together. Invoked once at platform startup.
- **Data Transfer Object (DTO)**: A typed structure representing the shape of data returned by a service method. Decouples the service's output from the internal data model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every service module can be instantiated and tested with mock dependencies in under 50 milliseconds per test, with zero external dependencies required.
- **SC-002**: 100% of existing integration tests pass without any modification to test expectations or assertions after the refactor.
- **SC-003**: Each of the 5 service domains (agents, audit, approvals, policies, analytics) has at least 5 pure unit tests covering core business rules.
- **SC-004**: Zero service files import or reference the data access library directly — all data operations go through repository contracts.
- **SC-005**: Every public service method has an explicit, named return type — zero instances of `unknown` or `any` in service method signatures.
- **SC-006**: A new developer can identify where to add data access logic vs. business logic within 5 minutes of reading the codebase structure.
- **SC-007**: The platform boots successfully with all services wired through the composition root, failing fast with a clear message if any dependency is missing.

## Assumptions

- The refactor is purely internal — no API contract changes, no database schema changes, no migration needed.
- The existing integration tests (using Supertest against the real API) serve as the regression safety net. They test end-to-end behavior and are not modified.
- New unit tests (using mock repositories) are additive — they test business logic in isolation and coexist with integration tests.
- The analytics module's aggregation queries are treated as data access (repository concern), with the service layer handling date range validation, zero-filling, and response shaping.
- The policy evaluator (`evaluatePolicy`) is already a pure function and may remain as-is or be integrated into the service layer at the implementer's discretion.
- Mock repositories use simple in-memory collections (e.g., Map) and do not simulate database-specific behaviors like unique constraints, cascading deletes, or transactions.

## Out of Scope

- Database schema changes or migrations
- API response format changes
- Adding new endpoints or features
- Dependency injection frameworks or libraries (use manual constructor injection)
- Repository caching layer
- Transaction management abstraction
- Changing the existing integration test approach (Supertest tests remain as-is)
