# Research: Analytics & Cost Tracking

## Decision 1: Aggregation Strategy

**Decision**: Use Prisma `groupBy` and `aggregate` for all analytics queries.

**Rationale**: The spec explicitly prohibits loading all rows into memory. Prisma's `groupBy` translates to SQL `GROUP BY` which pushes aggregation to PostgreSQL, leveraging its query optimizer and indexes. This keeps response times under 500ms even with large datasets.

**Alternatives considered**:
- Raw SQL via `$queryRaw`: More flexible but violates Constitution Principle II (Prisma-exclusive data access). Rejected.
- Materialized views: Would give best read performance, but adds operational complexity (refresh scheduling) and is premature optimization. Can be added later if performance degrades.
- Application-level aggregation: Violates the spec requirement for set-based queries. Rejected.

## Decision 2: Timeline Zero-Fill Strategy

**Decision**: Generate the date range array in application code, then left-join with Prisma `groupBy` results to fill zeros.

**Rationale**: PostgreSQL's `generate_series` would require raw SQL. Instead, generate dates in TypeScript (trivial for 7/30/90 day ranges), query grouped results with Prisma, and merge — filling missing dates with 0. This keeps all DB access through Prisma while delivering the spec's zero-fill requirement.

**Alternatives considered**:
- PostgreSQL `generate_series` + raw SQL: Cleaner SQL but violates Prisma-only constraint. Rejected.
- Frontend zero-fill: Pushes logic to the client. Rejected per spec ("pre-aggregated from API").

## Decision 3: Health Score Calculation

**Decision**: Reuse the existing `calculateHealthScore(errorRate, approvalDenyRate, avgLatencyMs)` utility from `apps/api/src/utils/health-score.ts`.

**Rationale**: The function already implements the EPIC 2 algorithm. For the leaderboard, compute per-agent `errorRate` and `avgLatencyMs` from audit logs, and `approvalDenyRate` from approval tickets, then pass to the existing function.

**Alternatives considered**:
- Duplicate the logic inline: Violates DRY. Rejected.
- Create a new scoring algorithm: Out of scope — spec says "per Epic 2 algorithm". Rejected.

## Decision 4: Composite Index Addition

**Decision**: Add a Prisma migration for a composite index `@@index([agentId, createdAt])` on AuditLog.

**Rationale**: The existing schema has separate indexes on `agentId` and `createdAt` but no composite. Timeline queries filter by both `agentId` (optional) and `createdAt` (date range), so the composite index enables index-only scans for these queries. The index already exists for `agentId` alone and `createdAt` alone.

**Alternatives considered**:
- Skip the index: Queries would degrade on large tables. Rejected.
- Add only at query time with hints: PostgreSQL doesn't support query hints. N/A.

## Decision 5: Event Type Classification

**Decision**: Count audit log events by the `event` field. `llm_call` = LLM calls, `tool_call` = tool calls. Total runs = distinct `traceId` count.

**Rationale**: Existing audit log tests confirm `llm_call` and `tool_call` as the standard event types. The `traceId` field groups related events into a single agent "run" — a distinct count gives total runs.

**Alternatives considered**:
- Enumerate all event types: Only `llm_call` and `tool_call` are used in the codebase. Other events can be counted generically if they appear later. Current approach is sufficient.
