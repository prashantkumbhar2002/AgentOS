# Research: Repository Pattern Refactor

## Decision 1: Repository Granularity

**Decision**: One repository interface per data domain — `IAgentRepository`, `IAuditRepository`, `IApprovalRepository`, `IPolicyRepository`, `IAnalyticsRepository`. Five total.
**Rationale**: Maps 1:1 to the existing service modules. Each repository encapsulates all data access for its domain, including joins and aggregations. The analytics repository is separate because its query patterns (groupBy, aggregate) differ fundamentally from CRUD.
**Alternatives considered**:
- Generic repository (`IRepository<T>`) — rejected because domains have wildly different query shapes (agents need stats aggregation, analytics needs groupBy, approvals need bulk expiration). A generic interface would be too abstract to be useful.
- One mega-repository — rejected because it violates single responsibility and creates a god object.

## Decision 2: Service Class Pattern

**Decision**: Convert each service from exported functions to a class with constructor-injected dependencies. Services are instantiated once in the composition root.
**Rationale**: Constructor injection is the standard pattern for DI without a framework. Classes make the dependency graph explicit — you can see what each service needs by reading its constructor. Functions with a `prisma` first parameter are just classes with extra steps.
**Alternatives considered**:
- Keep functions, pass repos as parameters — works but is verbose (`listAgents(agentRepo, auditRepo, query)`) and doesn't centralize dependency wiring.
- DI framework (tsyringe, inversify) — explicitly out of scope per spec. Manual injection is simpler and sufficient for 5 services.

## Decision 3: DTO Strategy

**Decision**: Define explicit TypeScript interfaces in `apps/api/src/types/dto.ts` for all service return types. Services return DTOs, never Prisma model types. DTOs are thin — they mirror the current response shapes.
**Rationale**: The review identified `unknown` return types as issue #13. DTOs decouple service consumers (routes) from the ORM. Adding a field to a Prisma model won't accidentally expose it through the API.
**Alternatives considered**:
- Use Prisma-generated types directly — rejected because it couples route handlers to the ORM and was explicitly called out in the review.
- Zod schemas for DTOs — overkill for internal service-to-route communication. Zod is for external input validation at boundaries.

## Decision 4: Composition Root via Fastify Decorator

**Decision**: Create `container.ts` that exports a `createContainer(prisma: PrismaClient)` function. The Prisma plugin calls this after PrismaClient is ready and decorates the Fastify instance with `fastify.services`. Route handlers access services via `fastify.services.agentService`, etc.
**Rationale**: Fastify's decorator system is the idiomatic way to share instances across plugins and routes. It's already used for `fastify.prisma`, `fastify.jwt`, and `fastify.sse`. Using the same pattern keeps the codebase consistent.
**Alternatives considered**:
- Global singleton container — breaks testability and Fastify's encapsulation model.
- Pass services through route options — verbose and doesn't leverage Fastify's built-in DI.

## Decision 5: Mock Repository Implementation

**Decision**: Each mock repository uses a `Map<string, Entity>` for storage. Mocks support create, read, update, delete, and filtered queries. They do NOT simulate database-specific behaviors (unique constraints, cascading deletes, transactions, SQL-level sorting).
**Rationale**: Mocks test business logic, not data access. Testing that "a policy with assigned agents cannot be deleted" requires a mock that returns an agent count — it doesn't need to enforce unique constraints at the mock level. Database behaviors are covered by existing Supertest integration tests.
**Alternatives considered**:
- In-memory SQLite via Prisma — rejected because it adds a real database dependency back into unit tests, defeating the purpose.
- Full Prisma mock (jest-mock-extended) — rejected because it tests mock configuration, not business logic.

## Decision 6: Analytics Repository Scope

**Decision**: The analytics repository encapsulates all aggregation queries (groupBy, aggregate, date-range queries). The analytics service handles date range validation, zero-filling, response shaping, and health score calculation.
**Rationale**: Aggregation queries are data access concerns — they're tightly coupled to how data is stored and indexed. Business logic is the interpretation layer: "what date range is valid", "fill missing days with zeroes", "calculate health score from raw metrics".
**Alternatives considered**:
- Keep aggregation in the service — rejected because it couples business logic to Prisma's groupBy API, making it untestable with simple mocks.
- Pre-compute analytics in materialized views — out of scope (would require schema changes).

## Decision 7: Policy Evaluator Integration

**Decision**: Refactor `evaluatePolicy` to accept `IPolicyRepository` instead of `PrismaClient`. The evaluator becomes a method on `PolicyService` or stays as a standalone function that accepts a repository. The pure matching logic (`ruleMatches`, `checkConditions`) remains unchanged.
**Rationale**: The evaluator currently queries Prisma directly for agent-specific and global policies. Moving those queries to the repository makes the evaluation logic unit-testable with mock policies — critical since policy evaluation is the most safety-sensitive code path.
**Alternatives considered**:
- Leave evaluator as-is (it's "already a pure function") — incorrect. It takes `PrismaClient` and runs queries. The matching logic is pure, but the data loading is not.
