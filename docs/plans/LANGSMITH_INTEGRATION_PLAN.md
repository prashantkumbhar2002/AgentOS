# AgentOS ⇄ LangSmith Integration

> Status: **Draft** · Last updated: 2026-05-01
>
> Companion document that tracks the design and rollout
> for adding LangSmith capabilities to AgentOS without taking a hard
> dependency on it.

---

## Decisions baked in

These are settled; the rest of the document assumes them.

| # | Decision | Notes |
|---|---|---|
| D1 | **Single tenant for v1.** Multi-tenancy is on the roadmap — design must keep the migration path simple. | Single env-var `LANGSMITH_API_KEY` today; per-workspace encrypted keys later (see §5 "Future: multi-tenant"). |
| D2 | **`LANGSMITH_BASE_URL` is configurable from day 1.** | Required because the developer will test against locally-hosted LangSmith. Default is `https://api.smith.langchain.com`. |
| D3 | **Plan lives at `docs/plans/LANGSMITH_INTEGRATION_PLAN.md`.** | Tracked alongside the codebase, updated as phases land. |

---

## 0. Goals & non-goals

**Goals**
- Add LangSmith capabilities to AgentOS without taking a hard dependency on it.
- Preserve AgentOS's runtime control-plane semantics — policy gating, approvals, server-side budgets remain authoritative.
- Cross-link traces in both directions so an operator can pivot from an AgentOS audit row to the LangSmith run, and vice-versa.
- Forward governance verdicts (approve / deny / expire) into LangSmith as feedback, turning ops decisions into eval ground truth.
- Self-hosted-friendly from the start (D2): every integration point works against an on-prem LangSmith.
- Opt-in everywhere; off by default.

**Non-goals**
- Re-implementing LangSmith features (prompt hub, eval datasets, LLM-as-judge) inside AgentOS.
- Making LangSmith required to run AgentOS — the platform must function identically with the integration disabled.
- Mirroring the full LangSmith run-tree shape into our `AuditLog`. We keep our schema; we only cross-reference IDs.

---

## 1. Architecture

```
                          ┌──────────────────────┐
                          │  Agent process       │
                          │  GovernanceClient    │
                          │   ├── wrapLLMCall ───┼── (a) emit AgentOS audit event ─────┐
                          │   ├── callTool      │                                      │
                          │   └── ls.attach()*  │── (b) traceable() → LangSmith ─────┐ │
                          └──────────────────────┘                                   │ │
                                                                                     │ │ 
   AgentOS API (apps/api) ◄────────── (a) audit ingest ──────────────────────────────┘ │
        │                                                                              │
        ├── on approval resolved ─── (c) post feedback to LangSmith ────────────────► LangSmith (Cloud or self-hosted)
        │                                                                              
        └── store langsmithRunId on AuditLog for UI cross-link                          

   * `ls.attach()` is opt-in via constructor option `langsmith: { ... }`
```

Three integration surfaces, ranked by blast radius:

| Surface | Where it lives | Direction | Optional? |
|---|---|---|---|
| (a) **AgentOS audit ingest** | unchanged | SDK → AgentOS API | required — already exists |
| (b) **LangSmith fanout in SDK** | `GovernanceClient.wrapLLMCall` (and `wrapLLMStream`) | SDK → LangSmith | opt-in per agent |
| (c) **Approval → LangSmith feedback** | new worker triggered by `approvals.service.ts` | AgentOS API → LangSmith | opt-in per agent |

This order matters: the platform always works without (b) or (c). They only activate when an agent has LangSmith config attached. AgentOS ingest stays the source of truth for budget enforcement, policy decisions, and audit export.

---

## 2. Phased rollout

| Phase | Outcome | Risk |
|---|---|---|
| **P0 — Prerequisites** | Fix two existing bugs that would corrupt the integration before it ships. | Low |
| **P1 — Cross-link IDs** | Schema fields + dashboard "View in LangSmith" link. No outbound calls yet. | Very low |
| **P2 — Dual callbacks doc'd** | Document LangSmith + LangChain dual tracing. Zero code. | None |
| **P3 — SDK fanout (opt-in)** | `langsmith` constructor option that wraps `wrapLLMCall` with `traceable`. | Medium |
| **P4 — Approval feedback bridge** | Server-side worker posts feedback when an approval resolves. | Medium |
| **P5 — Prompt-version metadata convention** | Documented metadata keys (`promptId`, `promptVersion`) flowing through audit events. | Low |
| **P6 — Operational hardening** | Self-hosted base-URL hygiene, redaction policy, key rotation, runbooks. | Low |

