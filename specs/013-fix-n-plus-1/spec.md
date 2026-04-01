# Feature Specification: Fix N+1 Query Performance

**Feature Branch**: `feat/enhancements/v1`
**Created**: 2026-03-21
**Status**: Draft
**Input**: FIX-04 — Replace N+1 query patterns with batched queries in agent listing and analytics

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent List Loads Efficiently at Scale (Priority: P1)

When an operator views the agent list in the dashboard, the system currently executes one database query per agent to compute 7-day cost aggregates. With 50 agents, this means 50+ queries fire sequentially — causing noticeable page load delays and unnecessary database load. After this fix, the agent list retrieves all cost data in a single batched query regardless of agent count, making the page load time independent of the number of agents.

**Why this priority**: The agent list is the most frequently accessed page in the dashboard. Every user hits it on every session. N+1 queries here have the broadest impact on user experience and database load.

**Independent Test**: Load the agent list page with 50+ agents and verify the system executes a constant number of database queries (not proportional to agent count).

**Acceptance Scenarios**:

1. **Given** 50 agents in the system, **When** the agent list endpoint is called, **Then** the number of database queries for cost aggregation is constant (not 50)
2. **Given** 50 agents in the system, **When** the agent list is loaded, **Then** each agent still displays its correct 7-day cost figure
3. **Given** 0 agents in the system, **When** the agent list is loaded, **Then** the response is an empty list with no errors
4. **Given** agents with no audit logs, **When** the agent list is loaded, **Then** their cost figures show as zero (not null or undefined)

---

### User Story 2 - Agent Statistics Compute Efficiently (Priority: P1)

When viewing an individual agent's detail page, the system currently fires multiple separate queries to compute statistics (total events, cost totals, error counts, top tools). After this fix, statistics are computed using the minimum number of queries by combining aggregations into batched calls.

**Why this priority**: Agent detail pages are accessed frequently by operators investigating agent behavior. Redundant queries increase latency on a page where fast feedback matters for incident response.

**Independent Test**: Request agent statistics for a single agent and verify the system executes a constant small number of queries (2 instead of 5+).

**Acceptance Scenarios**:

1. **Given** an agent with audit logs, **When** its statistics are requested, **Then** the total events, costs, error counts, and top tools are all correct
2. **Given** an agent with no audit logs, **When** its statistics are requested, **Then** all metrics return zero/empty values without errors
3. **Given** agent statistics are requested, **When** comparing before and after the fix, **Then** the response data is identical (no behavioral change)

---

### User Story 3 - Agent Leaderboard Computes Efficiently (Priority: P2)

The analytics leaderboard ranks agents by cost, error rate, and other metrics. The current implementation queries each agent's statistics individually, creating another N+1 pattern. After this fix, the leaderboard computes all agent metrics in batched queries, making response time independent of agent count.

**Why this priority**: The leaderboard is used by operators and managers for reporting but less frequently than the agent list. Still important for demo scenarios with 50+ agents.

**Independent Test**: Request the agent leaderboard with 50+ agents and verify the number of database queries is constant.

**Acceptance Scenarios**:

1. **Given** 50 agents with varying activity, **When** the leaderboard is requested, **Then** agents are correctly ranked by the requested metric (cost, error rate, etc.)
2. **Given** the leaderboard is requested, **When** comparing output before and after the fix, **Then** the rankings and values are identical
3. **Given** the leaderboard query, **When** database query count is measured, **Then** it is constant regardless of agent count

---

### Edge Cases

- What happens when the agent list contains agents with zero audit activity? Cost and statistics must gracefully default to zero without null propagation.
- What happens when groupBy returns results for only some agents (sparse data)? Agents missing from the grouped results must still appear with zero values.
- What happens when an agent is created between the main query and the aggregation query? The agent should appear with zero metrics (eventual consistency is acceptable).
- What happens when the database contains millions of audit logs? Batched queries with proper WHERE clauses and indexes should still perform well.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The agent listing operation MUST retrieve cost aggregations for all agents in a constant number of database operations (not proportional to agent count)
- **FR-002**: The agent statistics operation MUST compute all metrics (total events, costs, error counts, top tools) in no more than 2 database operations
- **FR-003**: The agent leaderboard operation MUST compute all agent rankings in a constant number of database operations
- **FR-004**: All batched queries MUST produce results identical to the current per-agent query results (zero behavioral change)
- **FR-005**: Agents with no matching data in aggregation results MUST display zero/empty values (not null or missing)
- **FR-006**: The fix MUST NOT change any external API response shape or field names
- **FR-007**: Unit tests MUST verify that the underlying data access method is called once per operation (not N times)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agent list page with 50 agents loads in under 500ms (previously proportional to agent count)
- **SC-002**: Number of database queries for listing 50 agents is reduced from 50+ to a constant (e.g., 3-5 total)
- **SC-003**: Number of database queries for agent statistics is reduced from 5+ to 2
- **SC-004**: Agent leaderboard with 50 agents executes in a constant number of queries (not 50+)
- **SC-005**: 100% of existing tests continue to pass with identical output
- **SC-006**: New unit tests verify single-call patterns for each optimized method

## Assumptions

- The ORM supports groupBy and aggregate operations that can batch multiple agent IDs in a single query
- Indexes exist on the relevant foreign key columns (agentId) in audit and approval tables
- The current N+1 patterns are in the service and repository layers, not in route handlers
- Response shape and data accuracy must be preserved exactly — this is a pure performance refactor

## Scope Boundaries

### In Scope
- Optimizing agent list cost aggregation queries
- Optimizing agent statistics computation queries
- Optimizing agent leaderboard computation queries
- Adding repository interface methods for batched operations if needed
- Unit tests verifying single-call patterns

### Out of Scope
- Database index optimization or schema changes
- Caching layer additions
- Pagination performance (already handled)
- Frontend rendering performance
- Other modules' query patterns (audit, approvals, policies)
