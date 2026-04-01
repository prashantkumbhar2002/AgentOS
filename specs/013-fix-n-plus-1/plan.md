# Implementation Plan: FIX-04 — Fix N+1 Queries

**Branch**: `feat/enhancements/v1`
**Spec**: `specs/013-fix-n-plus-1/spec.md`
**Created**: 2026-03-21

## Technical Context

| Aspect | Detail |
|--------|--------|
| **ORM** | Prisma v5 (groupBy, aggregate supported) |
| **Architecture** | Repository pattern — services call interfaces, Prisma implementations underneath |
| **Primary N+1** | `PrismaAgentRepository.findMany()` — fires 1 aggregate per agent for 7-day cost |
| **Secondary N+1** | `PrismaAnalyticsRepository.getCostAggregates()` — fires 1 aggregate per date range in a for loop |
| **Already Optimized** | `getAgentMetrics()` already uses batched groupBy + Promise.all |
| **Already Optimized** | `computeAgentStats()` uses 2 queries per single agent — acceptable for single-agent view |

## N+1 Pattern Analysis

### 1. PrismaAgentRepository.findMany() — CRITICAL N+1

```
Current: Promise.all(agents.map(agent => prisma.auditLog.aggregate({ where: { agentId: agent.id } })))
Queries: N (one per agent)

Fix: prisma.auditLog.groupBy({ by: ['agentId'], where: { agentId: { in: agentIds } } })
Queries: 1
```

**Location**: `apps/api/src/repositories/prisma/PrismaAgentRepository.ts` lines 46-65

### 2. PrismaAnalyticsRepository.getCostAggregates() — MODERATE N+1

```
Current: for (const range of ranges) { await prisma.auditLog.aggregate(...) }
Queries: 5 (one per date range)

Fix: Promise.all(ranges.map(...)) — parallelize the 5 queries
Queries: Still 5 but parallel instead of sequential
Note: Can't easily batch different WHERE clauses into one groupBy, but parallel execution eliminates sequential wait.
```

**Location**: `apps/api/src/repositories/prisma/PrismaAnalyticsRepository.ts` lines 17-41

### 3. Analytics getAgentLeaderboard — ALREADY OPTIMIZED

`getAgentMetrics()` already uses a single `groupBy` + batched lookups with `Promise.all`. No fix needed.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | N/A | No new types or validation |
| II. Prisma-Exclusive | COMPLIANT | Uses Prisma groupBy/aggregate |
| III. Test-Driven | COMPLIANT | Unit tests verify call counts |
| IV. Security-First | N/A | No security changes |
| V. RBAC | N/A | No permission changes |
| VI. Async/Realtime | N/A | No queue or SSE changes |
| VII. Monorepo Conventions | COMPLIANT | Changes stay within existing files |
| VIII. Domain Precision | COMPLIANT | 6-decimal cost precision preserved |

## File Structure (modifications only)

```
apps/api/src/
├── repositories/prisma/
│   ├── PrismaAgentRepository.ts     # Fix N+1 in findMany()
│   └── PrismaAnalyticsRepository.ts # Parallelize getCostAggregates()
└── repositories/mock/
    └── MockAgentRepository.ts       # Update mock if interface changes
```
