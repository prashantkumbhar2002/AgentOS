# AgentOS

**An AI Agent Governance & Management Platform**

---

## The Problem

Companies are deploying AI agents that autonomously send emails, query databases, call external APIs, and make decisions — often with little oversight. When an agent sends the wrong email to a client, racks up thousands in LLM costs overnight, or deletes production data, there's no audit trail, no approval process, and no way to know what happened until it's too late.

## The Solution

AgentOS sits between your AI agents and the actions they take. Every agent must register with the platform and route its actions through AgentOS. The platform then:

1. **Logs every action** the agent performs — what model it called, what tool it used, how much it cost, whether it succeeded — with hierarchical trace trees
2. **Checks actions against policies before execution** — should this agent be allowed to send external emails? Should a high-risk agent be able to delete records without approval? Policies are evaluated *before* the tool runs, not after
3. **Escalates risky actions to humans** — if a policy says "require approval", the action is paused and a human reviewer is notified via SSE push and Slack
4. **Tracks all costs and usage** — with per-agent budget limits and real-time spend tracking
5. **Works with any LLM provider** — Anthropic, OpenAI, Ollama, or any custom model via a provider-agnostic SDK
6. **Runs durable, multi-step workflows** — long-running agent processes defined as data, surviving crashes and multi-day human approval waits

Think of it as **an ops control plane for AI agents** — the same way you'd use Datadog for servers or a CI/CD pipeline for deployments, AgentOS gives you visibility and control over your AI agents.

---

## How It Works — A Real Example

Imagine you have an **Email Draft Agent** that writes and sends emails on behalf of your sales team.

### Without AgentOS:
The agent calls Claude, drafts an email, and sends it. Nobody reviews it. If the email contains incorrect pricing or goes to the wrong person, you find out when the customer complains.

### With AgentOS:

**Step 1 — The agent is registered**

Your Email Draft Agent is registered on the platform as a HIGH-risk agent (because it sends external emails). It declares its tools: `send_email` and `read_inbox`.

**Step 2 — A policy is created**

An admin creates a policy: *"Any agent trying to `send_email` with risk tier HIGH or above must get human approval first."*

**Step 3 — The agent runs**

A user triggers the agent with the task: *"Send a follow-up email to the client about the Q3 proposal."*

The agent calls Claude to draft the email. AgentOS **logs the LLM call** — model used, tokens consumed, cost, latency.

The agent then tries to send the email. AgentOS **evaluates the policy** — this is a `send_email` action from a HIGH-risk agent — and determines: **approval required**.

**Step 4 — A human reviews**

An approval ticket appears in the dashboard with the full email content, the agent's reasoning, and a risk score. The reviewer also gets a Slack notification. They can:
- **Approve** — the email is sent
- **Deny** — the email is blocked, and the agent is notified

If nobody responds within 30 minutes, the ticket expires automatically.

**Step 5 — Everything is tracked**

The entire flow — LLM call, approval request, human decision, final action — is recorded as a single **trace** in the audit log. The cost appears in the analytics dashboard. The agent's health score updates.

---

## Platform Capabilities

### 1. Agent Registry

Every AI agent in your organization is registered with:
- **Risk classification** — LOW, MEDIUM, HIGH, or CRITICAL
- **Environment** — DEV, STAGING, or PROD
- **Tool declarations** — what tools the agent can use (e.g., `send_email`, `query_db`, `web_search`)
- **Cost budget** — optional `budgetUsd` rolling 30-day spend cap, enforced server-side
- **Lifecycle status** — agents move through DRAFT → ACTIVE → SUSPENDED → DEPRECATED
- **Dedicated API key** — each agent has its own HMAC-SHA256-hashed API key. Admins can rotate it from the agent detail page; only an `apiKeyHint` (last 4 chars) is ever returned afterwards. The full key is shown exactly once, on creation or rotation.

This gives you a single inventory of every AI agent, who owns it, what it can do, how risky it is, and how much it's allowed to spend.

### 2. Audit Trail (with Hierarchical Traces)

