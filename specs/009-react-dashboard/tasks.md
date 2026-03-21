# Tasks: Frontend — React Dashboard

**Input**: Design documents from `/specs/009-react-dashboard/`
**Prerequisites**: spec.md, plan.md, contracts/, data-model.md, research.md
**Organization**: Tasks grouped by layer with clear dependencies. Format: `F[number]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[API]**: Requires backend API endpoints to be running for functional testing
- **[SSE]**: Depends on SSE event stream — can be built with mock data first

---

## Layer 1: Foundation (F01–F10)

**Purpose**: Set up the Vite + React project, core libraries, auth system, layout shell, and login page.

- [ ] F01 — `apps/web/` project scaffolding — Initialize Vite + React + TypeScript project with `npm create vite@latest web -- --template react-ts` inside `apps/`. Configure `tsconfig.json` (strict: true, paths: `@/*` → `src/*`). Add to root `package.json` workspaces. Add to `turbo.json` pipeline. Create `.env.example` with `VITE_API_URL=http://localhost:3000`. Verify `npm run dev` starts the dev server.

- [ ] F02 — TailwindCSS + shadcn/ui setup — Install TailwindCSS v3 + PostCSS + autoprefixer. Create `tailwind.config.ts` with `darkMode: "class"`, content paths `["./src/**/*.{ts,tsx}"]`, shadcn/ui theme extensions (CSS variables for colors). Create `postcss.config.js`. Update `src/index.css` with `@tailwind base/components/utilities` + dark theme CSS variables (zinc palette). Add `class="dark"` to `<html>` in `index.html`. Initialize shadcn/ui: create `components.json` (style: "default", rsc: false, tsx: true, alias: `@/components`, `@/lib`). Install core shadcn components: `button`, `input`, `label`, `card`, `table`, `badge`, `tabs`, `dialog`, `alert-dialog`, `sheet`, `skeleton`, `toast`, `toaster`, `dropdown-menu`, `select`, `separator`, `scroll-area`, `progress`, `form`, `popover`, `command`, `tooltip`.
  - **Depends on**: F01

- [ ] F03 — `src/lib/utils.ts` + `src/lib/formatters.ts` — Create `cn()` helper (clsx + tailwind-merge, standard shadcn pattern). Create `formatters.ts` with: `formatUsd(amount: number)` → `$X.XXXX` (4 decimals for < $1, 2 for >= $1), `formatRelativeTime(date: Date | string)` → "3 minutes ago" or absolute date if > 24h (use date-fns `formatDistanceToNow` + `format`), `formatDuration(ms: number)` → "1.2s" or "450ms", `formatTokens(count: number)` → "1.2K" or raw number if < 1000. Install `date-fns`, `clsx`, `tailwind-merge` as dependencies.
  - **Depends on**: F01

- [ ] F04 [P] — `src/lib/api.ts` — Axios client — Install `axios`. Create singleton Axios instance with `baseURL: import.meta.env.VITE_API_URL`. Request interceptor: read token from `useAuthStore.getState().token`, set `Authorization: Bearer ${token}` header. Response interceptor: on 401 status, call `useAuthStore.getState().logout()` and `window.location.href = '/login'`. Export typed API modules: `authApi` (`login(email, password)`, `me()`), `agentsApi` (`list(query)`, `getById(id)`, `create(data)`, `update(id, data)`, `updateStatus(id, data)`, `remove(id)`), `approvalsApi` (`list(query)`, `getById(id)`, `decide(id, data)`), `auditApi` (`getLogs(query)`, `getTrace(traceId)`, `getStats(agentId)`, `exportCsv(query)`), `policiesApi` (`list()`, `getById(id)`), `analyticsApi` (`getCosts(query)`, `getCostTimeline(query)`, `getUsage(query)`, `getAgents(query)`, `getModels(query)`), `showcaseApi` (`runEmailAgent(data)`, `runResearchAgent(data)`, `seedMock()`). [API]
  - **Depends on**: F01

- [ ] F05 [P] — `src/lib/queryClient.ts` — TanStack Query setup — Install `@tanstack/react-query` + `@tanstack/react-query-devtools`. Create and export `queryClient` with `defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: true } }`. Export query key factories: `agentKeys`, `approvalKeys`, `auditKeys`, `analyticsKeys`, `policyKeys` — each with `.all`, `.lists()`, `.detail(id)` patterns.
  - **Depends on**: F01

