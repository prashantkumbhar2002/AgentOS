# UI Contracts: Frontend — React Dashboard

## Color System Contracts

### Agent Status Colors

| Status | Tailwind Class | Hex |
|--------|---------------|-----|
| DRAFT | `bg-slate-500/20 text-slate-400` | slate |
| PENDING_APPROVAL | `bg-blue-500/20 text-blue-400` | blue |
| APPROVED | `bg-blue-500/20 text-blue-400` | blue |
| ACTIVE | `bg-green-500/20 text-green-400` | green |
| SUSPENDED | `bg-amber-500/20 text-amber-400` | amber |
| DEPRECATED | `bg-red-500/20 text-red-400` | red |

### Risk Tier Colors

| Tier | Tailwind Class | Usage |
|------|---------------|-------|
| LOW | `bg-green-500/20 text-green-400` | Badge, chart segment |
| MEDIUM | `bg-yellow-500/20 text-yellow-400` | Badge, chart segment |
| HIGH | `bg-orange-500/20 text-orange-400` | Badge, chart segment |
| CRITICAL | `bg-red-500/20 text-red-400` | Badge, chart segment |

### Event Type Colors

| Event | Tailwind Class | Icon |
|-------|---------------|------|
| llm_call | `text-blue-400` | Brain/Sparkles |
| tool_call | `text-violet-400` | Wrench |
| approval_requested | `text-orange-400` | Clock |
| approval_resolved | `text-green-400` | CheckCircle |
| action_blocked | `text-red-400` | XCircle |

## Page Route Contracts

| Route | Page Component | Auth Required | Min Role |
|-------|---------------|:------------:|----------|
| `/login` | LoginPage | No | — |
| `/` | DashboardPage | Yes | any |
| `/agents` | AgentsPage | Yes | any |
| `/agents/:id` | AgentDetailPage | Yes | any |
| `/approvals` | ApprovalsPage | Yes | any |
| `/audit` | AuditPage | Yes | any |
| `/analytics` | AnalyticsPage | Yes | any |
| `/policies` | PoliciesPage | Yes | any |

## API Endpoint → Hook Mapping

| Hook | Endpoints Used |
|------|---------------|
| useAuthStore | `POST /api/auth/login`, `GET /api/auth/me` |
| useAgents | `GET /api/agents`, `GET /api/agents/:id`, `POST /api/agents`, `PATCH /api/agents/:id`, `PATCH /api/agents/:id/status`, `DELETE /api/agents/:id` |
| useApprovals | `GET /api/approvals`, `GET /api/approvals/:id`, `POST /api/approvals`, `PATCH /api/approvals/:id/decide` |
| useAuditLogs | `GET /api/audit/logs`, `GET /api/audit/traces/:traceId`, `GET /api/audit/stats/:id` |
| usePolicies | `GET /api/policies`, `GET /api/policies/:id` |
| useAnalytics | `GET /api/analytics/costs`, `GET /api/analytics/costs/timeline`, `GET /api/analytics/usage`, `GET /api/analytics/agents`, `GET /api/analytics/models` |

## Shared Component Contracts

### StatCard
- Props: `{ title: string, value: string | number, icon: ReactNode, trend?: { value: number, isPositive: boolean }, pulse?: boolean }`
- Visual: Card with icon, title, large value, optional trend arrow

### StatusBadge
- Props: `{ status: AgentStatus }`
- Visual: Colored pill badge with status text

### RiskBadge
- Props: `{ tier: RiskTier }`
- Visual: Colored pill badge with tier text

### EmptyState
- Props: `{ title: string, description: string, action?: { label: string, onClick: () => void } }`
- Visual: Centered message with optional action button

### ErrorState
- Props: `{ message: string, onRetry: () => void }`
- Visual: Error message with retry button

### ConfirmDialog
- Props: `{ open: boolean, title: string, description: string, confirmLabel: string, variant: 'default' | 'destructive', onConfirm: () => void, onCancel: () => void, children?: ReactNode }`
- Visual: shadcn AlertDialog with optional content slot for comment input
