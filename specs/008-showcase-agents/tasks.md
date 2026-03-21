# Tasks: Showcase Agents & Mock Data

**Input**: Design documents from `/specs/008-showcase-agents/`
**Prerequisites**: spec.md, plan.md, contracts/, data-model.md, research.md
**Organization**: Tasks grouped by phase with clear dependencies. Each task completable in one focused session.

## Format: `T7.[number] — [file] — [description]`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions

---

## Phase 1: SDK Verification + Environment Config

**Purpose**: Verify GovernanceClient SDK works against local API. Add ANTHROPIC_API_KEY to env config.

- [ ] T7.01 — `packages/governance-sdk/src/GovernanceClient.ts` + `apps/api/src/config/env.ts` — Verify GovernanceClient SDK methods (`logEvent`, `createMessage`, `callTool`, `requestApproval`) are fully implemented and compile. Add `ANTHROPIC_API_KEY: z.string().optional()` to the EnvSchema in `apps/api/src/config/env.ts`. Verify the SDK exports are correct in `packages/governance-sdk/package.json` and `packages/governance-sdk/src/index.ts`. Run `npx tsc --noEmit` on the SDK package to confirm it compiles.

**Checkpoint**: SDK ready, ANTHROPIC_API_KEY available in env config.

---

## Phase 2: Showcase Agents

**Purpose**: Implement the two Claude-powered showcase agents. Pure functions — no Fastify dependency.

- [ ] T7.02 — `apps/api/src/showcase-agents/emailDraftAgent.ts` — Implement the full email draft agent flow (5 steps): (1) receive task string, (2) call `GovernanceClient.createMessage()` with system prompt "You are an email writing assistant. Draft professional emails." and user prompt "Draft an email for this task: {task}", model "claude-sonnet-4-5", max_tokens 1024, (3) extract subject and body from LLM response text (parse first line as subject, rest as body), (4) call `GovernanceClient.requestApproval()` with actionType "send_email", payload { subject, body, recipientType: "external" }, reasoning "Agent wants to send email to external recipient", riskScore 0.82, pollIntervalMs 2000, maxWaitMs 30000, (5) if APPROVED/AUTO_APPROVED → call `GovernanceClient.callTool("send_email", { subject, body }, fn)` where fn logs to console; if DENIED → call `GovernanceClient.logEvent({ event: "action_blocked", ... })`. Export `runEmailDraftAgent(config: GovernanceClientConfig, task: string)` returning `{ traceId, status, ticketId?, subject, body }`. Guard: check `process.env.ANTHROPIC_API_KEY` at the start, throw if missing.
  - **Depends on**: T7.01 (SDK verification)

- [ ] T7.03 — `apps/api/src/showcase-agents/researchAgent.ts` — Implement the full research agent flow (8 steps): (1) receive topic string, (2) call `GovernanceClient.createMessage()` with system prompt "You are a research assistant. Plan searches for the given topic. Return exactly 2 search queries, one per line." and user prompt topic, parse response into 2 query strings, (3) call `GovernanceClient.createMessage()` for query 1 with tools `[{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]`, wrap in `GovernanceClient.callTool("web_search", { query: query1 }, fn)` for audit logging, (4) same for query 2, (5) call `GovernanceClient.callTool("web_fetch", { url }, fn)` — extract URL from search results, fetch top result via GovernanceClient.createMessage with web_search tool, (6) call `GovernanceClient.createMessage()` to synthesize findings: system "Synthesize search results into a structured research report with sections: Key Findings, Details, Sources", (7) call `GovernanceClient.requestApproval()` with actionType "save_report", riskScore 0.35, payload { reportLength: report.length }, reasoning "Agent wants to save research report to shared storage", (8) if APPROVED → call `GovernanceClient.callTool("save_report", { report }, fn)` (fn returns report text); if DENIED → return report without saving. Export `runResearchAgent(config: GovernanceClientConfig, topic: string)` returning `{ traceId, report, status, ticketId? }`. Guard: check `process.env.ANTHROPIC_API_KEY`. Handle web search failures gracefully — catch errors, log with `GovernanceClient.callTool` (which logs success: false on throw), continue with partial data.
  - **Depends on**: T7.01 (SDK verification)

