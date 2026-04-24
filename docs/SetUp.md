# AgentOS — AI Agent Governance & Management Platform

Centralized control over autonomous AI agents — register, audit, govern, and visualize. Provider-agnostic SDK v2 with support for any LLM.

## Prerequisites

- **Node.js** 20+ and **npm** 10+
- **Docker** and **Docker Compose** (for PostgreSQL + Redis)

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

Starts PostgreSQL 16 on `:5432` and Redis 7 on `:6379`.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

The API env file is pre-configured at `apps/api/.env`. Create the web env:

```bash
cp apps/web/.env.example apps/web/.env
```

**Environment variables** (`apps/api/.env`):

| Variable | Default | Required |
|----------|---------|----------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/agentos` | Yes |
| `REDIS_URL` | `redis://localhost:6379` | Yes |
| `JWT_SECRET` | (32+ char string) | Yes |
| `JWT_EXPIRES_IN` | `8h` | No |
| `PORT` | `3000` | No |
| `NODE_ENV` | `development` | No |
| `FRONTEND_URL` | `http://localhost:5173` | No |
| `SLACK_BOT_TOKEN` | — | No (Slack integration) |
| `SLACK_SIGNING_SECRET` | — | No (Slack integration) |
| `SLACK_CHANNEL_ID` | — | No (Slack integration) |
| `ANTHROPIC_API_KEY` | — | No (Showcase agents) |
| `SSE_SECRET` | (auto-generated default) | No (SSE token signing, min 32 chars) |

**Environment variables** (`apps/web/.env`):

| Variable | Default | Required |
|----------|---------|----------|
| `VITE_API_URL` | `http://localhost:3000` | Yes |

### 4. Set up the database

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ../..
```

### 5. Run the application

```bash
npm run dev
```

This starts both apps via Turborepo:

| App | URL |
|-----|-----|
| **API** (Fastify) | http://localhost:3000 |
| **Web** (Vite/React) | http://localhost:5173 |

### 6. Log in

Open http://localhost:5173 and use one of the seed accounts:

| Email | Password | Role |
|-------|----------|------|
| `admin@agentos.dev` | `admin123` | admin |
| `approver@agentos.dev` | `approver123` | approver |
| `viewer@agentos.dev` | `viewer123` | viewer |

---

## API Reference (curl)

### Authentication

```bash
# Login — returns accessToken + user object
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}'

# Store token in a variable for subsequent requests
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' | \
  grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Get current user profile
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Agents

```bash
# List all agents
curl -s http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer $TOKEN"

# Get agent by ID
curl -s http://localhost:3000/api/v1/agents/<AGENT_ID> \
  -H "Authorization: Bearer $TOKEN"

# Register a new agent
curl -s -X POST http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent",
    "description": "Test agent",
    "riskTier": "LOW",
    "environment": "DEV",
    "ownerTeam": "platform",
    "llmModel": "claude-sonnet-4-20250514",
    "tools": [{"name": "test_tool", "description": "A test tool"}]
  }'
```

### Approvals

```bash
# List approval tickets (default: PENDING first)
curl -s "http://localhost:3000/api/v1/approvals" \
  -H "Authorization: Bearer $TOKEN"

# Get single ticket
curl -s http://localhost:3000/api/v1/approvals/<TICKET_ID> \
  -H "Authorization: Bearer $TOKEN"

# Approve a ticket
curl -s -X POST http://localhost:3000/api/v1/approvals/<TICKET_ID>/decide \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision": "APPROVED", "comment": "Looks good"}'

# Deny a ticket
curl -s -X POST http://localhost:3000/api/v1/approvals/<TICKET_ID>/decide \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision": "DENIED", "comment": "Too risky"}'
```

### Audit Logs

```bash
# List audit logs (paginated)
curl -s "http://localhost:3000/api/v1/audit/logs?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Get trace details
curl -s http://localhost:3000/api/v1/audit/traces/<TRACE_ID> \
  -H "Authorization: Bearer $TOKEN"

# Get agent-specific audit stats
curl -s http://localhost:3000/api/v1/audit/stats/<AGENT_ID> \
  -H "Authorization: Bearer $TOKEN"

# Export CSV (admin/approver only)
curl -s "http://localhost:3000/api/v1/audit/logs?export=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit-export.csv
```

### Audit Batch (SDK v2)