Ship P0–P2 first. They unlock the "works with LangSmith" claim without exposing the platform to a third-party API.

---

## 3. Phase-by-phase work breakdown

### P0 — Prerequisites (don't skip)

These two bugs from `Improvements_todo.md` must be fixed before the integration ships, otherwise the integration *amplifies* their impact.

- **#1 SSE approval stream isn't filtered by `ticketId`** — the agent SSE channel is currently a global firehose. Fix `addClient(reply, { ticketId })` first (`apps/api/src/app.ts` and `apps/api/src/plugins/sse.ts`). Without this, any later SSE-driven LangSmith feedback signal becomes a much bigger leak.
- **Agent-scope sweep.** `assertAgentScope` is called in `audit.routes.ts`, the approval `POST /` and `GET /:id`. Confirm there's no path where an agent token can read another agent's traces. That property must hold before we add LangSmith cross-link columns to the audit table.

### P1 — Cross-link IDs (1 PR)

**Schema** — add to `apps/api/prisma/schema.prisma`:

```prisma
model AuditLog {
  // ...existing fields
  langsmithRunId    String?
  langsmithProject  String?

  @@index([langsmithRunId])
}

model Agent {
  // ...existing fields
  langsmithEnabled  Boolean   @default(false)
  langsmithProject  String?    // logical project name in LangSmith (not the URL)
}
```

Migration name: `20260502000000_add_langsmith_crosslink`. Reversible via column drop.

**Type changes**
- `packages/types`: extend `AuditEventSchema` with optional `langsmithRunId` / `langsmithProject` (max 128 chars, `^[A-Za-z0-9_\-/.]+$` regex to prevent log injection).
- Surface them through `AuditLog` DTOs in `apps/api/src/types/dto.ts`.

**SDK changes** — `packages/governance-sdk/src/GovernanceClient.ts`:
- `LLMCallMetadata` already accepts arbitrary fields. Promote `langsmithRunId` / `langsmithProject` to first-class optional fields and pass them through `logEvent`.

**Dashboard changes** — `apps/web/src/components/audit/TraceDrawer.tsx`:
- For each `llm_call` row that has `langsmithRunId`, render a small badge linking to:
  `${VITE_LANGSMITH_UI_BASE}/o/<org>/projects/p/<encoded-project>/r/<runId>`
- Hide the badge if `VITE_LANGSMITH_UI_BASE` is unset.
- Sanitize anchor: `target="_blank" rel="noopener noreferrer"`.

**Tests**
- Integration: round-trip `langsmithRunId` through `/audit/log` and `/audit/batch`.
- Schema: validate the regex rejects injection attempts (`<script>`, newlines, oversized strings).

### P2 — Dual-callback documentation (no code)

Add a new section to `README.md` (between current sections 3 and 4) and a longer write-up in `docs/INTEGRATIONS-LANGSMITH.md`. Explain:

1. Set `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT` in env (or override `LANGCHAIN_ENDPOINT` for self-hosted — see §5.1 "Local & self-hosted").
2. Register both `LangChainTracer` (LangSmith) and `createLangChainCallback(gov)` (AgentOS) in the LangChain `callbacks` array.
3. Note: cost / tokens will be logged in *both* systems; AgentOS remains authoritative for budget enforcement.

### P3 — SDK fanout (opt-in)

**API surface** — extend `GovernanceClientConfig` in `packages/governance-sdk/src/GovernanceClient.ts`:

```ts
export interface LangSmithConfig {
  apiKey: string;
  projectName: string;
  /** Override for self-hosted LangSmith. Default https://api.smith.langchain.com */
  baseUrl?: string;
  /**
   * Optional redactor applied to inputs/outputs before they leave the
   * process. Receives the raw value, returns a sanitised one. If it
   * returns null/undefined, the field is omitted entirely.
   */
  redact?: (value: unknown) => unknown;
  /** Hard cap on bytes per run sent to LangSmith. Default 64 KB. */
  maxPayloadBytes?: number;
  /** If true, never send inputs/outputs — only metadata (model, tokens, latency). Default false. */
  metadataOnly?: boolean;
}

export interface GovernanceClientConfig {
  // ...
  langsmith?: LangSmithConfig;
}
```

