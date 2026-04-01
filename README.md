# AgentOS

**An AI Agent Governance & Management Platform**

---

## The Problem

Companies are deploying AI agents that autonomously send emails, query databases, call external APIs, and make decisions — often with little oversight. When an agent sends the wrong email to a client, racks up thousands in LLM costs overnight, or deletes production data, there's no audit trail, no approval process, and no way to know what happened until it's too late.

## The Solution

AgentOS sits between your AI agents and the actions they take. Every agent must register with the platform and route its actions through AgentOS. The platform then:

1. **Logs every action** the agent performs — what model it called, what tool it used, how much it cost, whether it succeeded
2. **Checks the action against policies** — should this agent be allowed to send external emails? Should a high-risk agent be able to delete records without approval?
3. **Escalates risky actions to humans** — if a policy says "require approval", the action is paused and a human reviewer is notified via the dashboard and Slack
4. **Tracks all costs and usage** — so teams can see which agents are expensive, which are failing, and where to optimize

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
- **Lifecycle status** — agents move through DRAFT → ACTIVE → SUSPENDED → DEPRECATED

This gives you a single inventory of every AI agent, who owns it, what it can do, and how risky it is.

### 2. Audit Trail

Every action an agent takes is logged:
- **LLM calls** — which model, input/output tokens, cost in USD, latency in ms, success/failure
- **Tool calls** — which tool, inputs, outputs, latency, success/failure
- **Approval events** — when approval was requested, who approved/denied, reasoning

Events are grouped into **traces** (a single agent session). You can filter by agent, event type, date range, or search by trace ID. Admins can export logs as CSV.

### 3. Policy Engine

Policies are rules that govern what agents can and cannot do. Each policy contains rules that match on two things:
- **Action type** — what the agent is trying to do (e.g., `send_email`, `delete_record`, or `*` for any action)
- **Risk tier** — the agent's risk classification

Each rule produces one of three effects:
- **ALLOW** — the action proceeds immediately, no human needed
- **DENY** — the action is blocked outright
- **REQUIRE_APPROVAL** — the action is paused until a human approves or denies it

Policies are evaluated with strict priority: DENY always wins over REQUIRE_APPROVAL, which always wins over ALLOW. If no policy matches, the default is REQUIRE_APPROVAL (safe by default).

Policies can be **global** (apply to all agents) or **assigned to specific agents**.

### 4. Approval Workflows

When a policy requires approval, AgentOS creates a **ticket** containing:
- The agent's name and risk level
- What action it wants to perform
- The full payload (e.g., the email it wants to send)
- A risk score (0.0 to 1.0)
- The agent's reasoning for why it needs to do this

The ticket appears in the **Approval Queue** in the dashboard. Reviewers with the `admin` or `approver` role can approve or deny with an optional comment. Tickets also trigger **Slack notifications** so reviewers don't have to watch the dashboard.

Tickets expire after 30 minutes if nobody responds. A background worker handles expiration automatically.

### 5. Analytics & Cost Tracking

The analytics dashboard answers questions like:
- **How much are we spending?** — cost summary for today, last 7 days, last 30 days, with week-over-week trend
- **Which agents cost the most?** — agent leaderboard sorted by cost, runs, error rate, or latency
- **What's the cost trend?** — daily cost timeline chart broken down by agent
- **What are agents doing?** — total runs, LLM calls vs tool calls, average cost per run
- **How are approvals going?** — pie chart of auto-approved / approved / denied / expired
- **Which models are used?** — call count, token usage, and cost per model

### 6. Real-Time Updates (SSE & Live Activity)

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

### 7. Agent Health Score

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

### 8. Showcase Agents

To demonstrate the platform, AgentOS includes two working agents powered by Claude:

**Email Draft Agent** — receives a task, drafts a professional email using Claude, then requests human approval before "sending" it. Demonstrates the full governance loop: LLM call → policy check → approval → action.

**Research Agent** — receives a topic, uses Claude to plan search queries, searches the web, fetches results, synthesizes a report, then requests approval to save it. Demonstrates multi-step agent workflows with multiple tool calls.

**Mock Data Seeder** — generates realistic demo data (3 agents, 50 audit log entries across 7 days, 5 approval tickets) so the dashboard looks populated for demos and development.

---

## The Dashboard

The React dashboard is the primary interface for platform users.

**Login** — email/password authentication. Three roles control what you can see and do.