- [ ] F06 [P] — `src/store/useAuthStore.ts` — Zustand auth store — Install `zustand`. Create store with: state `{ user: AuthUser | null, token: string | null }`, computed `isAuthenticated` (getter from token), actions `login(email, password)` (calls `authApi.login`, stores token + user, also calls `authApi.me()` to get full user profile), `logout()` (clears user + token), `setUser(user)`. Use `persist` middleware with `localStorage` and key `'agentos-auth'`. Import `AuthUser` type from `@agentos/types`.
  - **Depends on**: F04

- [ ] F07 — `src/hooks/useSSE.ts` — SSE hook — Create custom hook: takes no params, reads token from `useAuthStore`. Creates `EventSource` at `${import.meta.env.VITE_API_URL}/api/events/stream?token=${token}`. State: `events: SSEEvent[]` (max 50, FIFO), `isConnected: boolean`. On `message`: parse JSON, prepend to events array (trim to 50), call `queryClient.invalidateQueries` based on event type mapping (approval events → `approvalKeys.all`, audit events → `auditKeys.all`, agent events → `agentKeys.all`). On `error`/`close`: set `isConnected = false`, schedule reconnect with exponential backoff (2s, 4s, 8s, 16s, max 30s). On successful connect: reset backoff, set `isConnected = true`. Cleanup: close EventSource on unmount or token change. [SSE]
  - **Depends on**: F05, F06

- [ ] F08 — React Router + protected routes + `src/App.tsx` — Install `react-router-dom`. Create `App.tsx` with `QueryClientProvider`, `BrowserRouter`, route config: `/login` → `LoginPage` (public), `/` → `AppLayout` (protected, wraps children with auth check). Protected route component: checks `useAuthStore.isAuthenticated`, redirects to `/login` if false. Nested routes inside AppLayout: index → `DashboardPage`, `/agents` → `AgentsPage`, `/agents/:id` → `AgentDetailPage`, `/approvals` → `ApprovalsPage`, `/audit` → `AuditPage`, `/analytics` → `AnalyticsPage`, `/policies` → `PoliciesPage`. Update `src/main.tsx` to render `<App />`. Add `Toaster` component from shadcn for toast notifications.
  - **Depends on**: F05, F06

- [ ] F09 — Layout shell: `AppLayout.tsx` + `Sidebar.tsx` + `TopBar.tsx` — Create `AppLayout`: flex container, sidebar (fixed width 240px) + main content area (flex-1, scroll). Sidebar: dark background (zinc-900), AgentOS logo/wordmark at top, nav links with icons (Dashboard/Home, Agents/Bot, Approvals/ShieldCheck, Audit/FileSearch, Analytics/BarChart3, Policies/Lock) using `NavLink` with active state styling (bg-zinc-800, text-white). Collapse to icon-only on narrow screens optional. TopBar: sticky top bar with connection status dot (green=connected, red=disconnected from useSSE), user dropdown (name, role badge, logout button). Install `lucide-react` for icons. Render `<Outlet />` in main content area.
  - **Depends on**: F07, F08

- [ ] F10 — `LoginPage.tsx` — Full login page — Full-page centered layout, dark background. Card with AgentOS logo, tagline "AI Agent Governance Platform", email input, password input, login button. Uses shadcn Form components. On submit: call `useAuthStore.login()`, show loading state on button, on success `navigate('/')`, on error show inline error message below form (e.g., "Invalid email or password"). If already authenticated, redirect to `/`. [API]
  - **Depends on**: F06, F08

**Checkpoint**: App boots, user can log in, sees empty layout shell with sidebar + top bar. All foundation libraries configured.

---

## Layer 2: Core Pages (F11–F25)

**Purpose**: Build Dashboard, Agents, and AgentDetail pages — the primary workflows.

### Dashboard

