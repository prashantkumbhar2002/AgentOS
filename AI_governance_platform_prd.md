# 🏛️ AI Agent Governance & Management Platform

## Complete Product Requirements Document (Cursor-Ready)

> **Goal:** Build a production-ready AI Agent Governance Platform in 2–3 days using Cursor.
> This document is structured as Cursor prompts + user stories + technical specs.
> Copy each section directly into Cursor as context when building each module.

---

## 📐 Project Overview

**Product Name:** AgentOS — AI Governance & Management Platform
**Problem:** Teams deploying AI agents have no centralized way to register, monitor, control, audit, or govern what those agents do.
**Solution:** A platform that acts as the "control plane" for all AI agents in an organization — visibility, policy enforcement, human-in-the-loop approvals, audit trails, and cost tracking.

---

## 🛠️ Tech Stack (Non-Negotiable)

```
Monorepo:       Turborepo
Language:       TypeScript (strict mode everywhere)
Backend:        Fastify + @fastify/cors + @fastify/jwt
ORM:            Prisma + PostgreSQL
Validation:     Zod (shared schemas between front and back)
Queue:          BullMQ + Redis (ioredis)
Frontend:       React 18 + Vite + TailwindCSS + shadcn/ui
State:          TanStack Query v5 + Zustand
Realtime:       Server-Sent Events (SSE) for live feed
Agent SDK:      Anthropic Node SDK (@anthropic-ai/sdk)
Notifications:  Slack Bolt SDK
Auth:           JWT + bcrypt (email/password, no OAuth for now)
Testing:        Vitest + Supertest
Deployment:     Docker + docker-compose (prod-ready)
Env:            dotenv + zod-based config validation
```

---

## 📁 Monorepo File Structure

```
agentos/
├── apps/
│   ├── api/                         # Fastify backend
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── env.ts           # Zod-validated env config
│   │   │   ├── plugins/
│   │   │   │   ├── prisma.ts        # Prisma plugin
│   │   │   │   ├── redis.ts         # Redis/BullMQ plugin
│   │   │   │   ├── auth.ts          # JWT plugin
│   │   │   │   └── swagger.ts       # API docs
│   │   │   ├── modules/
│   │   │   │   ├── agents/          # Agent registry CRUD
│   │   │   │   ├── audit/           # Audit log querying
│   │   │   │   ├── approvals/       # Approval workflow
│   │   │   │   ├── policies/        # Policy engine
│   │   │   │   ├── users/           # Auth + user mgmt
│   │   │   │   └── analytics/       # Cost + usage stats
│   │   │   ├── tracer/
│   │   │   │   └── GovernanceTracer.ts  # Core middleware
│   │   │   ├── showcase-agents/
│   │   │   │   ├── emailDraftAgent.ts
│   │   │   │   ├── researchAgent.ts
│   │   │   │   └── mockAgent.ts
│   │   │   ├── workers/
│   │   │   │   ├── approvalWorker.ts
│   │   │   │   └── notificationWorker.ts
│   │   │   ├── app.ts               # Fastify app setup
│   │   │   └── server.ts            # Entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                         # React frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx    # Overview + live feed
│       │   │   ├── Agents.tsx       # Agent registry
│       │   │   ├── AgentDetail.tsx  # Single agent + trace
│       │   │   ├── Approvals.tsx    # Approval queue
│       │   │   ├── AuditLog.tsx     # Searchable audit explorer
│       │   │   ├── Policies.tsx     # Policy manager
│       │   │   └── Analytics.tsx    # Cost + usage charts
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   └── TopBar.tsx
│       │   │   ├── agents/
│       │   │   ├── approvals/
│       │   │   └── audit/
│       │   ├── hooks/
│       │   │   ├── useSSE.ts        # Live feed hook
│       │   │   └── useApprovals.ts
│       │   ├── lib/
│       │   │   ├── api.ts           # Axios client
│       │   │   └── queryClient.ts
│       │   └── store/
│       │       └── useAuthStore.ts
│       └── package.json
├── packages/
│   ├── types/                       # Shared Zod schemas + TS types
│   │   └── src/
│   │       ├── agent.ts
│   │       ├── audit.ts
│   │       ├── approval.ts
│   │       └── policy.ts
│   └── governance-sdk/              # npm-publishable middleware
│       └── src/
│           └── GovernanceClient.ts  # What external agents import
├── docker-compose.yml
├── docker-compose.prod.yml
├── turbo.json
└── package.json
```