**Checkpoint**: Both showcase agents implemented. No routes yet.

---

## Phase 3: Mock Data Generator

**Purpose**: Implement mock data seeder. Pure Prisma operations — no LLM calls.

- [ ] T7.04 [P] — `apps/api/src/showcase-agents/mockAgent.ts` — Implement mock data generator with 3 functions: (1) `createMockAgents(prisma)` — create 3 mock agents (Mock CRM Agent/MEDIUM, Mock Analytics Agent/LOW, Mock Compliance Agent/CRITICAL) using `prisma.agent.findFirst` + create pattern for idempotency, each with ownerTeam "platform-demo", environment DEV, status ACTIVE, and their respective tools via AgentTool. Return array of agent IDs and count of newly created. (2) `createMockLogs(prisma, agentIds, count=50)` — generate 50 AuditLog entries: generate 15 random traceIds, distribute events (30% llm_call with model "claude-sonnet-4-5" + realistic tokens/cost, 50% tool_call with toolName from agent's tools, 10% approval_requested, 10% approval_resolved), random timestamps over last 7 days, 90% success rate, latencyMs 200-3000. Check existing log count per agent first — skip if enough exist. (3) `createMockApprovals(prisma, agentIds, adminUserId)` — create 5 ApprovalTickets: 2 APPROVED with resolvedById=adminUserId and resolvedAt in past, 1 DENIED with resolvedById=adminUserId, 2 PENDING with expiresAt=2hrs from now. Check existing count first — skip if 5+ exist. Export `seedMockData(prisma)` that orchestrates all 3, finds admin user, and returns `{ agentsCreated, logsCreated, approvalsCreated }`.
  - **Depends on**: T7.01 (env config)

**Checkpoint**: Mock seeder ready. No routes yet.

---

## Phase 4: Routes + Registration

**Purpose**: Create showcase routes and register in app.ts. Update seed.ts with all 5 agents.

- [ ] T7.05 — `apps/api/src/modules/showcase/showcase.routes.ts` + `apps/api/src/modules/showcase/showcase.schema.ts` + `apps/api/src/app.ts` — Create schema file with `EmailAgentInputSchema ({ task: z.string().min(1) })`, `ResearchAgentInputSchema ({ topic: z.string().min(1) })`. Create routes file with: `POST /email-agent/run` (authenticate, validate body, call `runEmailDraftAgent` with GovernanceClientConfig built from env + user JWT + agent ID lookup, return 201), `POST /research-agent/run` (authenticate, validate body, call `runResearchAgent`, return 201), `POST /mock/seed` (requireRole admin, call `seedMockData(fastify.prisma)`, return 200). All routes catch ANTHROPIC_API_KEY errors → 500. Register in app.ts with prefix `/api/showcase`.
  - **Depends on**: T7.02, T7.03, T7.04 (all agents)

- [ ] T7.06 — `apps/api/prisma/seed.ts` — Update seed.ts to register all 5 showcase/mock agents. Add `seedShowcaseAgents()` function that creates: (1) Email Draft Agent — name "Email Draft Agent", description "Drafts and sends emails on behalf of users", ownerTeam "platform-demo", llmModel "claude-sonnet-4-5", riskTier HIGH, environment PROD, status ACTIVE, tags ["email","showcase","demo"], tools [send_email, read_inbox], (2) Research Agent — name "Research Agent", description "Researches topics using web search and synthesizes reports", ownerTeam "platform-demo", llmModel "claude-sonnet-4-5", riskTier MEDIUM, environment PROD, status ACTIVE, tags ["research","showcase","demo"], tools [web_search, web_fetch, save_report]. Update existing `seedAgents()` to use the new descriptions and ownerTeam "platform-demo". Add 3 mock agents: Mock CRM Agent, Mock Analytics Agent, Mock Compliance Agent (same definitions as T7.04 but using upsert pattern). Call `seedShowcaseAgents()` from main(). Assign "External Email Approval" policy to the Email Draft Agent via AgentPolicy.
  - **Depends on**: T7.01

**Checkpoint**: All routes operational, all agents registered in seed.

---

## Phase 5: Manual Integration Test Documentation

**Purpose**: Document the end-to-end integration test with cURL commands.

- [ ] T7.07 — `specs/008-showcase-agents/TESTING.md` — Create manual integration test document with step-by-step cURL commands: (0) Prerequisites — API running, DB seeded, ANTHROPIC_API_KEY set, login to get $TOKEN. (1) Run mock seeder — POST /api/showcase/mock/seed, verify response shows counts. (2) Verify analytics populated — GET /api/analytics/costs, GET /api/analytics/agents. (3) Run email agent — POST /api/showcase/email-agent/run with task string, capture traceId and ticketId. (4) Verify audit trail — GET /api/audit/logs?traceId={traceId}, expect 2+ entries (llm_call + approval request). (5) Verify approval ticket created — GET /api/approvals/{ticketId}, expect PENDING status. (6) Resolve ticket — PATCH /api/approvals/{ticketId}/decide with APPROVED. (7) Verify resolution — GET /api/approvals/{ticketId}, expect APPROVED status. (8) Run research agent — POST /api/showcase/research-agent/run with topic, verify report returned. (9) Check all audit logs — GET /api/audit/logs, verify showcase entries visible.
  - **Depends on**: T7.05 (all routes)

**Checkpoint**: Full EPIC 7 complete with documented test procedures.

---

## Dependencies & Execution Order

### Dependency Graph

```
T7.01 ──┬──> T7.02 ──┐
        ├──> T7.03 ──┤──> T7.05 ──> T7.07
        ├──> T7.04 ──┘
        └──> T7.06
```

### Parallel Opportunities

- **Batch 1** (no deps): T7.01 (SDK verification + env config)
- **Batch 2** (after T7.01): T7.02, T7.03, T7.04, T7.06 — all in parallel
- **Batch 3** (after T7.02 + T7.03 + T7.04): T7.05 (routes)
- **Batch 4** (after T7.05): T7.07 (test documentation)

### Strictly Sequential Chains

1. T7.01 → T7.02 → T7.05 → T7.07
2. T7.01 → T7.03 → T7.05
3. T7.01 → T7.04 → T7.05
4. T7.01 → T7.06 (independent)

### Key Flags

- **T7.02 + T7.03 require ANTHROPIC_API_KEY** — they make real LLM calls.
- **T7.04 is pure DB simulation** — no LLM calls, no external dependencies.
- **T7.05 routes** must catch missing ANTHROPIC_API_KEY and return 500.
- **T7.06 seed.ts** must be idempotent — uses findFirst + create or upsert.
- **T7.07 is documentation only** — no code, just cURL commands.
- **Email agent does NOT wait for approval resolution** by default — it returns PENDING immediately. The user's spec says "agent waits up to 30 min" but for the route handler we use a short poll (maxWaitMs: 30000 = 30 seconds) to avoid HTTP timeout.

---

## Summary

- **Total tasks**: 7
- **Parallelizable batches**: 4
- **MVP scope**: T7.01, T7.04, T7.05, T7.06 (mock seeder + routes — no LLM needed)
- **Full scope**: All 7 tasks (requires ANTHROPIC_API_KEY)
- **New dependency**: None (GovernanceClient SDK and @anthropic-ai/sdk already installed)
- **Constitution compliance**: TypeScript strict, Zod validation, Prisma-only, JWT auth, RBAC on mock seed
- **No new Prisma models**: All data uses existing Agent, AuditLog, ApprovalTicket tables

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- T7.02 and T7.03 can only be live-tested with a real ANTHROPIC_API_KEY
- T7.04 mock seeder is the most demo-critical — it populates all dashboards
- T7.07 is documentation, not automated tests — because showcase agents make real LLM calls