**Implementation** — new file `packages/governance-sdk/src/langsmith.ts`:

- Lazy-load the `langsmith` package, mirroring the `eventsource` lazy-import pattern at the bottom of `GovernanceClient.ts`. List `langsmith` under `peerDependenciesMeta` as optional in `packages/governance-sdk/package.json`.
- Export `createLangSmithBridge(config)` returning `{ wrapTraceable, recordLLM, dispose }`.
- The bridge owns its **own dedicated `EventBuffer` instance** — do not multiplex our existing buffer. A 5xx from LangSmith must not appear to be a 5xx from AgentOS.
- The bridge's flush goes through `fetchWithResilience` against route key `<lsHost>|runs`. The existing `CircuitBreakerRegistry` already keys per host+first-segment, so a flapping LangSmith won't trip the audit breaker.
- Generate the `runId` (UUID v4) **client-side before the run starts** so we can stamp it into the AgentOS audit event even before the LangSmith POST has drained.

**Hook into `wrapLLMCall`** — minimal additive change:

```ts
async wrapLLMCall<T>(fn, metadata) {
  this.checkBudget();
  const start = Date.now();
  const lsRunId = this.ls?.startRun({ name: 'llm_call', traceId: this.traceId });

  try {
    const result = await fn();
    // existing logEvent — now also passes langsmithRunId: lsRunId
    this.ls?.endRun(lsRunId, { outputs: this.maybeRedact(result), metadata: meta });
    return result;
  } catch (err) {
    this.ls?.endRun(lsRunId, { error: err });
    // existing error logEvent — also stamps langsmithRunId
    throw err;
  }
}
```

Symmetric change in `wrapLLMStream`'s `onComplete` path.

**Security around payloads** — see §6.

### P4 — Approval → LangSmith feedback bridge

**Where**: `apps/api/src/modules/approvals/approvals.service.ts::resolveTicket`. The hook fires only **after the DB write commits successfully**.

**Mechanism** — push a job onto BullMQ instead of doing the HTTP call inline:

```ts
// In approvals.service.ts after a successful resolve
if (await this.langsmithEnabledForAgent(ticket.agentId)) {
  await this.langsmithQueue.add('approval-feedback', {
    ticketId: result.id,
    agentId: result.agentId,
    decision: result.status,
    resolvedById: result.resolvedById,
    resolvedAt: result.resolvedAt,
    comment,
  });
}
```

**Worker** — new file `apps/api/src/workers/langsmithFeedbackWorker.ts`:
- Loads the agent's `langsmithProject` and the `LANGSMITH_API_KEY` from env (single-tenant per D1).
- Looks up the corresponding `langsmithRunId` from the most recent `AuditLog` row for `(agentId, traceId)` matching the ticket's `actionType`.
- POSTs `POST {LANGSMITH_BASE_URL}/runs/{runId}/feedback` with body:
  ```json
  {
    "key": "human_approval",
    "score": 1 | 0,
    "value": "APPROVED" | "DENIED" | "EXPIRED",
    "comment": "<optional reviewer comment>",
    "source_info": { "ticketId": "...", "reviewerId": "..." }
  }
  ```
- Retries with backoff via BullMQ (max 5 attempts, jittered). After exhaustion the job moves to `failed` and an `audit.log` event of type `langsmith_feedback_failed` is emitted so the dashboard can surface it.

**Why a queue, not inline**: an inline call would couple `/approvals/:id/decide` latency to LangSmith availability, and a LangSmith outage would propagate to the dashboard. The queue isolates it.

### P5 — Prompt-version metadata convention

Documentation only — no code.

In `docs/INTEGRATIONS-LANGSMITH.md`, document a convention:

```ts
const prompt = await langsmith.pullPrompt('acme/email-draft');
await gov.wrapLLMCall(
  () => anthropic.messages.create({ messages: prompt.format(vars), ... }),
  {
    provider: 'anthropic',
    model,
    inputTokens, outputTokens, costUsd,
    metadata: {
      promptId: 'acme/email-draft',
      promptVersion: prompt.commit_hash,
    },
  }
);
```

