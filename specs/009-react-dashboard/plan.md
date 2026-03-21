# Implementation Plan: Frontend — React Dashboard

**Branch**: `002-jwt-auth-rbac` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-react-dashboard/spec.md`

## Summary

Build a production-grade React 18 dashboard for the AgentOS governance platform. 7 pages (Login, Dashboard, Agents, AgentDetail, Approvals, AuditExplorer, Analytics) plus a policies read-only view. Dark theme, dense ops-tool aesthetic (Datadog meets Linear). Real-time SSE-connected live feed. All data fetching via TanStack Query v5; client auth state via Zustand with localStorage persistence; Axios client with JWT interceptors.

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: React 18, Vite, TailwindCSS, shadcn/ui, TanStack Query v5, Zustand, Axios, React Router v6, Recharts, date-fns
**Storage**: Browser localStorage (auth token only)
**Testing**: Manual visual testing (automated component tests out of scope per spec)
**Target Platform**: Desktop browsers (Chrome, Firefox, Edge) — 1280px+ viewport
**Project Type**: Single-page application (monorepo workspace: `apps/web`)
**Performance Goals**: All pages < 2s load, SSE reconnect < 30s
**Constraints**: Dark theme only, desktop only, no offline mode, no i18n
**Backend Dependency**: All 30 API endpoints from EPICs 2–7 must be operational

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TypeScript Strict + Zod | PASS | Shared types from packages/types; strict mode in tsconfig |
| II. Prisma-Exclusive Data Access | N/A | Frontend — no direct DB access |
| III. Test-Driven Quality Gates | PASS | Manual visual testing; automated tests out of scope per spec |
| IV. Security-First | PASS | JWT in auth store; 401 interceptor clears session; no secrets in frontend |
| V. RBAC | PASS | Admin-only UI elements hidden based on user role from auth store |
| VI. Resilient Async + Realtime | PASS | SSE with exponential backoff reconnect; TanStack Query stale/retry |
| VII. Monorepo Conventions | PASS | apps/web workspace; PascalCase components; use[Entity] hooks |
| VIII. Domain Value Precision | PASS | USD with $ prefix + 4 decimal places; risk scores as floats |

All gates PASS.

## Project Structure

```text
apps/web/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json                    # shadcn/ui config
├── .env.example
└── src/
    ├── main.tsx                       # App entry point
    ├── App.tsx                        # Router + providers
    ├── index.css                      # Tailwind imports + dark theme
    ├── vite-env.d.ts                  # Vite type declarations
    ├── lib/
    │   ├── api.ts                     # Axios instance + interceptors
    │   ├── queryClient.ts            # TanStack Query client
    │   ├── utils.ts                  # cn() helper (shadcn)
    │   └── formatters.ts            # Money, date, duration formatters
    ├── store/
    │   └── useAuthStore.ts           # Zustand auth store
    ├── hooks/
    │   ├── useSSE.ts                 # SSE connection with reconnect
    │   ├── useAgents.ts              # Agent queries + mutations
    │   ├── useApprovals.ts           # Approval queries + mutations
    │   ├── useAuditLogs.ts           # Audit log queries
    │   ├── usePolicies.ts            # Policy queries
    │   └── useAnalytics.ts           # Analytics queries
    ├── components/
    │   ├── ui/                       # shadcn/ui primitives (auto-generated)
    │   ├── layout/
    │   │   ├── AppLayout.tsx         # Sidebar + TopBar + Outlet
    │   │   ├── Sidebar.tsx           # Navigation sidebar
    │   │   └── TopBar.tsx            # Top bar (user menu, connection status)
    │   ├── shared/
    │   │   ├── StatusBadge.tsx        # Agent status color badge
    │   │   ├── RiskBadge.tsx          # Risk tier color badge
    │   │   ├── EventBadge.tsx         # Event type color badge
    │   │   ├── StatCard.tsx           # Reusable stat card
    │   │   ├── EmptyState.tsx         # Generic empty state
    │   │   ├── ErrorState.tsx         # Generic error + retry
    │   │   ├── HealthBar.tsx          # Health score progress bar
    │   │   └── ConfirmDialog.tsx      # Reusable confirm dialog
    │   ├── dashboard/
    │   │   ├── DashboardStats.tsx     # 4 stat cards row
    │   │   ├── AgentHealthTable.tsx   # Sortable agent table
    │   │   └── LiveActivityFeed.tsx   # SSE-connected feed
    │   ├── agents/
    │   │   ├── AgentFilterBar.tsx     # Filter bar
    │   │   ├── AgentTable.tsx         # Agent registry table
    │   │   ├── RegisterAgentModal.tsx # 3-step form modal
    │   │   ├── AgentHeader.tsx        # Detail page header
    │   │   ├── AgentStats.tsx         # 4 mini stat cards
    │   │   ├── AgentOverviewTab.tsx   # Tools + policies
    │   │   ├── AgentTracesTab.tsx     # Grouped audit traces
    │   │   ├── AgentApprovalsTab.tsx  # Approval history
    │   │   ├── AgentPoliciesTab.tsx   # Assigned policies
    │   │   └── AgentSettingsTab.tsx   # Admin edit form
    │   ├── approvals/
    │   │   ├── ApprovalCard.tsx       # Pending ticket card
    │   │   ├── ApprovalDecisionDialog.tsx # Confirm approve/deny
    │   │   └── ResolvedTable.tsx      # Resolved tickets table
    │   ├── audit/
    │   │   ├── AuditFilterBar.tsx     # Filter bar
    │   │   ├── AuditTable.tsx         # Paginated audit table
    │   │   └── TraceDrawer.tsx        # Side drawer with trace timeline
    │   ├── analytics/
    │   │   ├── CostSummaryCards.tsx   # Cost summary + trend
    │   │   ├── CostTimelineChart.tsx  # Multi-line recharts chart
    │   │   ├── ApprovalPieChart.tsx   # Approval outcome pie
    │   │   ├── ModelUsageChart.tsx    # Model usage bar chart
    │   │   └── LeaderboardTable.tsx   # Agent leaderboard
    │   └── policies/
    │       └── PolicyList.tsx         # Read-only policy list
    └── pages/
        ├── LoginPage.tsx
        ├── DashboardPage.tsx
        ├── AgentsPage.tsx
        ├── AgentDetailPage.tsx
        ├── ApprovalsPage.tsx
        ├── AuditPage.tsx
        ├── AnalyticsPage.tsx
        └── PoliciesPage.tsx
```

## Complexity Tracking

No violations — standard SPA architecture with well-established libraries.