```bash
# Ingest a batch of audit events (used by SDK EventBuffer)
curl -s -X POST http://localhost:3000/api/v1/audit/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "agentId": "<AGENT_ID>",
        "traceId": "<TRACE_ID>",
        "spanId": "span-001",
        "parentSpanId": null,
        "event": "llm_call",
        "model": "claude-sonnet-4-20250514",
        "costUsd": 0.003,
        "inputTokens": 150,
        "outputTokens": 200,
        "latencyMs": 1200,
        "success": true
      },
      {
        "agentId": "<AGENT_ID>",
        "traceId": "<TRACE_ID>",
        "spanId": "span-002",
        "parentSpanId": "span-001",
        "event": "tool_call",
        "toolName": "send_email",
        "latencyMs": 50,
        "success": true
      }
    ]
  }'
```

### Policies

```bash
# List all policies
curl -s http://localhost:3000/api/v1/policies \
  -H "Authorization: Bearer $TOKEN"

# Create a policy
curl -s -X POST http://localhost:3000/api/v1/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block Deletes",
    "description": "Deny all delete operations for CRITICAL agents",
    "isGlobal": true,
    "priority": 100,
    "rules": [{
      "actionType": "delete_record",
      "riskTiers": ["CRITICAL"],
      "effect": "DENY"
    }]
  }'

# Evaluate a policy (full evaluation with details)
curl -s -X POST http://localhost:3000/api/v1/policies/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "<AGENT_ID>", "actionType": "send_email", "riskTier": "HIGH"}'

# Lightweight policy check (SDK pre-execution gate)
curl -s -X POST http://localhost:3000/api/v1/policies/check \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "<AGENT_ID>", "actionType": "send_email"}'
# Returns: { "effect": "ALLOW" | "DENY" | "REQUIRE_APPROVAL" }
```

### Analytics

```bash
# Cost summary
curl -s "http://localhost:3000/api/v1/analytics/costs" \
  -H "Authorization: Bearer $TOKEN"

# Cost timeline (daily, per agent)
curl -s "http://localhost:3000/api/v1/analytics/costs/timeline?days=7" \
  -H "Authorization: Bearer $TOKEN"

# Usage stats
curl -s "http://localhost:3000/api/v1/analytics/usage" \
  -H "Authorization: Bearer $TOKEN"

# Agent leaderboard
curl -s "http://localhost:3000/api/v1/analytics/agents" \
  -H "Authorization: Bearer $TOKEN"

# Model usage breakdown
curl -s "http://localhost:3000/api/v1/analytics/models" \
  -H "Authorization: Bearer $TOKEN"
```

### Showcase Agents

```bash
# Seed mock data (admin only) — creates 3 mock agents, 50 audit logs, 5 approvals
curl -s -X POST http://localhost:3000/api/v1/showcase/mock/seed \
  -H "Authorization: Bearer $TOKEN"

# Run Email Draft Agent (requires ANTHROPIC_API_KEY)
curl -s -X POST http://localhost:3000/api/v1/showcase/email-agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task": "Send a welcome email to the new engineering team member"}'

# Run Research Agent (requires ANTHROPIC_API_KEY)
curl -s -X POST http://localhost:3000/api/v1/showcase/research-agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Latest developments in AI agent safety"}'

# Run Multi-Provider Agent (demonstrates multiple LLM providers in one trace)
curl -s -X POST http://localhost:3000/api/v1/showcase/multi-provider/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task": "Compare approaches to AI safety"}'
```

### Health Check

```bash
curl -s http://localhost:3000/api/health
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + Web (Turborepo) |
| `npm run build` | Build all packages |
| `npm run test` | Run all Vitest tests |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed database |
| `docker compose up -d` | Start PostgreSQL + Redis |
| `docker compose down` | Stop infrastructure |
| `docker compose down -v` | Stop + delete data volumes |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo |
| **Backend** | Fastify v4, Prisma v5, PostgreSQL 16, BullMQ, Redis |
| **Frontend** | React 18, Vite, TailwindCSS, shadcn/ui, TanStack Query v5, Zustand |
| **Language** | TypeScript (strict mode) |
| **Validation** | Zod |
| **Auth** | JWT + bcrypt |
| **Realtime** | Server-Sent Events (SSE) |
| **Charts** | Recharts |

## Project Structure

```
AgentOS/
├── apps/
│   ├── api/          Fastify REST API
│   └── web/          React Dashboard (SPA)
├── packages/
│   ├── types/        Shared Zod schemas + TypeScript types
│   └── governance-sdk/  Agent-side SDK (GovernanceClient)
├── specs/            Feature specifications
└── docs/             Technical design documentation
```