---

## 🗃️ Database Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum RiskTier {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum Environment {
  DEV
  STAGING
  PROD
}

enum AgentStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  ACTIVE
  SUSPENDED
  DEPRECATED
}

enum ApprovalStatus {
  PENDING
  APPROVED
  DENIED
  EXPIRED
  AUTO_APPROVED
}

enum PolicyEffect {
  ALLOW
  DENY
  REQUIRE_APPROVAL
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  role         String   @default("viewer") // admin | approver | viewer
  createdAt    DateTime @default(now())
  approvals    ApprovalTicket[] @relation("ResolvedBy")
}

model Agent {
  id           String      @id @default(uuid())
  name         String
  description  String
  ownerTeam    String
  llmModel     String
  riskTier     RiskTier
  environment  Environment
  status       AgentStatus @default(DRAFT)
  approvedBy   String?
  tags         String[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  lastActiveAt DateTime?
  tools        AgentTool[]
  auditLogs    AuditLog[]
  approvals    ApprovalTicket[]
  policies     AgentPolicy[]
}

model AgentTool {
  id          String @id @default(uuid())
  agentId     String
  name        String
  description String
  agent       Agent  @relation(fields: [agentId], references: [id])
}

model AuditLog {
  id          String   @id @default(uuid())
  agentId     String
  traceId     String
  event       String   // llm_call | tool_call | approval_requested | action_taken
  model       String?
  toolName    String?
  inputs      Json?
  outputs     Json?
  inputTokens  Int?
  outputTokens Int?
  costUsd     Float?
  latencyMs   Int?
  success     Boolean  @default(true)
  errorMsg    String?
  metadata    Json?
  createdAt   DateTime @default(now())
  agent       Agent    @relation(fields: [agentId], references: [id])

  @@index([agentId])
  @@index([traceId])
  @@index([createdAt])
  @@index([event])
}

model ApprovalTicket {
  id           String         @id @default(uuid())
  agentId      String
  actionType   String
  payload      Json
  riskScore    Float
  reasoning    String
  status       ApprovalStatus @default(PENDING)
  resolvedById String?
  resolvedAt   DateTime?
  expiresAt    DateTime
  slackMsgTs   String?        // for updating Slack message
  createdAt    DateTime       @default(now())
  agent        Agent          @relation(fields: [agentId], references: [id])
  resolvedBy   User?          @relation("ResolvedBy", fields: [resolvedById], references: [id])

  @@index([status])
  @@index([agentId])
}

model Policy {
  id          String       @id @default(uuid())
  name        String
  description String
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  rules       PolicyRule[]
  agents      AgentPolicy[]
}

model PolicyRule {
  id         String       @id @default(uuid())
  policyId   String
  actionType String       // e.g. "send_email", "delete_record", "*"
  riskTiers  RiskTier[]
  effect     PolicyEffect
  conditions Json?        // e.g. { "recipient_domain": "external" }
  policy     Policy       @relation(fields: [policyId], references: [id])
}

model AgentPolicy {
  agentId  String
  policyId String
  agent    Agent  @relation(fields: [agentId], references: [id])
  policy   Policy @relation(fields: [policyId], references: [id])

  @@id([agentId, policyId])
}
```

---

## 📦 Shared Types Package (`packages/types`)

```typescript
// packages/types/src/agent.ts
import { z } from "zod";

export const RiskTierSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const EnvironmentSchema = z.enum(["DEV", "STAGING", "PROD"]);
export const AgentStatusSchema = z.enum([
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED", "DEPRECATED"
]);

export const AgentToolSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(10),
  ownerTeam: z.string(),
  llmModel: z.string(),
  riskTier: RiskTierSchema,
  environment: EnvironmentSchema,
  tools: z.array(AgentToolSchema),
  tags: z.array(z.string()).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type RiskTier = z.infer<typeof RiskTierSchema>;

// packages/types/src/audit.ts
export const AuditQuerySchema = z.object({
  agentId: z.string().optional(),
  traceId: z.string().optional(),
  event: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.number().default(1),
  limit: z.number().max(100).default(50),
});

// packages/types/src/approval.ts
export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "DENIED"]),
  comment: z.string().optional(),
});
```

---

## 🧩 User Stories

---

### EPIC 1: Agent Registry

---

#### US-001 — Register a New Agent

**As a** platform engineer,
**I want to** register a new AI agent with its metadata, tools, and risk tier,
**So that** the platform can govern and track it from day one.

**Acceptance Criteria:**

- POST `/api/agents` accepts `CreateAgentSchema` payload
- Returns created agent with generated `id`
- Agent starts in `DRAFT` status
- Validates that `llmModel` is a non-empty string
- Validates risk tier is one of `LOW | MEDIUM | HIGH | CRITICAL`
- Returns 400 with Zod validation errors on bad input
- Emits SSE event `agent.registered` to connected dashboard clients

**API Contract:**

```
POST /api/agents
Authorization: Bearer <jwt>