These flow into the existing `AuditLog.metadata` JSON column with no schema change. Add a small filter in the dashboard's Audit Explorer for `metadata.promptId`.

### P6 — Operational hardening

- **Configurable base URL** — every LangSmith request goes through `LANGSMITH_BASE_URL` (default `https://api.smith.langchain.com`); validated with `z.string().url()`.
- **Per-agent enable** — the worker posts feedback only when `Agent.langsmithEnabled = true`. Ditto SDK fanout, controlled by whether `langsmith` is passed to that agent's `GovernanceClient` constructor.
- **Egress allow-list** — document the two egress endpoints (LangSmith API + LangSmith UI) for air-gapped deployments.
- **Runbooks** — add `docs/runbooks/langsmith-outage.md`: expected symptoms (SDK keeps working, audit unaffected, feedback queue backs up, dashboard cross-links 404 — none of which should page).

---

## 4. Database changes (consolidated)

| Migration | Purpose | Reversible? |
|---|---|---|
| `add_langsmith_crosslink` | `AuditLog.langsmithRunId/Project` + index, `Agent.langsmithEnabled/Project` | yes (drop columns) |

No data backfill is required — null is the correct value for historical rows. All new columns are nullable or have safe defaults.

The `@@index([langsmithRunId])` is justified by the dashboard's reverse-lookup ("find audit row by LangSmith run id"). If we ever expose `GET /audit/by-langsmith-run/:id`, we'll need it anyway.

---

## 5. Configuration & secret management

**New env vars** (validated in `apps/api/src/config/env.ts`):

```ts
LANGSMITH_API_KEY: z.string().min(20).optional(),
LANGSMITH_BASE_URL: z.string().url().default('https://api.smith.langchain.com'),
LANGSMITH_UI_BASE: z.string().url().default('https://smith.langchain.com'),
LANGSMITH_DEFAULT_PROJECT: z.string().optional(),
LANGSMITH_FEEDBACK_ENABLED: z.coerce.boolean().default(false),
```