**Dashboard (home page)** — at-a-glance view with stat cards (total agents, active count, pending approvals, today's cost), an agent health table, and a live event feed that updates in real-time.

**Agent Registry** — browse, search, and filter all registered agents. Register new agents through a guided 3-step form. Click any agent to see its full detail page with traces, approval history, assigned policies, and settings.

**Approval Queue** — two-column layout. Left side shows pending tickets sorted by urgency (most urgent first, pulsing red border if expiring in under 5 minutes). Right side shows recently resolved tickets. Approve or deny with a confirmation dialog. Updates in real-time as new tickets arrive.

**Audit Explorer** — searchable, filterable log of every agent action. Click any row to open a trace drawer showing the full step-by-step timeline of that agent session. Export to CSV for compliance.

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
┌──────────────────────────────────────────────────┐
│            React Dashboard (apps/web)             │
│  Login · Dashboard · Agents · Approvals · Audit   │
│  Analytics · Policies                             │
└────────────────────────┬─────────────────────────┘
                         │  HTTP + SSE
┌────────────────────────┼─────────────────────────┐
│          Fastify REST API (apps/api)              │
│                        │                          │
│  Auth · Agents · Audit · Approvals · Policies     │
│  Analytics · Showcase                             │
│                        │                          │
│  Prisma (PostgreSQL) · Redis (BullMQ) · Slack     │
└────────────────────────┼─────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────┐
│       GovernanceClient SDK (packages/)             │
│  Used by AI agents to log, request approval,      │
│  call tools, and interact with the platform        │
└───────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo |
| Backend | Fastify v4, Prisma v5, PostgreSQL 16 |
| Queue | BullMQ + Redis |
| Frontend | React 18, Vite, TailwindCSS, shadcn/ui |
| Server State | TanStack Query v5 |
| Client State | Zustand |
| Charts | Recharts |
| Language | TypeScript (strict mode) |
| Validation | Zod (shared schemas in `packages/types`) |
| Auth | JWT + bcrypt, RBAC |
| Realtime | Server-Sent Events (SSE) |
| AI | Anthropic Claude SDK |
| Messaging | Slack Web API |
| Testing | Vitest + Supertest |

---

## Project Structure

```
AgentOS/
├── apps/
│   ├── api/                    # REST API server
│   │   ├── prisma/             # Database schema, migrations, seed data
│   │   └── src/
│   │       ├── modules/        # One folder per domain (agents, approvals, etc.)
│   │       ├── plugins/        # Fastify plugins (auth, DB, SSE, queue, Slack)
│   │       ├── showcase-agents/# Demo agents (email, research, mock)
│   │       └── workers/        # Background job processors
│   └── web/                    # React dashboard
│       └── src/
│           ├── components/     # UI components organized by domain
│           ├── hooks/          # Data fetching hooks (TanStack Query)
│           ├── pages/          # Route pages
│           └── store/          # Client state (auth, theme)
├── packages/
│   ├── types/                  # Shared validation schemas and TypeScript types
│   └── governance-sdk/         # SDK for agents to interact with the platform
├── specs/                      # Feature specifications and task breakdowns
└── docs/
    ├── SetUp.md                # Setup guide + API curl reference
    └── TECHNICAL_DESIGN.md     # Detailed technical design document
```

---

## Getting Started

> Detailed setup instructions, environment variables, and curl examples for every API endpoint are in [`docs/SetUp.md`](docs/SetUp.md).

**Prerequisites**: Node.js 20+, npm 10+, Docker

```bash
docker compose up -d              # Start PostgreSQL + Redis
npm install                       # Install all dependencies
cd apps/api
npx prisma generate               # Generate Prisma client
npx prisma migrate dev             # Run database migrations
npx prisma db seed                 # Seed users, agents, policies
cd ../..
cp apps/web/.env.example apps/web/.env
npm run dev                        # Start API (port 3000) + Dashboard (port 5173)
```

Open http://localhost:5173 and sign in as `admin@agentos.dev` / `admin123`.

---

## Development Roadmap

| EPIC / FIX | Feature | Status |
|------------|---------|--------|
| EPIC 2 | JWT Auth, RBAC, Agent CRUD, Audit Logging | Done |
| EPIC 4 | Approval Workflows + Slack Integration | Done |
| EPIC 5 | Policy Engine | Done |
| EPIC 6 | Analytics & Cost Tracking | Done |
| EPIC 7 | Showcase Agents & Mock Data | Done |
| EPIC 8 | React Dashboard (8 pages) | Done |
| FIX-01 | Repository Pattern + Unit-Testable Business Logic | Done |
| FIX-02 | Custom Error Hierarchy + Global Error Handler | Done |
| FIX-03 | Security Headers + Request ID + SSE Token Fix | Done |
| FIX-04 | Fix N+1 Query Performance | Done |
| FIX-05 | API Versioning (`/api/v1/` prefix) | Done |

---

## Documentation

| Document | What's inside |
|----------|---------------|
| [`docs/SetUp.md`](docs/SetUp.md) | How to run locally, environment variables, curl examples for every API endpoint |
| [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) | Full technical design — data model, API reference, frontend architecture, security, design principles |
| `specs/` | Per-feature specifications, implementation plans, research notes, and task checklists |

---

## License

Private — internal use only.