- [ ] F11 [P] — `src/components/shared/` — Shared components — Create all shared components: `StatusBadge.tsx` (agent status → colored badge per color system), `RiskBadge.tsx` (risk tier → colored badge), `EventBadge.tsx` (event type → colored icon + label), `StatCard.tsx` (icon, title, value, optional trend arrow, optional pulse animation), `EmptyState.tsx` (centered message + optional action button), `ErrorState.tsx` (error message + retry button), `HealthBar.tsx` (progress bar, color transitions green→yellow→orange→red based on score), `ConfirmDialog.tsx` (wraps shadcn AlertDialog with title, description, confirm/cancel, optional children slot for extra inputs like comment).
  - **Depends on**: F02, F03

- [ ] F12 — `src/hooks/useAgents.ts` — Agent queries + mutations — Export: `useAgentList(query?)` → `useQuery(['agents', query], agentsApi.list)`, `useAgent(id)` → `useQuery(['agents', id], agentsApi.getById)`, `useCreateAgent()` → `useMutation(agentsApi.create, { onSuccess: invalidate agents })`, `useUpdateAgent(id)` → `useMutation`, `useUpdateAgentStatus(id)` → `useMutation`, `useDeleteAgent(id)` → `useMutation`. All mutations invalidate `agentKeys.all` on success and show toast. [API]
  - **Depends on**: F04, F05

- [ ] F13 — `src/hooks/useApprovals.ts` — Approval queries + mutations — Export: `useApprovalList(query?)` → `useQuery(['approvals', query], approvalsApi.list)`, `useApproval(id)` → `useQuery`, `useDecideApproval(id)` → `useMutation(approvalsApi.decide, { onSuccess: invalidate approvals, show toast })`. [API]
  - **Depends on**: F04, F05

- [ ] F14 [P] — `src/hooks/useAuditLogs.ts` — Audit queries — Export: `useAuditLogs(query?)` → `useQuery(['audit', query], auditApi.getLogs)`, `useTrace(traceId)` → `useQuery(['audit', 'trace', traceId], auditApi.getTrace)`, `useAgentAuditStats(agentId)` → `useQuery(['audit', 'stats', agentId], auditApi.getStats)`. Export `useExportCsv()` → function that calls `auditApi.exportCsv`, creates a Blob, and triggers download. [API]
  - **Depends on**: F04, F05

- [ ] F15 [P] — `src/hooks/useAnalytics.ts` + `src/hooks/usePolicies.ts` — Analytics + policy queries — `useAnalytics.ts`: export `useCostSummary(query?)`, `useCostTimeline(query?)`, `useUsageStats(query?)`, `useAgentLeaderboard(query?)`, `useModelUsage(query?)` — each wraps `useQuery` with appropriate key. `usePolicies.ts`: export `usePolicyList()`, `usePolicy(id)`. [API]
  - **Depends on**: F04, F05