**Secret hygiene**
- `LANGSMITH_API_KEY` is **not** logged. Add it to the redaction list in the Pino logger config; verify no error path can echo it.
- It must never appear in any `error.message` body returned by the API. The structured error envelope (v2.2) already rules this out; verify via a regression test.
- Mask it in any future SDK introspection output (`getMetrics()` currently doesn't expose it — keep it that way).

**Frontend env** — `apps/web/.env.example` adds:
```
VITE_LANGSMITH_UI_BASE=https://smith.langchain.com
```
The frontend never sees `LANGSMITH_API_KEY`. The cross-link is an external `<a>` to the LangSmith UI, not an authenticated API call from the browser.

### 5.1 Local & self-hosted setup (per D2)

The developer will be running locally-hosted LangSmith for testing. Document this path explicitly:

```bash
# 1. Start a local LangSmith stack (Docker compose published by LangChain).
#    Suppose it's reachable at http://localhost:1984 (API) and http://localhost:1985 (UI).

# 2. Wire the API
export LANGSMITH_API_KEY=ls_local_test_xxxxxxxxxxxxxxxx
export LANGSMITH_BASE_URL=http://localhost:1984
export LANGSMITH_UI_BASE=http://localhost:1985
export LANGSMITH_DEFAULT_PROJECT=agentos-dev

# 3. Wire the dashboard
echo "VITE_LANGSMITH_UI_BASE=http://localhost:1985" >> apps/web/.env

# 4. Wire the SDK in your test agent
new GovernanceClient({
  ...,
  langsmith: {
    apiKey: 'ls_local_test_xxxxxxxxxxxxxxxx',
    projectName: 'agentos-dev',
    baseUrl: 'http://localhost:1984',
  },
});
```

CI must also exercise this path: a `langsmith-self-hosted` job spins up a mock LangSmith server (in-process Fastify mock) at a non-default `baseUrl` and runs the full integration test suite against it. This guards against any place where the URL is accidentally hardcoded to `api.smith.langchain.com`.

### 5.2 Future: multi-tenant key migration (D1)

Out of scope for v1, but pre-committing the migration shape so we don't paint ourselves into a corner:

1. Introduce a `Workspace` model with an encrypted `langsmithApiKey` column (KMS-backed envelope encryption, not DB-level).
2. Replace the env-var read in the worker and SDK config-loader with a `WorkspaceService.getLangSmithCredentials(workspaceId)` call.
3. Backfill: existing single-tenant deployments are migrated by creating one default workspace and moving the env-var key into it.
4. The current SDK constructor signature already takes the key inline (`langsmith.apiKey`), so the SDK doesn't change — only the API server's secret-resolution layer does.

Keep this in mind when writing the worker: source the key from a single helper so swapping the source later is one-file change.

---

## 6. Security threat model & mitigations

| Threat | Mitigation |
|---|---|
| **PII leakage to LangSmith** | (1) Off by default. (2) `metadataOnly: true` ships zero payload. (3) `redact` callback runs *before* serialisation. (4) `maxPayloadBytes` truncates to 64 KB. (5) Document a default redactor in the integration guide that strips `email`, `password`, `apiKey`, `ssn`, `creditCard` keys. |
| **API-key exfiltration via error logs** | (1) `LANGSMITH_API_KEY` only loaded via `env.ts`, never read from request bodies. (2) Bridge uses `Authorization: Bearer ${apiKey}` which is stripped by Pino's redact list. (3) Test: induce an error during fanout and assert key is absent from logs. |
| **LangSmith outage cascading into AgentOS** | Dedicated `EventBuffer` for LangSmith fanout in the SDK; dedicated BullMQ queue for feedback in the API. Per-host circuit breaker (already exists, just ensure the route key separates LangSmith host from AgentOS host). |
| **Cross-tenant ID smuggling via `langsmithRunId`** | Strict regex on the field (`^[A-Za-z0-9_\-]{36,64}$`), max-length, and only persisted, never echoed back to other tenants in any list endpoint. The "View in LangSmith" link is built in the frontend from `langsmithProject` + `langsmithRunId`; both are agent-scoped on read. |
| **Feedback poisoning** (an attacker forces fake "approved" feedback) | Worker posts feedback only on a successful DB transition `PENDING → APPROVED \| DENIED \| EXPIRED` — same constraints that already protect the approval flow. Queue payload is constructed server-side from the resolved row, never from request input. |
| **`PolicyDeniedError` message leaks LangSmith context** | Already only exposes `actionType` / `reason` / `ticketId` / `kind`. Continue to keep LangSmith run IDs out of error messages. |
| **Server-side fanout fetches with attacker-controlled URL** | Nothing in this design allows that. The base URL is a server-side env var. The frontend cross-link uses `LANGSMITH_UI_BASE` + path-encoded segments via `encodeURIComponent`. |
| **SSE channel leaking LangSmith feedback events** | Don't broadcast `langsmith_feedback_failed` on the agent SSE channel. Use the dashboard SSE channel only, gated by user role. |
| **Local-dev base URL accepts plaintext HTTP** | Allowed only when `NODE_ENV !== 'production'`. In production, validate `LANGSMITH_BASE_URL` starts with `https://`. |

**Compliance bullets**
- Document the LangSmith region used (`us` / `eu`) when on cloud LangSmith.
- For SOC 2 / GDPR sensitivity, customers should self-host LangSmith (D2 keeps this trivially supported) and set `LANGSMITH_BASE_URL` accordingly.
- Provide a "Disable LangSmith" admin action in the Agent Detail page that flips `langsmithEnabled = false` and stops further fanout (existing in-flight runs continue, no new ones).

---

## 7. Quality gates

Each PR must pass:

| Gate | Tool | Coverage target |
|---|---|---|
| **Type check** | `tsc --noEmit` (existing `lint` script in both packages) | strict mode; no `any` introduced. |
| **Unit tests** | Vitest | New SDK bridge module — ≥ 90% line coverage. New worker — branch coverage on retry / exhaust. |
| **Integration tests** | Vitest + Supertest | Round-trip `langsmithRunId` through `/audit/log` and `/audit/batch`. Resolving an approval triggers a feedback queue job (mocked LangSmith). |
| **Schema tests** | Vitest | Reject malformed `langsmithRunId` (XSS, oversized, control chars). |
| **Migration smoke** | `prisma migrate deploy` against ephemeral PG container | Up + down + up (idempotency). |
| **Mutation tests on auth** | Manual review + targeted test | Confirm an agent token cannot read another agent's `langsmithRunId` via any list endpoint. |
| **Bundler check** | `vite build` | Frontend bundle does NOT include any LangSmith SDK code. |
| **SDK install matrix** | CI job | SDK works when `langsmith` peer dep is **absent** (lazy import path). Construct `GovernanceClient` without `langsmith` config and exercise `wrapLLMCall`. |
| **Self-hosted matrix** (D2) | CI job | Run integration tests against an in-process LangSmith mock at a non-default `baseUrl`. |
| **Performance budget** | Bench | `wrapLLMCall` overhead with LangSmith disabled must be < 1 ms p99 vs current. With LangSmith enabled, bridge work runs off the hot path (queued, not awaited). |
| **Security scan** | `npm audit --omit=dev`, `osv-scanner` | No new high / critical advisories. |
| **Lint** | `tsc` + (if added) `eslint` | Zero warnings. |

**Test fixtures**
- New `packages/governance-sdk/src/__fixtures__/langsmith-mock-server.ts` — minimal in-process Fastify mock that replays canned responses. Used by both SDK tests and the API worker test.
- Cross-realm test for `isPolicyDeniedError`: import from two different paths and assert it works on both — the dual-publish issue called out in `Improvements_todo.md` #16.

---

## 8. Observability & ops

**SDK metrics** — extend `gov.getMetrics()` (already exists) with:

```ts
langsmith?: {
  enabled: boolean;
  pending: number;        // events queued in LS bridge buffer
  dropped: number;
  breaker: { isOpen: boolean; failures: number; openedAt: number | null };
  lastFlushMs: number;
}
```

**API metrics** — Prometheus counters in `apps/api`:
- `langsmith_feedback_jobs_total{outcome}` — `success` / `failed` / `retried`
- `langsmith_feedback_latency_seconds` — histogram
- `langsmith_runs_linked_total` — count of audit logs written with non-null `langsmithRunId`

**Dashboard signal** — a small "LangSmith: linked / disconnected" pill on the Agent Detail page. Driven by the latest `langsmith_feedback_*` event for that agent in the last hour.

**Logging** — every outbound LangSmith call gets a `requestId` log line at info, response status at info, full error at warn. Body never logged.

**Alerting** — CRITICAL alert if `langsmith_feedback_jobs_total{outcome="failed"}` > 10 in 15 min and at least one agent has `langsmithEnabled = true`.

---

## 9. Documentation deliverables

| File | New / Updated | Content |
|---|---|---|
| `README.md` | Updated | New "Integrations" section with one paragraph + link to integration guide. |
| `docs/INTEGRATIONS-LANGSMITH.md` | New | End-to-end guide: dual callbacks, SDK opt-in, prompt convention, feedback flow, security caveats, **local & self-hosted setup**. |
| `docs/runbooks/langsmith-outage.md` | New | Symptoms / actions / rollback. |
| `docs/SetUp.md` | Updated | New env vars + frontend env. |
| `docs/TECHNICAL_DESIGN.md` | Updated | New section: "LangSmith integration architecture" with the diagram from §1. |
| `Improvements_todo.md` | Updated | Strike #1 (SSE filter) once P0 is done; add follow-up items uncovered during implementation. |

---

## 10. Risks (decisions D1 + D2 incorporated)

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Cost double-counting in analytics** if a user reads cost from LangSmith and AgentOS together. | Doc that AgentOS is authoritative; LangSmith cost is for dev-loop only. Don't sum across systems. |
| R2 | **`pullPrompt` increases agent startup time** (round-trip to LangSmith on cold start). | Recommend pre-fetching at deploy time and pinning version. |
| R3 | **Self-hosted LangSmith TLS** — internal CAs need `NODE_EXTRA_CA_CERTS`. | Document; don't add custom cert handling. |
| R4 | **LangSmith API contract drift** — they version, we don't pin. | Pin `langsmith` peer dep to a `^x.y` range; weekly CI job runs against `latest` to catch drift. |
| R5 | **Approval → feedback race** — feedback can be posted before the AgentOS audit row commits. | Worker only enqueues *after* DB commit (proposed); worker also tolerates "run not found" and retries with backoff. |
| R6 | **GDPR right-to-erasure** — deleting an AgentOS agent should also purge its LangSmith data. | Add a `DELETE /agents/:id` cascade hook that calls `client.deleteRunsForProject(...)` (or queues it). Out of scope for v1 but documented. |
| R7 | **Ollama / local-only customers** never want this enabled. | Off by default; `LANGSMITH_FEEDBACK_ENABLED=false` is the default. |
| R8 | **Multi-tenant migration accidentally blocked by API design** (D1). | All API-server reads of the LangSmith key go through one helper; SDK takes key inline already, so no SDK change at migration time. |
| R9 | **Local-dev plaintext URL accidentally promoted to prod** (D2). | Production env validation rejects non-`https://` `LANGSMITH_BASE_URL`. |

---

## 11. Acceptance criteria

A reviewer should be able to verify all of:

- [ ] `npm install` and `npm run dev` work with `LANGSMITH_*` env vars **unset**, identical behavior to today.
- [ ] With `LANGSMITH_API_KEY` set, `LANGSMITH_BASE_URL` pointed at a local mock, and an agent's `langsmithEnabled = true`, every `wrapLLMCall` produces (a) an AgentOS audit row with `langsmithRunId`, and (b) a corresponding LangSmith run (verified against a mock server in CI).
- [ ] The dashboard's `TraceDrawer` shows a "View in LangSmith" link for each linked LLM call, opening in a new tab with `rel="noopener noreferrer"`, using `VITE_LANGSMITH_UI_BASE`.
- [ ] Resolving an approval ticket enqueues a `langsmith-feedback` job that, when processed, posts to the LangSmith feedback API with the right `key`, `score`, and `comment`.
- [ ] Killing the LangSmith mock mid-test does **not** affect AgentOS audit writes, approval decisions, or budget enforcement.
- [ ] An agent token attempting to read another agent's audit logs gets `403`, including for newly added LangSmith fields.
- [ ] `npm run lint` and `npm test` are green across all three workspaces.
- [ ] Migration applies cleanly forwards and rolls back cleanly on a fresh DB.
- [ ] New env vars are documented in `docs/SetUp.md` and `apps/api/.env.example` (or wherever the existing pattern lives).
- [ ] CI exercises both default base URL and the **self-hosted base URL path** (D2).
- [ ] No new high / critical advisories in `npm audit`.

---

## 12. Suggested PR slicing

Six small PRs, in order. Each is independently revertable.

1. **`fix: per-ticket SSE filtering on agent stream`** (P0, item #1).
2. **`chore: add LangSmith cross-link columns + indexes`** (P1, schema only, no code path uses them).
3. **`feat(web): "View in LangSmith" link in TraceDrawer behind env flag`** (P1, frontend only).
4. **`feat(sdk): optional LangSmith fanout in wrapLLMCall`** (P3, opt-in, peer dep).
5. **`feat(api): approval → LangSmith feedback worker`** (P4, queue + worker + tests).
6. **`docs: LangSmith integration guide + runbook (incl. local & self-hosted)`** (P2, P5, P6 docs).

Even if PR 4 ships and PR 5 is held, customers get cross-linking without any outbound traffic from the API server.

---

## 13. Tracking

As phases land, update this table and check the corresponding row in §11.

| Phase | PR | Status | Notes |
|---|---|---|---|
| P0 | PR1 | **Done** (2026-05-01) | `fix: per-ticket SSE filtering on agent stream`. Bug deeper than the Improvements_todo.md write-up suggested: token type wasn't bound to the route, and ticket ownership was never verified. Fix moves `/events/*` into a proper module, adds `verifyAgentSseToken` / `verifyUserSseToken` helpers, and verifies `ticket.agentId === token.agentId` server-side. 15 unit + 16 integration tests added; full suite (302 + 50) green. |
| P1 | — | Not started | |
| P2 | — | Not started | |
| P3 | — | Not started | |
| P4 | — | Not started | |
| P5 | — | Not started | |
| P6 | — | Not started | |
