# Research: Frontend — React Dashboard

## Decision 1: Vite + React Project Initialization

**Decision**: Use `npm create vite@latest` with the `react-ts` template, then add TailwindCSS v3, shadcn/ui, and remaining deps manually. Configure as an `apps/web` workspace in Turborepo.

**Rationale**: Vite's react-ts template gives a clean TypeScript-strict setup. Manual configuration is more reliable than scaffolding tools for monorepo workspaces. shadcn/ui requires manual `components.json` setup anyway.

**Alternatives considered**:
- Next.js: Too heavyweight for an SPA dashboard with no SSR needs. Rejected.
- Create React App: Deprecated. Rejected.
- Remix: Server-centric; we need a pure client SPA. Rejected.

## Decision 2: shadcn/ui Configuration for Dark Theme

**Decision**: Configure shadcn/ui with the "zinc" base color and "dark" mode. Set `darkMode: "class"` in Tailwind config. Apply `dark` class to the `<html>` element permanently (no toggle). Use CSS variables from shadcn's dark theme for consistent component styling.

**Rationale**: shadcn/ui provides production-ready components (Dialog, Sheet, Table, Tabs, Skeleton, AlertDialog, Toast) that match the dense ops-tool aesthetic. Zinc base gives a professional, neutral dark palette.

**Alternatives considered**:
- Radix UI primitives only: Would require more custom styling. shadcn wraps Radix with Tailwind already. Rejected for productivity.
- Material UI: Too opinionated, heavier bundle, doesn't match the "Datadog meets Linear" aesthetic. Rejected.

## Decision 3: Axios Client Architecture

**Decision**: Create a singleton Axios instance in `lib/api.ts` with:
- `baseURL` from `import.meta.env.VITE_API_URL`
- Request interceptor: attach `Authorization: Bearer <token>` from Zustand store
- Response interceptor: on 401, clear auth store and `window.location.href = '/login'`
- Export typed wrapper functions per module (e.g., `agentsApi.list()`, `approvalsApi.decide()`) — components never use raw Axios

**Rationale**: Centralized interceptors ensure consistent auth handling. Typed wrapper functions provide autocomplete and catch API contract changes at compile time. The Zustand store is accessed outside React (via `useAuthStore.getState()`) for the interceptor.

**Alternatives considered**:
- Fetch API: No interceptors, no automatic JSON parsing, verbose error handling. Rejected.
- tRPC: Requires backend changes; not compatible with existing REST API. Rejected.
- ky: Smaller but less ecosystem support. Axios is more familiar and well-documented. Rejected.

## Decision 4: TanStack Query Configuration

**Decision**: Configure with `staleTime: 30_000` (30s), `gcTime: 5 * 60_000` (5min), `retry: 1`, `refetchOnWindowFocus: true`. Use query key factories per domain (e.g., `agentKeys.all`, `agentKeys.detail(id)`). All data fetching goes through `useQuery`/`useMutation` — no direct API calls in components.

**Rationale**: 30s stale time prevents excessive refetching while keeping data reasonably fresh. Query key factories make cache invalidation predictable (SSE events invalidate specific keys). Window focus refetch catches changes made in other tabs.

**Alternatives considered**:
- SWR: Less feature-rich mutation handling. TanStack Query has better devtools and invalidation. Rejected.
- Redux Toolkit Query: Adds Redux as a dependency; Zustand + TanStack Query is lighter. Rejected.

## Decision 5: SSE Hook Architecture

**Decision**: Custom `useSSE` hook that:
1. Creates an `EventSource` pointing to `/api/events/stream?token=<jwt>`
2. On message: parse JSON, append to internal event buffer (max 50), dispatch to TanStack Query invalidation based on event type
3. On error/close: reconnect with exponential backoff (2s → 4s → 8s → max 30s)
4. On successful reconnect: reset backoff timer
5. Cleanup: close EventSource on unmount
6. Expose: `{ events, isConnected, connectionError }`

**Rationale**: Native `EventSource` API is sufficient — no library needed. The hook manages its own connection lifecycle. TanStack Query invalidation on SSE events provides automatic UI updates without manual refetching.

**Alternatives considered**:
- Polling: Wastes bandwidth and has latency. Rejected per spec.
- WebSocket: Forbidden by constitution (Principle VI). Rejected.
- EventSource polyfill: Not needed — all target browsers support `EventSource` natively. Rejected.

## Decision 6: Recharts for Analytics Charts

**Decision**: Use Recharts for all analytics visualizations:
- `LineChart` for cost timeline (multi-line per agent)
- `PieChart` for approval outcome distribution
- `BarChart` for model usage (calls + cost)

**Rationale**: Recharts is React-native (component-based), well-documented, supports responsive containers, and handles the chart types we need. Dark theme styling via Tailwind CSS variables.

**Alternatives considered**:
- Chart.js + react-chartjs-2: Canvas-based, harder to style with Tailwind. Rejected.
- D3: Too low-level for standard chart types. Rejected for productivity.
- Nivo: Good but heavier, and Recharts is more established. Rejected.

## Decision 7: React Router Configuration

**Decision**: React Router v6 with `createBrowserRouter`. Route structure:
- `/login` — public, LoginPage
- `/` — protected, AppLayout wrapper
  - `/` — DashboardPage (index route)
  - `/agents` — AgentsPage
  - `/agents/:id` — AgentDetailPage
  - `/approvals` — ApprovalsPage
  - `/audit` — AuditPage
  - `/analytics` — AnalyticsPage
  - `/policies` — PoliciesPage

Protected routes check `useAuthStore.isAuthenticated` and redirect to `/login` if false.

**Rationale**: React Router v6 is the standard for React SPAs. `createBrowserRouter` supports loaders and error boundaries. The nested layout pattern keeps AppLayout (sidebar + top bar) mounted across page transitions.

**Alternatives considered**:
- TanStack Router: More type-safe but less mature; team familiarity with React Router is higher. Rejected for this project.