Every action an agent takes is logged non-blockingly via the `EventBuffer`:
- **LLM calls** — which provider, model, input/output tokens, cost in USD, latency in ms, success/failure
- **Tool calls** — which tool, inputs, outputs, latency, success/failure
- **Approval events** — when approval was requested, who approved/denied, reasoning
- **Span failures** — a failed `withSpan` step emits a dedicated `span_failed` event carrying the span name, latency, and error message

Events are grouped into **traces** (a single agent session) and organized into **hierarchical span trees** via `spanId` / `parentSpanId`. The TraceDrawer in the dashboard renders these as nested tree views — e.g., a parent "research-workflow" span containing child "llm-call" and "web-search" spans, with "Failed (3.2s)" badges on any span that errored. You can filter by agent, event type, date range, or search by trace ID. Admins can export logs as CSV.

### 3. GovernanceClient SDK (Provider-Agnostic)

The SDK is how AI agents integrate with AgentOS. It's **provider-agnostic** — it works with Anthropic, OpenAI, Ollama, or any LLM accessible over HTTP — and is designed so the agent code reads like normal application code while the SDK silently captures every step.

#### Core API

| Method | What it does |
|--------|--------------|
| `wrapLLMCall(fn, metadata)` | Run any async LLM call; auto-logs tokens, cost, latency, success/failure as one `llm_call` event |
| `wrapLLMStream(fn, onComplete)` | Same as above for streaming responses — yields chunks to the caller, logs once after the stream completes |
| `callTool(name, inputs, fn, options?)` | Checks policy **before** running `fn`; requests human approval if the policy says so; logs the result |
| `checkPolicy(actionType, riskScore?)` | Raw policy lookup. Used internally by `callTool`; exposed for advanced cases |
| `withSpan(name, fn)` | Wrap a logical step so all events inside share a `spanId`; failures emit a dedicated `span_failed` event |
| `withTrace(fn, traceId?)` | Run a request inside its own trace context (per-request isolation on a long-lived client) |
| `logEvent(payload)` | Non-blocking ad-hoc audit event |
| `getMetrics()` | O(1) snapshot of cumulative cost, buffer pressure, per-route circuit-breaker state, and (if enabled) the LangSmith bridge buffer/breaker state — for `/healthz`, Prometheus, or debug dumps |
| `shutdown()` | Best-effort flush of both audit and LangSmith buffers; fires automatically on `beforeExit` / `SIGINT` / `SIGTERM` |