Body:
{
  "name": "Email Draft Agent",
  "description": "Drafts and sends emails on behalf of sales team",
  "ownerTeam": "sales-engineering",
  "llmModel": "claude-sonnet-4-5",
  "riskTier": "HIGH",
  "environment": "PROD",
  "tools": [
    { "name": "send_email", "description": "Sends email via SendGrid" },
    { "name": "read_inbox", "description": "Reads Gmail inbox" }
  ],
  "tags": ["email", "sales", "automation"]
}

Response 201:
{
  "id": "uuid",
  "name": "Email Draft Agent",
  "status": "DRAFT",
  "riskTier": "HIGH",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

---

#### US-002 — List All Registered Agents

**As a** platform admin,
**I want to** see all registered agents with filters,
**So that** I have a full inventory of AI agents in the org.

**Acceptance Criteria:**

- GET `/api/agents` returns paginated list
- Supports query params: `status`, `riskTier`, `environment`, `team`, `search`
- Each agent includes: id, name, status, riskTier, ownerTeam, lastActiveAt, tool count
- Default sort: `lastActiveAt DESC`
- Response includes total count for pagination

---

#### US-003 — View Agent Detail

**As a** developer,
**I want to** see full detail of a specific agent including its recent activity,
**So that** I can understand what it's doing and how it's performing.

**Acceptance Criteria:**

- GET `/api/agents/:id` returns full agent object with tools
- Includes last 10 audit log entries
- Includes pending approval tickets
- Includes applied policies
- Includes cost summary: total spend last 7 days, total runs, avg latency

---

#### US-004 — Approve an Agent for Production

**As an** admin,
**I want to** approve a DRAFT agent to move to ACTIVE status,
**So that** only vetted agents can run in production.

**Acceptance Criteria:**

- PATCH `/api/agents/:id/status` accepts `{ status: "APPROVED" | "SUSPENDED" | "DEPRECATED" }`
- Only users with role `admin` or `approver` can change status
- Records `approvedBy: userId` when moving to APPROVED
- Emits SSE event `agent.status_changed`
- Cannot move to PROD environment unless status is APPROVED

---

### EPIC 2: Audit & Observability

---

#### US-005 — Log Every LLM Call

**As the** governance platform,
**I want to** capture every LLM API call made by registered agents,
**So that** I have a complete audit trail of AI reasoning.

**Acceptance Criteria:**

- POST `/api/audit/log` accepts audit event payload
- Stores: agentId, traceId, event type, model, token counts, cost, latency, timestamp
- `costUsd` auto-calculated based on model pricing table
- Returns 201 on success
- Rate limited to 1000 req/min per agentId

**Model Pricing Table (in code):**

```typescript
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-5":    { input: 0.000015, output: 0.000075 },
  "claude-sonnet-4-5":  { input: 0.000003, output: 0.000015 },
  "claude-haiku-4-5":   { input: 0.00000025, output: 0.00000125 },
  "gpt-4o":             { input: 0.0000025, output: 0.00001 },
  "gpt-4o-mini":        { input: 0.00000015, output: 0.0000006 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}
```

---

#### US-006 — Query Audit Logs

**As an** admin or developer,
**I want to** search and filter audit logs,
**So that** I can investigate what an agent did during a specific run.

**Acceptance Criteria:**

- GET `/api/audit/logs` with filters: agentId, traceId, event, fromDate, toDate, page, limit
- Full trace view: GET `/api/audit/traces/:traceId` returns all events in a trace in order
- Results include human-readable cost formatting
- Supports CSV export: GET `/api/audit/logs?export=csv`

---

#### US-007 — Live Activity Feed (SSE)

**As a** dashboard user,
**I want to** see a real-time stream of agent activity,
**So that** I know what's happening across all agents right now.

**Acceptance Criteria:**

- GET `/api/events/stream` opens an SSE connection
- Emits events: `agent.registered`, `agent.status_changed`, `audit.log`, `approval.requested`, `approval.resolved`
- Each SSE event is JSON with `{ type, payload, timestamp }`
- Heartbeat ping every 30 seconds to keep connection alive
- Frontend `useSSE` hook reconnects automatically on disconnect

---

### EPIC 3: Approval Workflows

---

#### US-008 — Agent Requests Approval

**As an** AI agent,
**I want to** pause and request human approval before performing a risky action,
**So that** humans stay in control of high-stakes decisions.

**Acceptance Criteria:**

- POST `/api/approvals` creates a new approval ticket
- Payload includes: agentId, actionType, payload, reasoning, riskScore (0.0–1.0)
- Ticket expires after 30 minutes if unresolved → auto-denied
- Sends Slack notification to `#agent-approvals` channel with approve/deny buttons
- Returns ticket ID immediately — agent polls GET `/api/approvals/:id` for status
- Emits SSE event `approval.requested`

**Slack Message Format:**

```
🤖 Agent Action Requires Approval

Agent:   Email Draft Agent (email-agent-001)
Action:  send_email
Risk:    ████████░░ HIGH (0.82)
Reason:  Agent wants to send email to external recipient (client@company.com)

Payload:
  To: client@company.com
  Subject: Q4 Proposal Follow-up
  Preview: "Hi Sarah, following up on our proposal..."

⏰ Expires in 30 minutes

[✅ Approve]  [❌ Deny]
```

---

#### US-009 — Resolve an Approval (Dashboard)

**As an** approver,
**I want to** approve or deny pending agent actions from the dashboard,
**So that** I can quickly review and act on what agents want to do.

**Acceptance Criteria:**

- PATCH `/api/approvals/:id/decide` accepts `{ decision: "APPROVED" | "DENIED", comment? }`
- Only users with role `admin` or `approver` can resolve
- Resolving updates ticket status + sets resolvedBy + resolvedAt
- Expired tickets cannot be resolved (return 400)
- Emits SSE event `approval.resolved`
- Updates the Slack message to show resolved status + who resolved it

---

#### US-010 — Auto-Approve Low Risk Actions

**As the** platform,
**I want to** automatically approve actions that match auto-approve policies,
**So that** agents aren't bottlenecked on low-risk routine tasks.

**Acceptance Criteria:**

- Before creating a ticket, evaluate applicable policies
- If matching policy has effect `ALLOW` → auto-approve, skip ticket creation
- If matching policy has effect `DENY` → block immediately, return 403
- If matching policy has effect `REQUIRE_APPROVAL` OR no policy → create ticket
- Log the policy decision in audit logs

---

### EPIC 4: Policy Engine

---

#### US-011 — Create a Governance Policy

**As an** admin,
**I want to** define rules that control what agents can and cannot do,
**So that** governance is systematic and not manual.

**Acceptance Criteria:**

- POST `/api/policies` creates a new policy with rules
- A rule specifies: actionType, riskTiers it applies to, effect (ALLOW/DENY/REQUIRE_APPROVAL), optional conditions
- Policy can be assigned to specific agents or apply globally (no agentId)
- Policy can be toggled active/inactive without deletion

**Example Policy Payload:**

```json
{
  "name": "External Email Approval Required",
  "description": "All emails to external domains must be approved",
  "rules": [
    {
      "actionType": "send_email",
      "riskTiers": ["MEDIUM", "HIGH", "CRITICAL"],
      "effect": "REQUIRE_APPROVAL",
      "conditions": { "recipientDomain": "external" }
    }
  ]
}
```

---

#### US-012 — Evaluate Policies for an Action

**As the** platform,
**I want to** evaluate all applicable policies when an agent wants to act,
**So that** the right effect is applied consistently.

**Policy Evaluation Logic (implement exactly this):**

```typescript
// Priority order: Agent-specific policy > Global policy > Default (REQUIRE_APPROVAL)
// If multiple rules match → most restrictive wins: DENY > REQUIRE_APPROVAL > ALLOW

export async function evaluatePolicy(
  agentId: string,
  actionType: string,
  riskTier: RiskTier,
  context: Record<string, unknown>
): Promise<PolicyEffect> {
  const policies = await getApplicablePolicies(agentId);
  const matchingEffects: PolicyEffect[] = [];

  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (ruleMatches(rule, actionType, riskTier, context)) {
        matchingEffects.push(rule.effect);
      }
    }
  }

  if (matchingEffects.includes("DENY")) return "DENY";
  if (matchingEffects.includes("REQUIRE_APPROVAL")) return "REQUIRE_APPROVAL";
  if (matchingEffects.includes("ALLOW")) return "ALLOW";
  return "REQUIRE_APPROVAL"; // safe default
}
```

---

### EPIC 5: Analytics & Cost Tracking

---

#### US-013 — View Cost Analytics

**As an** admin,
**I want to** see LLM cost broken down by agent and over time,
**So that** I can track AI spend and identify expensive agents.

**Acceptance Criteria:**

- GET `/api/analytics/costs` returns: total spend (today, 7d, 30d), per-agent breakdown, per-model breakdown
- GET `/api/analytics/costs?agentId=xxx` returns cost timeline for one agent
- GET `/api/analytics/usage` returns: total runs, total actions, approval rate, auto-approve rate, deny rate
- All monetary values returned in USD with 6 decimal precision

---

#### US-014 — Agent Health Overview

**As an** admin,
**I want to** see a health status for each agent,
**So that** I can quickly spot failing or expensive agents.

**Health Score Algorithm:**

```typescript
function calculateHealthScore(agent: AgentWithStats): number {
  const errorRate = agent.failedCalls / (agent.totalCalls || 1);
  const approvalDenyRate = agent.deniedApprovals / (agent.totalApprovals || 1);
  const avgLatencyScore = Math.max(0, 1 - (agent.avgLatencyMs / 10000));

  return Math.round(
    ((1 - errorRate) * 0.4 +
    (1 - approvalDenyRate) * 0.3 +
    avgLatencyScore * 0.3) * 100
  );
}
// Returns 0-100. <50 = unhealthy, 50-80 = warning, 80+ = healthy
```

---

### EPIC 6: Showcase Agents

---

#### US-015 — Email Draft Agent (Showcase)

**As a** demo user,
**I want to** trigger an email draft agent that goes through the full governance loop,
**So that** I can see how approvals and audit trails work end-to-end.

**Agent Flow:**

```
1. Receive task: "Follow up with client about proposal"
2. [AUDIT LOG] LLM call → draft email
3. [POLICY CHECK] send_email to external → REQUIRE_APPROVAL
4. [APPROVAL TICKET] Created → Slack notification sent
5. [WAIT] Poll for decision
6. If APPROVED → [AUDIT LOG] tool_call: send_email → done
7. If DENIED  → [AUDIT LOG] action_blocked → done
```

**API to trigger it:**

```
POST /api/showcase/email-agent/run
Body: { "task": "Follow up with Acme Corp about the Q4 proposal" }
Response: { "traceId": "uuid", "status": "awaiting_approval", "ticketId": "uuid" }
```

---

#### US-016 — Research Agent (Showcase)

**As a** demo user,
**I want to** trigger a web research agent that logs all its steps,
**So that** I can see a full multi-step audit trace in the dashboard.

**Agent Flow:**

```
1. Receive task: "Research recent trends in AI governance"
2. [AUDIT LOG] LLM call → decide search queries
3. [AUDIT LOG] tool_call: web_search (query 1)
4. [AUDIT LOG] tool_call: web_search (query 2)
5. [AUDIT LOG] tool_call: web_fetch (url)
6. [AUDIT LOG] LLM call → synthesize findings
7. [POLICY CHECK] save_report → ALLOW (low risk)
8. [AUDIT LOG] tool_call: save_report → done
Return: { "traceId": "uuid", "summary": "..." }
```

---

#### US-017 — Mock Agent Runner (Bulk Demo Data)

**As a** developer,
**I want to** seed the platform with realistic mock agent activity,
**So that** dashboards look real during demos and UI development.

**Acceptance Criteria:**

- POST `/api/showcase/mock/seed` triggers mock agent runs
- Creates 3 mock agents if they don't exist
- Simulates 50 audit log entries across random trace IDs
- Simulates 5 resolved approval tickets (mix of approved/denied)
- Simulates 2 pending approval tickets
- Returns `{ agentsCreated, logsCreated, approvalsCreated }`

---

### EPIC 7: Auth & User Management

---

#### US-018 — User Login

**As a** user,
**I want to** log in with email and password,
**So that** I can access the governance dashboard securely.

**Acceptance Criteria:**

- POST `/api/auth/login` accepts `{ email, password }`
- Returns `{ accessToken, user: { id, name, email, role } }` on success
- JWT expires in 8 hours
- Returns 401 on bad credentials (same message for unknown email and wrong password)
- Rate limited to 10 attempts per IP per 15 minutes

---

#### US-019 — Seed Default Admin User

**Acceptance Criteria:**

- `prisma/seed.ts` creates admin user: `admin@agentos.dev` / `admin123`
- Creates approver user: `approver@agentos.dev` / `approver123`
- Creates 3 sample policies (external email, delete protection, data export)
- Creates 2 sample agents in ACTIVE state

---

## 🖥️ Frontend Pages & Components

---

### Page 1 — Dashboard (`/`)

**Layout:** Two-column. Left: stats cards + agent health table. Right: live activity feed.

**Components:**

- `<StatsBar>` — Total agents, active agents, pending approvals, today's cost (USD)
- `<AgentHealthTable>` — Agents with health score badge, last active, risk tier color
- `<LiveFeed>` — SSE-connected event stream, auto-scrolling, color-coded by event type
- `<PendingApprovals>` — Count badge + quick link to approvals page

---

### Page 2 — Agent Registry (`/agents`)

**Layout:** Full-width table with filter sidebar.

**Components:**

- `<AgentFilters>` — Status, risk tier, environment, team dropdowns + search input
- `<AgentTable>` — Sortable columns: name, status badge, risk tier, owner, tools count, last active, cost 7d
- `<RegisterAgentModal>` — Multi-step form: basic info → tools → risk assessment → confirm
- `<AgentStatusBadge>` — Color-coded: DRAFT=gray, APPROVED=blue, ACTIVE=green, SUSPENDED=red

---

### Page 3 — Agent Detail (`/agents/:id`)

**Layout:** Header with agent info + tabs.

**Tabs:**

- `Overview` — Stats cards, tool list, assigned policies
- `Audit Trace` — Timeline view of all events in a trace, grouped by traceId
- `Approvals` — History of all approval tickets for this agent
- `Settings` — Edit agent metadata, change status

---

### Page 4 — Approval Queue (`/approvals`)

**Layout:** Split: pending queue (left, urgent) + resolved history (right).

**Components:**

- `<ApprovalCard>` — Agent name, action type, risk score bar, reasoning, payload preview, time remaining, Approve/Deny buttons
- `<ApprovalHistory>` — Table of resolved approvals with who resolved + when
- `<RiskScoreBar>` — Visual 0–100 bar, red above 70, yellow 40–70, green below 40

**UX Rules:**

- Tickets expiring in < 5 minutes show pulsing red timer
- Approve/Deny requires confirmation dialog showing full payload
- After decision, card animates out, shows success toast

---

### Page 5 — Audit Explorer (`/audit`)

**Layout:** Full-width with filter bar + trace timeline.

**Components:**

- `<AuditFilters>` — Agent, event type, date range, trace ID search
- `<AuditTable>` — Timestamp, agent, event type icon, tool/model, tokens, cost, latency, success badge
- `<TraceDrawer>` — Slide-in panel showing full trace timeline when clicking a trace ID
- `<CostBadge>` — Shows USD cost in green (low) to red (high) based on amount

---

### Page 6 — Policy Manager (`/policies`)

**Layout:** List of policies on left, rule editor on right.

**Components:**

- `<PolicyList>` — Toggle active/inactive, click to edit, delete
- `<PolicyRuleEditor>` — Visual rule builder: action type input, risk tier checkboxes, effect radio, conditions JSON editor
- `<PolicyAssignment>` — Search agents, assign/unassign policy

---

### Page 7 — Analytics (`/analytics`)

**Layout:** Stats header + charts.

**Components:**

- `<CostLineChart>` — Daily cost last 30 days, per-agent breakdown (recharts)
- `<AgentCostTable>` — Sortable by total cost, avg cost per run, token usage
- `<ApprovalRateChart>` — Pie: auto-approved / approved / denied
- `<ModelUsageChart>` — Bar chart: calls + cost by model

---

## 🚀 GovernanceTracer SDK

This is the core piece external agents import to connect to your platform.

```typescript
// packages/governance-sdk/src/GovernanceClient.ts

import Anthropic from "@anthropic-ai/sdk";

interface GovernanceClientConfig {
  platformUrl: string;     // e.g. https://agentos.yourdomain.com
  agentId: string;
  apiKey: string;
}

export class GovernanceClient {
  private config: GovernanceClientConfig;
  private anthropic: Anthropic;
  private traceId: string;

  constructor(config: GovernanceClientConfig) {
    this.config = config;
    this.anthropic = new Anthropic();
    this.traceId = crypto.randomUUID();
  }

  // Wraps Anthropic messages.create with automatic audit logging
  async createMessage(params: Anthropic.MessageCreateParams) {
    const start = Date.now();
    const response = await this.anthropic.messages.create(params);

    await this.logEvent({
      event: "llm_call",
      model: params.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - start,
    });

    return response;
  }

  // Wraps any tool call with audit logging
  async callTool<T>(
    toolName: string,
    inputs: unknown,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    let success = true;
    try {
      const result = await fn();
      return result;
    } catch (err) {
      success = false;
      throw err;
    } finally {
      await this.logEvent({
        event: "tool_call",
        toolName,
        inputs,
        success,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Request human approval before a risky action
  async requestApproval(params: {
    actionType: string;
    payload: unknown;
    reasoning: string;
    riskScore: number; // 0.0 - 1.0
  }): Promise<"APPROVED" | "DENIED"> {
    const res = await fetch(`${this.config.platformUrl}/api/approvals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ ...params, agentId: this.config.agentId }),
    });
    const { ticketId } = await res.json();

    // Poll for decision
    return this.pollForDecision(ticketId);
  }

  private async pollForDecision(
    ticketId: string,
    intervalMs = 3000,
    maxAttempts = 600 // 30 minutes
  ): Promise<"APPROVED" | "DENIED"> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const res = await fetch(
        `${this.config.platformUrl}/api/approvals/${ticketId}`,
        { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
      );
      const ticket = await res.json();
      if (ticket.status !== "PENDING") return ticket.status;
    }
    return "DENIED"; // timeout
  }

  private async logEvent(payload: Record<string, unknown>) {
    await fetch(`${this.config.platformUrl}/api/audit/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        agentId: this.config.agentId,
        traceId: this.traceId,
        ...payload,
      }),
    });
  }
}
```

---

## ⚙️ Environment Variables

```env
# apps/api/.env

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentos"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="your-super-secret-jwt-key-change-in-prod"
JWT_EXPIRES_IN="8h"

# Anthropic (for showcase agents)
ANTHROPIC_API_KEY="sk-ant-..."

# Slack (optional but recommended)
SLACK_BOT_TOKEN="xoxb-..."
SLACK_APPROVAL_CHANNEL="#agent-approvals"

# App
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
PLATFORM_URL="http://localhost:3000"
```

---

## 🐳 Docker Compose (Production-Ready)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agentos
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/agentos
      REDIS_URL: redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: sh -c "npx prisma migrate deploy && node dist/server.js"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      VITE_API_URL: http://localhost:3000
    ports:
      - "5173:80"
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

---

## 📅 2–3 Day Build Plan

### Day 1 — Backend Core

```
Morning:
  ✅ Scaffold Turborepo + install all deps
  ✅ Set up Prisma schema + run migrations
  ✅ Fastify app with JWT auth plugin
  ✅ US-018: Login endpoint
  ✅ US-019: Seed script

Afternoon:
  ✅ US-001: POST /api/agents
  ✅ US-002: GET /api/agents (with filters)
  ✅ US-003: GET /api/agents/:id
  ✅ US-004: PATCH /api/agents/:id/status
  ✅ US-005: POST /api/audit/log
  ✅ US-006: GET /api/audit/logs
  ✅ US-007: GET /api/events/stream (SSE)

Evening:
  ✅ US-008: POST /api/approvals (with Slack notification)
  ✅ US-009: PATCH /api/approvals/:id/decide
  ✅ US-010: Policy evaluation in approval flow
  ✅ Docker-compose up and running
```

### Day 2 — Policies + Showcase Agents + Analytics

```
Morning:
  ✅ US-011: POST /api/policies
  ✅ US-012: Policy evaluation engine
  ✅ US-013: GET /api/analytics/costs
  ✅ US-014: Health score calculation

Afternoon:
  ✅ US-015: Email Draft Agent (showcase)
  ✅ US-016: Research Agent (showcase)
  ✅ US-017: Mock seed endpoint
  ✅ GovernanceClient SDK (packages/governance-sdk)

Evening:
  ✅ Connect showcase agents through GovernanceClient
  ✅ End-to-end test: trigger email agent → get Slack notif → approve → see audit trail
```

### Day 3 — Frontend + Polish

```
Morning:
  ✅ Vite + React + shadcn/ui setup
  ✅ Auth pages (login)
  ✅ Sidebar layout
  ✅ Dashboard page (stats + live feed)
  ✅ Agent Registry page + RegisterAgentModal

Afternoon:
  ✅ Agent Detail page (tabs)
  ✅ Approval Queue page (cards + approve/deny)
  ✅ Audit Explorer page

Evening:
  ✅ Policy Manager page
  ✅ Analytics page with charts
  ✅ Final docker-compose build
  ✅ README with setup instructions
```

---

## 🎯 Cursor Usage Tips

**When starting each module, give Cursor this context block:**

```
Context for Cursor:
- Monorepo: Turborepo
- Backend: Fastify + Prisma + PostgreSQL + BullMQ + Redis
- Language: TypeScript strict
- Validation: Zod (all inputs/outputs)
- Auth: JWT via @fastify/jwt
- Frontend: React 18 + Vite + TailwindCSS + shadcn/ui + TanStack Query
- Shared types in: packages/types/src/

Now build: [paste the user story here]
Follow the exact API contracts defined. Use Prisma for all DB access.
Return proper HTTP status codes. Add Zod validation on all routes.
```

**Effective Cursor prompts per phase:**

- For routes: *"Build the Fastify route for US-008. Follow the API contract exactly. Include Zod validation, error handling, and emit the SSE event."*
- For frontend: *"Build the ApprovalCard component for the approval queue page. Use shadcn/ui Card, Button components. Show risk score bar, reasoning, payload preview, and approve/deny buttons with confirmation dialog."*
- For agents: *"Build the emailDraftAgent showcase using GovernanceClient. Follow the agent flow in US-015 exactly."*

---

## ✅ Production Readiness Checklist

- All env vars validated with Zod on startup (crash fast if missing)
- Fastify rate limiting on all public endpoints
- JWT auth middleware on all protected routes
- Prisma migrations in CI/CD (not `db push`)
- BullMQ workers handle failures with retry + dead letter queue
- SSE connections cleaned up on client disconnect
- All API responses typed with shared Zod schemas
- Docker multi-stage build (dev deps excluded from prod image)
- Health check endpoint: GET `/api/health` → `{ status: "ok", db: "ok", redis: "ok" }`
- Structured JSON logging (pino, built into Fastify)
- CORS restricted to `FRONTEND_URL` in production
- Approval tickets cleaned up after 7 days (BullMQ scheduled job)
- README with: setup, env vars, seed command, docker-compose instructions