- [ ] F16 — `src/components/dashboard/DashboardStats.tsx` — 4 stat cards — Row of 4 `StatCard` components. Fetches data from `useAgentList` (total count, active count), `useApprovalList({ status: 'PENDING' })` (pending count), `useCostSummary()` (today's cost). Loading: 4 skeleton cards. Pending Approvals card gets `pulse={true}` when count > 0. Today's Cost uses `formatUsd()`. [API]
  - **Depends on**: F11, F12, F13, F15

- [ ] F17 — `src/components/dashboard/AgentHealthTable.tsx` — Sortable agent table — Uses shadcn Table. Fetches agents via `useAgentList()`. Columns: name (link), StatusBadge, RiskBadge, ownerTeam, lastActiveAt (formatRelativeTime), cost7d (formatUsd), HealthBar. Sortable by clicking column headers (client-side sort via state). Click row → `navigate(/agents/${id})`. Loading: table skeleton (8 rows). Empty: EmptyState "No agents registered". [API]
  - **Depends on**: F11, F12

- [ ] F18 — `src/components/dashboard/LiveActivityFeed.tsx` — SSE-connected live feed — Uses `useSSE` hook. Renders scrollable list of events (max 50). Each event: timestamp (relative), EventBadge (color-coded icon + type label), agent name, brief detail (model for llm_call, toolName for tool_call, etc.). Auto-scrolls to bottom on new event (with `useRef` on scroll container). Shows "Connected" / "Disconnected" indicator at top. Empty state when no events: "Waiting for agent activity...". [SSE]
  - **Depends on**: F07, F11

- [ ] F19 — `src/pages/DashboardPage.tsx` — Compose dashboard — Composes: DashboardStats (top row), then two-column layout (60/40): left = AgentHealthTable, right = LiveActivityFeed. Uses `grid grid-cols-5` → table spans 3 cols, feed spans 2 cols. Page title "Dashboard" in top area.
  - **Depends on**: F16, F17, F18

### Agents

- [ ] F20 — `src/components/agents/AgentFilterBar.tsx` + `src/components/agents/AgentTable.tsx` — Agent registry — FilterBar: shadcn Select for status (DRAFT, ACTIVE, etc.), multi-select for risk tier (checkboxes in popover), Select for environment, Input for ownerTeam, Input for search text. Debounce search input (300ms). AgentTable: shadcn Table with sortable columns (name, status, riskTier, ownerTeam, toolCount, lastActive, cost7d, healthScore). Uses `useAgentList(query)` where query built from filter state. Pagination with prev/next buttons. Loading: skeleton table. Empty: "No agents match your filters". Click row → navigate to detail. [API]
  - **Depends on**: F11, F12

- [ ] F21 — `src/components/agents/RegisterAgentModal.tsx` — 3-step registration form — Uses shadcn Dialog. State machine for 3 steps: **Step 1** (BasicInfo): name (Input, required), description (Textarea), ownerTeam (Input), llmModel (Select: claude-sonnet-4-5, etc.), environment (Select: DEV/STAGING/PROD). **Step 2** (Tools): dynamic list of {name, description} pairs, "Add Tool" button, remove button per tool, min 0 tools. **Step 3** (RiskAssessment): RiskTier radio group with descriptions ("LOW — minimal risk, auto-approved actions", etc.), tags input (comma-separated or chip input). Footer: Back/Next/Submit buttons, step dots indicator. Validate each step before Next. On Submit: call `useCreateAgent` mutation, close modal on success, show toast. [API]
  - **Depends on**: F11, F12

- [ ] F22 — `src/pages/AgentsPage.tsx` — Compose agents page — Composes: page header "Agent Registry" + "Register Agent" button (opens RegisterAgentModal), AgentFilterBar, AgentTable. Button visible to all roles (agent creation not restricted in current RBAC).
  - **Depends on**: F20, F21

### Agent Detail

- [ ] F23 — `src/components/agents/AgentHeader.tsx` + `src/components/agents/AgentStats.tsx` — Agent detail header — AgentHeader: agent name (large), StatusBadge, RiskBadge, ownerTeam, environment tag, "Edit" button (visible only if `user.role === 'admin'`). AgentStats: 4 mini StatCards in a row — Total Runs, Total Cost (formatUsd), Avg Latency (formatDuration), Health Score (circular progress using `progress` + custom SVG ring or just shadcn Progress). Fetch via `useAgent(id)` + `useAgentAuditStats(id)`. [API]
  - **Depends on**: F11, F12, F14

- [ ] F24 — Agent detail tabs: `AgentOverviewTab.tsx`, `AgentTracesTab.tsx`, `AgentApprovalsTab.tsx`, `AgentPoliciesTab.tsx`, `AgentSettingsTab.tsx` — **Overview**: tool list (cards with name + description), applied policies list (name + description + rule count). **Traces**: fetches audit logs for this agent, groups by traceId, renders as expandable accordion rows — click to expand shows timeline of events with EventBadge, timestamp, cost, latency. **Approvals**: table of this agent's approval tickets with status, actionType, riskScore, createdAt, resolvedAt. **Policies**: list of assigned policies with rules. **Settings** (admin only): form to edit name, description, ownerTeam, llmModel, tags + status transition buttons (Activate, Suspend, Deprecate) with ConfirmDialog. Each tab uses shadcn Tabs component. [API]
  - **Depends on**: F11, F12, F13, F14, F15

- [ ] F25 — `src/pages/AgentDetailPage.tsx` — Compose agent detail — Uses `useParams()` to get `:id`. Fetches agent via `useAgent(id)`. Composes: AgentHeader, AgentStats, Tabs (Overview, Audit Traces, Approvals, Policies, Settings — Settings hidden for non-admin). Loading: full page skeleton. Not found: ErrorState with "Agent not found" message. [API]
  - **Depends on**: F23, F24

**Checkpoint**: Dashboard, Agent Registry, and Agent Detail pages fully functional.

---

## Layer 3: Workflow Pages (F26–F35)

**Purpose**: Build Approvals and Audit Explorer pages — the operational workflow pages.

### Approvals

- [ ] F26 — `src/components/approvals/ApprovalCard.tsx` — Pending ticket card — Card showing: agent name + StatusBadge of agent's riskTier, action type label, risk score bar (colored: green < 0.3, yellow < 0.6, orange < 0.8, red >= 0.8), reasoning text, collapsible payload preview (JSON.stringify with syntax highlighting or pre-formatted), time remaining countdown (live-updating via `useEffect` + `setInterval` every 1s, shows "Expired" if past), [Approve] button (green), [Deny] button (red). Pulsing red border (`animate-pulse border-red-500`) if expiresAt < 5 minutes from now. Props: ticket data + onApprove + onDeny callbacks.
  - **Depends on**: F11, F03

- [ ] F27 — `src/components/approvals/ApprovalDecisionDialog.tsx` — Confirmation dialog — Wraps ConfirmDialog. Shows: full payload (formatted JSON), comment textarea, confirm button text ("Approve" or "Deny"), destructive variant for Deny. On confirm: calls `useDecideApproval` mutation with `{ decision, comment }`. Shows loading state on button during mutation. On success: toast "Approval resolved", close dialog. [API]
  - **Depends on**: F11, F13

- [ ] F28 — `src/components/approvals/ResolvedTable.tsx` — Resolved tickets table — shadcn Table showing resolved tickets. Columns: agent name, action type, status badge (APPROVED=green, DENIED=red, EXPIRED=slate), resolved by (user name), resolvedAt (formatRelativeTime), riskScore. Paginated. Sorted by resolvedAt DESC. [API]
  - **Depends on**: F11, F13

- [ ] F29 — `src/pages/ApprovalsPage.tsx` — Compose approvals page — Two-column layout. Left (flex-1): "Pending Approvals" heading + count badge, list of `ApprovalCard` components (sorted by expiresAt ASC). Right (w-[480px]): "Resolved" heading, `ResolvedTable`. Fetches via `useApprovalList({ status: 'PENDING' })` and `useApprovalList({ status: 'APPROVED' })` (or single list split by status). When Approve/Deny clicked on card → open ApprovalDecisionDialog. SSE events auto-invalidate approval queries → new cards appear / resolved cards move automatically. Empty left: EmptyState "No pending approvals — agents are running smoothly". [API] [SSE]
  - **Depends on**: F26, F27, F28

### Audit Explorer

- [ ] F30 — `src/components/audit/AuditFilterBar.tsx` — Audit filter bar — Agent dropdown (Select, fetches agent list for options), event type multi-select (checkboxes in popover: llm_call, tool_call, approval_requested, approval_resolved, action_blocked), date range picker (two date inputs: from, to — use shadcn Popover + Calendar or simple date inputs), trace ID search input (Input, debounced 300ms). All filters update query state passed to parent. [API]
  - **Depends on**: F11, F12

- [ ] F31 — `src/components/audit/AuditTable.tsx` — Paginated audit table — shadcn Table. Columns: timestamp (formatRelativeTime, tooltip with absolute), agent name, EventBadge (icon + type), model or toolName, inputTokens/outputTokens (formatted), costUsd (formatUsd), latencyMs (formatDuration), success (green check / red X badge). Sortable by timestamp, cost, latency. Paginated with prev/next + page indicator. Click row → calls `onSelectTrace(traceId)`. Loading: skeleton rows. Admin/approver: "Export CSV" button in top-right (calls `useExportCsv`). [API]
  - **Depends on**: F11, F14

- [ ] F32 — `src/components/audit/TraceDrawer.tsx` — Trace side drawer — Uses shadcn Sheet (side="right", width ~480px). Fetches trace via `useTrace(traceId)`. Header: trace ID (monospace), agent name, total cost (sum of all events), total latency (sum). Body: vertical timeline of events — each step: EventBadge, timestamp, model/tool, tokens, cost, latency, success indicator. Events ordered chronologically. Loading: skeleton timeline. Close button. [API]
  - **Depends on**: F11, F14

- [ ] F33 — `src/pages/AuditPage.tsx` — Compose audit explorer — Page header "Audit Explorer". AuditFilterBar at top. AuditTable below. TraceDrawer opens when a row is clicked (state: `selectedTraceId`). CSV export button visible based on role check from `useAuthStore`. [API]
  - **Depends on**: F30, F31, F32

**Checkpoint**: Approvals and Audit Explorer pages fully functional.

---

## Layer 4: Analytics & Policies (F34–F42)

**Purpose**: Build Analytics dashboard with charts and read-only Policies page.

### Analytics

- [ ] F34 — Install Recharts — `npm install recharts` in apps/web. No component work, just dependency installation.
  - **Depends on**: F01

- [ ] F35 — `src/components/analytics/CostSummaryCards.tsx` — Cost summary row — 3 StatCards: "Today" (todayUsd), "This Period" (period total based on selected range), "vs Last Period" (changeVs7dAgo as percentage with trend arrow — green if positive, red if negative). Fetches via `useCostSummary({ fromDate, toDate })`. Loading: 3 skeleton cards. [API]
  - **Depends on**: F11, F15

- [ ] F36 — `src/components/analytics/CostTimelineChart.tsx` — Multi-line cost chart — Recharts `ResponsiveContainer` + `LineChart`. X-axis: dates. Y-axis: USD cost. One `Line` per agent (different colors from a palette). Tooltip showing date + agent + cost. Legend at bottom. Fetches via `useCostTimeline({ days, agentId })`. Dark theme: axis/grid in zinc-700, text in zinc-400. Loading: skeleton rectangle. [API]
  - **Depends on**: F15, F34

- [ ] F37 — `src/components/analytics/ApprovalPieChart.tsx` — Approval outcome pie — Recharts `PieChart`. Segments: AUTO_APPROVED (green), APPROVED (blue), DENIED (red), EXPIRED (slate). Labels with counts. Fetches approval data via `useUsageStats()` (approval breakdown fields). Dark theme colors. [API]
  - **Depends on**: F15, F34

- [ ] F38 — `src/components/analytics/ModelUsageChart.tsx` — Model usage bar chart — Recharts `BarChart`. X-axis: model names. Y-axis: dual — call count (bars) and cost (line or secondary bars). Tooltip with detailed breakdown. Fetches via `useModelUsage()`. [API]
  - **Depends on**: F15, F34

- [ ] F39 — `src/components/analytics/LeaderboardTable.tsx` — Agent leaderboard — shadcn Table. Columns: rank (#), agent name, total cost (formatUsd), total runs, error rate (percentage), avg latency (formatDuration), health score (HealthBar). Sortable by any column. Fetches via `useAgentLeaderboard({ sortBy, order })`. [API]
  - **Depends on**: F11, F15

- [ ] F40 — `src/pages/AnalyticsPage.tsx` — Compose analytics page — Page header "Analytics". Time range selector: 3 toggle buttons (7d / 30d / 90d), default 7d — stored in local state, passed to all child components as `days` prop. Row 1: CostSummaryCards. Row 2: CostTimelineChart (full width). Row 3: two-column grid — ApprovalPieChart (left), ModelUsageChart (right). Row 4: LeaderboardTable (full width). Each section has appropriate spacing. [API]
  - **Depends on**: F35, F36, F37, F38, F39

### Policies (Read-Only)

- [ ] F41 — `src/components/policies/PolicyList.tsx` — Policy list view — Fetches policies via `usePolicyList()`. Renders each policy as a card: name (bold), description, active/inactive badge, rule count. Expandable: click to show rules — each rule: actionType, riskTiers (as RiskBadge tags), effect (ALLOW=green, DENY=red, REQUIRE_APPROVAL=amber badge), conditions (JSON preview or "No conditions"). Loading: skeleton cards. Empty: "No policies configured". [API]
  - **Depends on**: F11, F15

- [ ] F42 — `src/pages/PoliciesPage.tsx` — Compose policies page — Page header "Policies" with description "View governance policies and their rules". PolicyList component. Read-only — no create/edit controls in this EPIC.
  - **Depends on**: F41

**Checkpoint**: All 8 pages complete. Full dashboard functional.

---

## Dependencies & Execution Order

### Dependency Graph

```
F01 ──┬─── F02 ──── F11 (shared components) ──────────────────────┐
      │                                                             │
      ├─── F03 ─────────────────────────────────────────────────────┤
      │                                                             │
      ├─── F04 (api) ──┬─── F06 (auth) ──┬─── F07 (SSE) ──┐      │
      │                │                  │                 │      │
      ├─── F05 (query) ┘                  ├─── F08 (router) ┤      │
      │                                   │                 │      │
      │                                   └─── F10 (login)  │      │
      │                                                     │      │
      │                           F09 (layout) ─────────────┘      │
      │                                                             │
      ├─── F12 (useAgents) ────────────────────────────────────────┤
      ├─── F13 (useApprovals) ─────────────────────────────────────┤
      ├─── F14 (useAuditLogs) ─────────────────────────────────────┤
      ├─── F15 (useAnalytics + usePolicies) ───────────────────────┤
      │                                                             │
      └─── F34 (recharts) ─────────────────────────────────────────┘

Layer 2: F16→F19 (Dashboard), F20→F22 (Agents), F23→F25 (AgentDetail)
Layer 3: F26→F29 (Approvals), F30→F33 (Audit)
Layer 4: F35→F40 (Analytics), F41→F42 (Policies)
```

### Parallel Opportunities

- **Batch A** (no deps): F01
- **Batch B** (after F01): F02, F03, F04, F05, F34 — all in parallel
- **Batch C** (after F04+F05): F06, F12, F13, F14, F15 — all in parallel
- **Batch D** (after F02+F03): F11 — shared components
- **Batch E** (after F06): F07, F08, F10 — in parallel
- **Batch F** (after F07+F08): F09 (layout)
- **Batch G** (after F11+hooks): F16, F17, F18 → F19 (Dashboard)
- **Batch H**: F20, F21 → F22 (Agents)
- **Batch I**: F23, F24 → F25 (AgentDetail)
- **Batch J**: F26, F27, F28 → F29 (Approvals)
- **Batch K**: F30, F31, F32 → F33 (Audit)
- **Batch L**: F35, F36, F37, F38, F39 → F40 (Analytics)
- **Batch M**: F41 → F42 (Policies)

### API Dependencies

All tasks marked [API] require the backend to be running for functional testing, but can be coded against the type contracts. Key API dependencies:

| API Endpoint Group | Required by Tasks |
|-------------------|-------------------|
| `/api/auth/*` | F10 (login) |
| `/api/agents/*` | F16, F17, F20, F21, F23, F24 |
| `/api/approvals/*` | F16, F26, F27, F28, F29 |
| `/api/audit/*` | F30, F31, F32 |
| `/api/analytics/*` | F16, F35, F36, F37, F38, F39 |
| `/api/policies/*` | F41 |
| `/api/events/stream` | F18, F29 (SSE) |

### SSE Dependencies

Tasks marked [SSE] need the SSE stream for real-time behavior:
- F18 (LiveActivityFeed) — can render mock events during development
- F29 (ApprovalsPage) — can use manual refresh during development

---

## Summary

- **Total tasks**: 42
- **Layer 1 (Foundation)**: F01–F10 — project setup through login
- **Layer 2 (Core)**: F11–F25 — Dashboard, Agents, AgentDetail
- **Layer 3 (Workflow)**: F26–F33 — Approvals, Audit
- **Layer 4 (Admin)**: F34–F42 — Analytics, Policies
- **New dependencies**: react-router-dom, axios, zustand, @tanstack/react-query, recharts, date-fns, clsx, tailwind-merge, lucide-react, shadcn/ui components
- **Backend dependency**: All 30 API endpoints from EPICs 2–7
- **No new backend changes needed**: Frontend consumes existing API contracts

---

## Notes

- [P] = parallelizable (different files, no incomplete dependencies)
- [API] = requires backend API running for functional testing
- [SSE] = depends on SSE stream — can be built with mock data first
- shadcn/ui components are installed via CLI (`npx shadcn-ui@latest add <component>`) — F02 handles bulk install
- All data types imported from `@agentos/types` — no type duplication
- All monetary formatting via `formatUsd()` — 4 decimals for < $1, 2 for >= $1
- Dark theme is permanent — no toggle, no light mode classes
