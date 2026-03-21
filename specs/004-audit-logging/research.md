# Research: Audit Logging & Observability

## Decision 1: Cost Calculation Approach

**Decision**: Static pricing table in source code with per-token pricing
at 6-decimal USD precision.

**Rationale**: Model pricing changes infrequently (quarterly). A
compile-time table is simpler than a database table or runtime config,
eliminates a network call, and is version-controlled. Unknown models
return 0 cost without error, ensuring forward compatibility.

**Alternatives considered**:
- Database-stored pricing (rejected: over-engineering for 5 models,
  adds migration overhead on price changes)
- Runtime env-var pricing (rejected: complex to manage multi-model
  pricing in environment variables)
- API call to provider for pricing (rejected: adds latency, network
  dependency, and provider API may not expose pricing)

## Decision 2: Non-Blocking lastActiveAt Update

**Decision**: Fire-and-forget Prisma `agent.update()` without awaiting.
Errors are caught and logged but do not fail the ingestion response.

**Rationale**: The spec requires POST /api/audit/log to respond in
under 50ms. Awaiting the agent update adds ~5-10ms. Since
lastActiveAt is informational (not transactional), eventual
consistency is acceptable.

**Alternatives considered**:
- BullMQ queue (rejected: infrastructure overhead for a single
  timestamp update; no retry/DLQ semantics needed for a non-critical
  field)
- Database trigger (rejected: violates Prisma-exclusive data access
  principle)
- Await the update (rejected: adds unnecessary latency to a
  high-throughput endpoint)

## Decision 3: CSV Export Strategy

**Decision**: In-memory generation with streaming response. Build CSV
rows from Prisma query results, stream each row as it's serialized.
Query bounded by filters (no unbounded exports).

**Rationale**: For the initial implementation, result sets are bounded
by the applied filters. Streaming row-by-row avoids loading the
entire result set into memory while keeping implementation simple.

**Alternatives considered**:
- Full in-memory buffer (rejected: memory pressure on large exports)
- BullMQ background job with download link (rejected: over-engineering
  for initial implementation; can be added later if export sizes grow)
- Database-level CSV export (rejected: violates Prisma-exclusive
  access principle)

## Decision 4: SDK Error Handling Strategy

**Decision**: All network calls in GovernanceClient are wrapped in
try/catch. On failure, the error is logged to console.warn and
swallowed. The wrapped operation's return value is always preserved.

**Rationale**: The SDK must never interrupt agent execution (FR-016).
A governance logging failure is non-critical — the agent's primary
work takes priority. The warning log provides observability into
SDK health without throwing.

**Alternatives considered**:
- Optional error callback (rejected: adds API complexity; users would
  need to handle errors that should be invisible)
- Retry with backoff (rejected: adds latency to the wrapped operation;
  may queue up retries during outages)
- Silent discard without logging (rejected: makes debugging impossible
  when the platform is down)

## Decision 5: Per-Agent Rate Limiting

**Decision**: Use @fastify/rate-limit with a custom `keyGenerator` that
extracts `agentId` from the request body (not the JWT subject). Rate
limit: 1000 req/min per agent.

**Rationale**: Rate limiting by agent prevents a single misbehaving
agent from overwhelming the audit system. Using body.agentId as the
key (rather than JWT user) correctly throttles at the agent level since
multiple agents may share the same API key.

**Alternatives considered**:
- Rate limit by JWT subject (rejected: doesn't distinguish between
  agents using the same key)
- Rate limit by IP (rejected: agents may share infrastructure IPs)
- No per-agent rate limit (rejected: a runaway agent could overwhelm
  the audit system)

## Decision 6: Governance SDK Package Bootstrap

**Decision**: Create `packages/governance-sdk` as a new Turborepo
workspace with its own `package.json`, `tsconfig.json`, and dependency
on `@anthropic-ai/sdk`. The SDK is a standalone npm package that can
be published independently.

**Rationale**: Constitution Principle VII mandates
`packages/governance-sdk` as a workspace. The SDK has a distinct
dependency (`@anthropic-ai/sdk`) not needed by other packages.

**Alternatives considered**:
- Embed SDK in packages/types (rejected: types should only contain
  schemas, not runtime SDK logic with external dependencies)
- Embed SDK in apps/api (rejected: SDK is consumed by external
  agents, not by the API itself)