**Optional LangSmith fanout.** Pass `langsmith: { apiKey, projectName, redact?, maxPayloadBytes?, metadataOnly? }` to the constructor and every `wrapLLMCall` / `wrapLLMStream` is *also* posted to LangSmith with a shared `langsmithRunId`. The bridge runs on its own `EventBuffer` + `CircuitBreaker` so a LangSmith outage cannot back-pressure the AgentOS audit pipeline. See [section 10](#10-langsmith-observability-opt-in).

#### Typed errors

Catch by type — never by string-matching error messages. The SDK exports type-guards `isPolicyDeniedError(err)` and `isApprovalRequestError(err)` so application code stays robust across module reloads and bundlers.

| Error | Thrown when | Useful fields |
|-------|-------------|---------------|
| `PolicyDeniedError` | A policy denied the action, or a human denied / let the approval expire | `actionType`, `ticketId`, `kind` (`POLICY` / `APPROVAL_DENIED` / `APPROVAL_EXPIRED` / `APPROVAL_TIMEOUT`) |
| `ApprovalRequestError` | The approval **request** itself failed (network, 401, 429, 5xx, malformed response) — distinct from a real human "deny" | `kind` (`NETWORK` / `AUTH` / `FORBIDDEN` / `NOT_FOUND` / `RATE_LIMITED` / `SERVER` / `INVALID_RESPONSE` / `UNKNOWN`), `httpStatus`, `body` |
| `BudgetExceededError` (client) | Cumulative `wrapLLMCall` cost crossed `BudgetConfig.maxCostUsd` with `onBudgetExceeded: 'throw'` | `currentCost`, `maxCost` |
| `BudgetExceededError` (server, HTTP 402) | Audit batch rejected because the agent's rolling 30-day spend exceeded `agents.budgetUsd` | `agentId`, `currentUsd`, `budgetUsd`, `windowDays` |

#### Resilience & cost control

- **Per-route circuit breaker.** Each route gets its own `CircuitBreaker` keyed by host + first path segment, so a failing `/audit/batch` can't trip the breaker on `/policies/check` — one degraded endpoint can't poison the others.
- **Exponential backoff with full jitter** between retries — caps at `retryMaxMs` (default 30s) and decorrelates retry storms across many client instances.
- **Fail-open vs fail-closed.** Choose at construction whether agent operations should continue (with a warning) or hard-fail when the platform is unreachable.
- **Non-blocking logging.** `EventBuffer` batches events, retries failed flushes with backoff, requeues survivors, and drops a batch only after `bufferMaxFlushAttempts` (default 5).
- **Auto-shutdown.** On `beforeExit` / `SIGINT` / `SIGTERM` the buffer is flushed before the process dies — no lost final batches in serverless or CLI runs.
- **Client-side budgets** (`maxCostUsd`, `warnAtUsd`) and **server-side budgets** (`agents.budgetUsd`, enforced in the audit ingest path on a 30-day rolling window). The server returns HTTP 402 `BUDGET_EXCEEDED`, the SDK silently drops the batch (the action already happened; only the receipt is rejected), and the dashboard receives an `agent.budget_exceeded` SSE event.

#### Observability

- **Hierarchical traces.** `withSpan(name, fn)` builds a nested `spanId` / `parentSpanId` tree that the dashboard's TraceDrawer renders as a collapsible tree view. Failed spans are tagged with a dedicated `span_failed` event so the UI can show "Failed (3.2s)" badges without scanning every child.
- **Per-trace isolation.** `withTrace(fn)` runs each request under a fresh `traceId` even on a shared, long-lived client — essential for HTTP servers that don't construct a new SDK per request.
- **`getMetrics()`** returns `{ cost, buffer, breakers, traceId }` in O(1) with no I/O — safe to call from a `/healthz` handler.
- **Configurable `sseConnectTimeoutMs`** (default `2_500`). The SDK falls back from SSE push to HTTP polling quickly when proxies silently drop the long-lived connection.

#### Framework adapters

Optional zero-config wrappers for popular SDKs. Imported as subpaths so unused adapters never enter the bundle.

| Adapter | Surface |
|---------|---------|
| `@agentos/governance-sdk/adapters/anthropic` | `createMessage(...)` and `streamMessage(...)` (governed Anthropic streaming) |
| `@agentos/governance-sdk/adapters/openai` | `createChatCompletion(...)`, `streamChatCompletion(...)`, and `createEmbedding(...)` |
| `@agentos/governance-sdk/adapters/langchain` | LangChain `BaseCallbackHandler` keyed by `runId` so concurrent LLM/tool runs are tracked correctly |

The SDK uses the global `EventSource` when present (Node 22+, browsers); the `eventsource` polyfill is an optional peer dependency, loaded lazily and falling back to polling with a single warning when absent. Every public SDK method carries JSDoc explaining *when* to reach for it, not just its type signature. For full integration examples — an Anthropic adapter agent, a streaming research agent, raw `wrapLLMCall` with Ollama, and a multi-provider workflow — see `apps/api/src/showcase-agents/`.

### 4. Policy Engine (with Pre-Execution Gating)

Policies are rules that govern what agents can and cannot do. Policies are checked **before** a tool executes — not just at approval time. Each policy contains rules that match on two things:
- **Action type** — what the agent is trying to do (e.g., `send_email`, `delete_record`, or `*` for any action)
- **Risk tier** — the agent's risk classification

Each rule produces one of three effects:
- **ALLOW** — the action proceeds immediately, no human needed
- **DENY** — the action is blocked outright
- **REQUIRE_APPROVAL** — the action is paused until a human approves or denies it

Policies are evaluated with strict priority: DENY always wins over REQUIRE_APPROVAL, which always wins over ALLOW. If no policy matches, the default is REQUIRE_APPROVAL (safe by default).

Policies can be **global** (apply to all agents) or **assigned to specific agents**.

### 5. Approval Workflows

When a policy requires approval, AgentOS creates a **ticket** containing:
- The agent's name and risk level
- What action it wants to perform
- The full payload (e.g., the email it wants to send)
- A risk score (0.0 to 1.0)
- The agent's reasoning for why it needs to do this

The ticket appears in the **Approval Queue** in the dashboard. Reviewers with the `admin` or `approver` role can approve or deny with an optional comment. Tickets also trigger **Slack notifications** so reviewers don't have to watch the dashboard.

Tickets expire after 30 minutes if nobody responds. A background worker handles expiration automatically.

### 6. Analytics & Cost Tracking

The analytics dashboard answers questions like:
- **How much are we spending?** — cost summary for today, last 7 days, last 30 days, with week-over-week trend
- **Which agents cost the most?** — agent leaderboard sorted by cost, runs, error rate, or latency
- **What's the cost trend?** — daily cost timeline chart broken down by agent
- **What are agents doing?** — total runs, LLM calls vs tool calls, average cost per run
- **How are approvals going?** — pie chart of auto-approved / approved / denied / expired
- **Which models are used?** — call count, token usage, and cost per model

### 7. Real-Time Updates (SSE & Live Activity)

The dashboard maintains a **persistent connection** to the API server using Server-Sent Events (SSE). This is the green/red "Connected" / "Disconnected" indicator you see in the top bar.

**How it works**: When you log in, the browser first requests a short-lived SSE token (`POST /api/v1/events/token`, 30-second expiry), then opens a long-lived HTTP connection (`GET /api/v1/events/stream?token=<sseToken>`). The main JWT is never sent in a query string. The server pushes events down this connection in real-time whenever something happens — an agent makes an LLM call, a tool is invoked, an approval ticket is created or resolved.

**What happens on each event**:
- The **Live Activity Feed** on the Dashboard home page shows events as they arrive, auto-scrolling with the latest at the top (capped at 50 entries)
- The relevant dashboard data **refreshes automatically** — for example, when an approval ticket is resolved, the Approval Queue page updates without you clicking anything
- Events are **color-coded** by type for quick scanning:

| Color | Event Type | Meaning |
|-------|-----------|---------|
| Blue | `llm_call` | Agent called an LLM (Claude, GPT, etc.) |
| Violet | `tool_call` | Agent used a tool (web search, email, database query) |
| Orange | `approval_requested` | Agent is waiting for human approval |
| Green | `approval_resolved` | A human approved or denied a request |
| Red | `action_blocked` | A policy denied the agent's action |

**If the connection drops** (network issue, server restart), the indicator turns red and the dashboard automatically retries with exponential backoff (2s → 4s → 8s → ... up to 30s). When it reconnects, it goes green again and live updates resume.

### 8. Agent Health Score

Every agent has a **health score from 0 to 100** that gives you an at-a-glance view of how well it's performing. The score is a weighted composite of three factors:

| Factor | Weight | What it measures | Example |
|--------|--------|-----------------|---------|
| **Error rate** | 40% | How often the agent's actions fail (LLM timeouts, tool errors, exceptions) | 10% error rate → 36/40 points |
| **Denial rate** | 30% | How often the agent's approval requests get denied by humans | 20% denied → 24/30 points |
| **Latency** | 30% | How fast the agent completes its actions (penalized above 10 seconds) | 5s avg → 15/30 points |

**How to read it**:
- **80–100 (green)**: Agent is running smoothly — low errors, approvals mostly granted, fast responses
- **50–79 (yellow)**: Agent needs attention — elevated error or denial rates, or slow performance
- **0–49 (red)**: Agent is unhealthy — frequent failures, most requests denied, or critically slow

**Where you see it**:
- **Dashboard home page** — the Agent Health Table ranks all agents by health score with a colored progress bar, so you can instantly spot problems
- **Agent Detail page** — shows health score as one of the 4 stat cards at the top
- **Agent Leaderboard** (Analytics) — sortable by health score alongside cost and error rate

**Why it matters**: A dropping health score is an early warning signal. High error rates might mean the agent's prompt or tool configuration needs fixing. High denial rates suggest the agent is repeatedly attempting actions outside its intended scope — it may need tighter policies or retraining. High latency could point to upstream API throttling or model overload.

### 9. Durable Workflow Engine (`apps/workflows`)

The workflow service is a separate Node process backed by **Restate** that runs **user-defined Directed Acyclic Graphs** as durable executions. It complements the SDK: where the SDK governs an agent's *in-process* LLM and tool calls, the workflow service governs *multi-step, cross-process, long-running* agent processes that need to survive crashes and human approval delays.

**What it gives you**

- **Workflows-as-data.** A workflow is a `WorkflowDefinition` row containing `{ dag: { nodes, edges }, entryNodeId, constraints }`. No code deploy is required to add a new workflow — insert a row.
- **Six node types**: `llm` (Anthropic; OpenAI is a placeholder), `api` (any HTTP call), `approval` (durable human gate), `condition` (boolean branch), `transform` (data shaping), and `parallel` (a fan-out marker — the engine runs independent nodes concurrently regardless).
- **DAG semantics.** The engine validates the graph for cycles/orphans on load, computes a topological order, and runs all ready nodes (in-degree 0) **in parallel** at each level. Children only execute once **every** parent has completed (join semantics). Conditional edges (`{ from, to, condition }`) are evaluated against the live execution context to choose downstream branches.
- **Durable approval waits via Restate promises.** An `approval` node creates an `ApprovalTicket` with `restateWorkflowId` and `restatePromiseName`, then suspends. When a human resolves the ticket in the dashboard, the API resolves the corresponding Restate promise and the workflow resumes from exactly that node — even after process restarts or multi-day waits, with zero resource consumption while idle. This reuses the same approval queue, Slack notifications, SSE, and expiration worker the SDK uses, rather than a parallel approval UI.
- **Variable interpolation.** `{{taskName}}`, `{{previousNode.output.field}}`, plus built-ins `{{_agentId}}`, `{{_traceId}}`, `{{_apiUrl}}`, `{{_workflowId}}` flow through every node config.
- **Cost-bounded execution.** `constraints.maxCostUsd` (default $10) is checked after each LLM node; exceeding it fails the workflow cleanly.
- **Persistence.** `WorkflowExecution` records track every run with `status`, `totalCostUsd`, `durationMs`, `restateInvocationId`, and a JSON `steps` array — sharing the same `traceId` shape as the audit log so a workflow run and its audit events line up.

**Pre-seeded examples** (registered on service boot):

- `emailApprovalDAG` — Linear: Draft (LLM) → Policy Check (API) → Approval Gate → Send (API)
- `parallelChecksDAG` — 3 risk checks fan out in parallel → Aggregate → Decide
- `conditionalRoutingDAG` — Risk evaluation → branch into High-Risk-Approval or Auto-Execute paths → Complete

**Triggers.** A `WorkflowTrigger` row supports `MANUAL`, `SCHEDULED` (cron), `WEBHOOK`, or `EVENT`-based invocation. Manual invocation via Restate is the path wired today; scheduled / webhook / event dispatchers are schema-defined but not yet implemented. Dashboard pages for visualizing workflow executions and a DAG builder are planned — see `specs/015-restate-durable-execution/UI_WORKFLOW_BUILDER.md`.

### 10. LangSmith Observability (Opt-In)

The SDK can mirror every governed LLM call to [LangSmith](https://smith.langchain.com) for prompt-level debugging and trace inspection, without giving up AgentOS's policy / audit / cost layer.

- **Enable per-client.** Pass `langsmith: { apiKey, projectName, baseUrl?, redact?, maxPayloadBytes?, metadataOnly? }` to `new GovernanceClient(...)`. When the block is omitted, the LangSmith code path is never touched (zero overhead).
- **Shared `langsmithRunId`.** The bridge mints a run ID **before** the LLM call. The ID is attached to the AgentOS `llm_call` audit event and also posted to LangSmith — so each audit row deep-links to a specific LangSmith run, and vice versa. The ID is attached even when the call fails, so the link still works on error runs.
- **Pipeline isolation.** The LangSmith bridge has its own `EventBuffer` and `CircuitBreaker`. A LangSmith outage or throttle cannot back-pressure or fail AgentOS audit ingestion.
- **Privacy controls.** `redact` strips configured fields before fanout; `maxPayloadBytes` caps payload size; `metadataOnly: true` sends just timing / model / cost — no prompts or completions.
- **Per-agent toggles in the DB.** `Agent.langsmithEnabled` and `Agent.langsmithProject` let operators selectively enable LangSmith for individual agents without code changes.
- **Dashboard link-out.** `AuditLog.langsmithRunId` is indexed for reverse lookup, and the TraceDrawer renders a "View in LangSmith" badge when a run ID is present.

The full integration plan is in [`docs/plans/LANGSMITH_INTEGRATION_PLAN.md`](docs/plans/LANGSMITH_INTEGRATION_PLAN.md).

### 11. Showcase Agents

To demonstrate the platform, AgentOS ships four end-to-end agents — each one chosen to exercise a different code path of the SDK:

**Email Draft Agent** — `withSpan` hierarchical tracing + Anthropic adapter for the LLM + policy-gated `callTool` for the send action + client-side budget and resilience configured at construction.

**Research Agent** — multi-step workflow with nested spans (`research-workflow` → `search` / `fetch` / `synthesize_report`) and policy-gated tool calls. **The synthesis step uses `streamMessage`**, so iterating the run from a terminal visually demonstrates streaming while `wrapLLMStream` records the final token totals once the stream closes — the streaming path is exercised end-to-end, not just by unit tests.

**Local Email Agent** — uses the generic `wrapLLMCall` with Ollama (a local LLM), proving the SDK works with any HTTP-based model provider without vendor SDKs.

**Multi-Provider Agent** — combines the Anthropic adapter and raw `wrapLLMCall` for different providers within a single governed trace, demonstrating multi-provider workflows under one `traceId`.

All four agents catch denials with `isPolicyDeniedError(err)` (the canonical pattern) instead of inspecting error messages.

**Mock Data Seeder** — generates realistic demo data (3 agents, 50 audit log entries across 7 days, 5 approval tickets) so the dashboard looks populated for demos and development.

---

## The Dashboard

The React dashboard is the primary interface for platform users.

**Login** — email/password authentication. Three roles control what you can see and do.

**Dashboard (home page)** — at-a-glance view with stat cards (total agents, active count, pending approvals, today's cost), an agent health table, and a live event feed that updates in real-time.

**Agent Registry** — browse, search, and filter all registered agents. Register new agents through a guided 3-step form. Click any agent to see its full detail page with traces, approval history, assigned policies, and settings.

**Approval Queue** — two-column layout. Left side shows pending tickets sorted by urgency (most urgent first, pulsing red border if expiring in under 5 minutes). Right side shows recently resolved tickets. Approve or deny with a confirmation dialog. Updates in real-time as new tickets arrive.

**Audit Explorer** — searchable, filterable log of every agent action. Click any row to open a trace drawer showing the full step-by-step timeline of that agent session, including "Failed" badges on errored spans and a "View in LangSmith" link when present. Export to CSV for compliance.

**Analytics** — interactive charts showing cost trends, approval outcomes, model usage, and an agent leaderboard. Selectable time range (7d / 30d / 90d).

**Policies** — read-only view of all governance policies and their rules.

The dashboard supports **dark and light themes** with a toggle in the top bar.

---

## Roles & Permissions

| Role | Can do |
|------|--------|
| **admin** | Everything — register agents, create policies, approve/deny tickets, view analytics, export data, manage settings |
| **approver** | View agents and audit logs, approve/deny tickets, export data |
| **viewer** | Read-only access to agents, audit logs, and analytics |
| **agent** | SDK-only access — used by GovernanceClient for programmatic agent-to-platform communication |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│             React Dashboard (apps/web)              │
│  Login · Dashboard · Agents · Approvals · Audit     │
│  Analytics · Policies                               │
└────────────────────────┬────────────────────────────┘
                         │  HTTP + SSE
┌────────────────────────┼────────────────────────────┐
│           Fastify REST API (apps/api)               │
│                        │                            │
│  Auth · Agents · Audit · Approvals · Policies       │
│  Analytics · Events (SSE) · Showcase                │
│                        │                            │
│  Prisma (PostgreSQL) · BullMQ · Slack               │
└──────┬─────────────────┼──────────────────┬─────────┘
       │                 │                  │
       │ (resolves       │                  │ (HTTP for
       │  approval       │                  │  policy /
       │  promises)      │                  │  approval /
       │                 │                  │  audit ingest)
       ▼                 │                  │
┌─────────────────┐      │      ┌───────────┴─────────┐
│   Restate       │      │      │ GovernanceClient    │
│   Runtime       │      │      │ SDK                 │
└────────┬────────┘      │      │ (packages/          │
         │               │      │  governance-sdk)    │
         │  invokes      │      │                     │
         ▼               │      │ wrapLLMCall,        │
┌──────────────────────┐ │      │ wrapLLMStream,      │
│  Workflow Service    │ │      │ callTool, withSpan, │
│  (apps/workflows)    │ │      │ withTrace,          │
│                      │ │      │ getMetrics          │
│  DAG Engine          │ │      │                     │
│  · llm / api /       │◀┘      │ EventBuffer         │
│    approval /        │        │ CircuitBreaker      │
│    condition /       │        │ SpanManager         │
│    transform /       │        │ LangSmith bridge ◀──┼──▶ LangSmith
│    parallel          │        │   (opt-in fanout)   │      (optional)
│  · DAG validation    │        │                     │
│  · Topological exec  │        │ Adapters: Anthropic,│
│  · Joins + branching │        │   OpenAI, LangChain │
│  · Durable promises  │        └─────────────────────┘
└──────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo |
| Backend | Fastify v4, Prisma v5, PostgreSQL 16 |
| Queue | BullMQ + Redis (optional) |
| Workflow Engine | Restate v1 (durable execution) + custom DAG engine |
| Frontend | React 18, Vite, TailwindCSS, shadcn/ui |
| Server State | TanStack Query v5 |
| Client State | Zustand |
| Charts | Recharts |
| Language | TypeScript (strict mode) |
| Validation | Zod (shared schemas in `packages/types`) |
| Auth | JWT + bcrypt, RBAC |
| Realtime | Server-Sent Events (SSE) |
| AI | Provider-agnostic (Anthropic, OpenAI, Ollama — all optional) |
| Observability | Built-in audit + (opt-in) LangSmith fanout |
| Messaging | Slack Web API |
| Testing | Vitest + Supertest |

---

## Project Structure

```
AgentOS/
├── apps/
│   ├── api/                    # Fastify REST API server
│   │   ├── prisma/             # Database schema (incl. WorkflowDefinition,
│   │   │                       #   WorkflowExecution, WorkflowTrigger),
│   │   │                       #   migrations, seed data
│   │   └── src/
│   │       ├── modules/        # One folder per domain
│   │       │                   #   (agents, approvals, audit, analytics,
│   │       │                   #    policies, events, showcase, users)
│   │       ├── plugins/        # Fastify plugins (auth, DB, SSE, queue, Slack)
│   │       ├── showcase-agents/# Demo agents (email, research, multi-provider, mock)
│   │       └── workers/        # Background job processors
│   ├── web/                    # React dashboard
│   │   └── src/
│   │       ├── components/     # UI components organized by domain
│   │       ├── hooks/          # Data fetching hooks (TanStack Query)
│   │       ├── pages/          # Route pages
│   │       └── store/          # Client state (auth, theme)
│   └── workflows/              # Restate-powered DAG workflow service
│       └── src/
│           ├── workflows/      # dag-engine.ts (level-based parallel exec)
│           ├── executors/      # node-executor.ts, step-executor.ts
│           ├── types/          # workflow-dag.ts (DAG schema),
│           │                   #   workflow-definition.ts (legacy)
│           ├── utils/          # dag-validation, workflow-registry,
│           │                   #   anthropic, agentos-client, cost-calculator
│           ├── examples/       # Pre-seeded DAGs (email approval,
│           │                   #   parallel checks, conditional routing)
│           ├── config/         # env.ts, database.ts, seed.ts
│           └── server.ts       # Restate endpoint entry
├── packages/
│   ├── types/                  # Shared Zod schemas and TypeScript types
│   └── governance-sdk/         # Provider-agnostic SDK
│       └── src/                #   + adapters (anthropic / openai / langchain)
│                               #   + langsmith.ts (opt-in fanout bridge)
├── specs/                      # Feature specs (incl. 015-restate-durable-execution)
└── docs/
    ├── SetUp.md                # Setup guide + API curl reference
    ├── TECHNICAL_DESIGN.md     # Detailed technical design document
    ├── ENHANCEMENTS.md         # Spec-ready reference for in-flight enhancements
    ├── plans/                  # In-flight integration plans (LangSmith, ...)
    └── Reviews/                # Code review notes
```

---

## Getting Started

> Detailed setup instructions, environment variables, and curl examples for every API endpoint are in [`docs/SetUp.md`](docs/SetUp.md).

**Prerequisites**: Node.js 20+, npm 10+, Docker. To use the workflow service you also need a running **Restate** runtime — easiest via Docker.

```bash
docker compose up -d              # Start PostgreSQL (Redis is optional)
npm install                       # Install all dependencies
cd apps/api
npx prisma generate               # Generate Prisma client
npx prisma migrate dev            # Run database migrations
npx prisma db seed                # Seed users, agents, policies
cd ../..
cp apps/web/.env.example apps/web/.env
npm run dev                       # Start API (:3000) + Web (:5173) + Workflows (:9080)
```

Open http://localhost:5173 and sign in as `admin@agentos.dev` / `admin123`.

**To exercise workflows**, also run Restate locally and register the workflows service:

```bash
docker run -d --name restate -p 8080:8080 -p 9070:9070 docker.restate.dev/restatedev/restate
curl -X POST http://localhost:9070/deployments \
  -H 'Content-Type: application/json' \
  -d '{"uri": "http://host.docker.internal:9080", "force": true}'
```

Trigger an example DAG (`emailApprovalDAG` is pre-seeded on boot):

```bash
curl -X POST http://localhost:8080/DAGWorkflowEngine/wf-demo-001/run/send \
  -H 'Content-Type: application/json' \
  -d '{
    "workflowDefinitionId": "email-approval-dag-v1",
    "agentId": "<AGENT_ID>",
    "traceId": "trace-demo",
    "input": { "task": "Draft Q3 follow-up", "recipient": "team@example.com", "riskScore": 0.8 }
  }'
```

---

## Status & Roadmap

**Shipped and in use**

- JWT auth, RBAC, and the agent registry with lifecycle, risk tiers, and rotatable API keys
- Audit trail with hierarchical span trees, `span_failed` tagging, and CSV export
- Policy engine with pre-execution gating (ALLOW / DENY / REQUIRE_APPROVAL)
- Approval workflows with Slack notifications and automatic expiry
- Analytics and cost tracking, including server-side rolling 30-day budgets (HTTP 402)
- Provider-agnostic GovernanceClient SDK — `EventBuffer`, `SpanManager`, per-route `CircuitBreaker`, streaming, typed errors, framework adapters, and `getMetrics()`
- React dashboard (8 pages) with real-time SSE updates and agent health scores
- Showcase agents and mock data seeder
- Durable workflow engine on Restate — DAG validation, topological parallel execution, joins, conditional branching, six node types, durable approval gates, and persisted executions
- LangSmith fanout bridge in the SDK with isolated buffer/breaker, redaction, and dashboard deep-links

**Planned**

- Workflow dashboard pages — definition list, execution timeline visualization, and a DAG builder UI
- REST CRUD over `WorkflowDefinition` / `WorkflowTrigger`, with versioning and RBAC
- Scheduled / webhook / event trigger dispatchers (schema exists; dispatchers do not)
- OpenAI executor for the `llm` workflow node (Anthropic is wired today)
- LangSmith operator controls (per-agent DB toggle enforced by the SDK) and production hardening (isolation load-tests, bridge-breaker alarms, reconciliation worker)

See [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) and the `specs/` directory for the detailed status of in-flight work.

---

## Documentation

| Document | What's inside |
|----------|---------------|
| [`docs/SetUp.md`](docs/SetUp.md) | How to run locally, environment variables, curl examples for every API endpoint |
| [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) | Full technical design — data model, API reference, frontend architecture, security, design principles |
| [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) | Spec-ready reference for in-flight enhancements (durable workflows, LangSmith fanout) |
| `specs/` | Per-feature specifications, implementation plans, research notes, and task checklists |

---

## License

Private — internal use only.
