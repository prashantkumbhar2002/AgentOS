# Architecture Decision Record: Durable Execution Engine

**Status:** Approved  
**Date:** 2026-05-19  
**Decision Makers:** Tech Lead, Engineering Manager, Principal Engineer  

---

## Context

AgentOS currently uses a **polling-based** approach for human-in-the-loop approval workflows. Agents invoke `callTool()`, which checks policies, creates approval tickets, and then polls every 3 seconds for up to 30 minutes waiting for human decisions.

### Current Limitations

1. **No crash recovery:** If an agent process crashes while waiting for approval, the workflow context is lost
2. **Resource inefficiency:** Agents hold memory/connections while polling
3. **30-minute timeout:** Cannot support overnight/weekend approvals
4. **Manual state management:** Multi-step workflows require custom persistence logic
5. **Scalability limits:** ~100 concurrent workflows max

### Business Impact

- ~5% of agent runs fail due to process crashes during approval waits
- Server costs are high due to long-lived polling connections
- Cannot support business processes requiring >30 min approvals
- Developer velocity is slow (manual state management)

---

## Decision

We will integrate **Restate** as our durable execution engine for agent workflows.

---

## Considered Options

### Option 1: Temporal
**Pros:**
- Industry standard, battle-tested
- Rich ecosystem, mature tooling
- Strong consistency guarantees
- Multi-language support

**Cons:**
- ❌ **Heavy infrastructure:** Requires Cassandra/PostgreSQL + Elasticsearch
- ❌ **Operational complexity:** 4+ services to manage
- ❌ **Go-based:** Our team is TypeScript-native
- ❌ **Steeper learning curve:** Complex concepts (activities, signals, queries)
- ❌ **Resource overhead:** High memory footprint

**Verdict:** Rejected - too heavy for our current scale and team

---

### Option 2: AWS Step Functions
**Pros:**
- Fully managed, no infrastructure
- Tight AWS integration
- Visual workflow designer

**Cons:**
- ❌ **Vendor lock-in:** Cannot run locally or on-prem
- ❌ **Limited flexibility:** JSON-based state machines
- ❌ **Debugging difficulty:** No local execution
- ❌ **Cost:** Expensive at scale ($25 per million state transitions)

**Verdict:** Rejected - vendor lock-in and cost concerns

---

### Option 3: Inngest
**Pros:**
- TypeScript-native
- Simple API, fast onboarding
- Managed offering available

**Cons:**
- ⚠️ **Newer player:** Less mature than Temporal (founded 2022)
- ⚠️ **Managed-first:** Self-hosted option added later
- ⚠️ **Limited control:** Opinionated abstractions

**Verdict:** Strong contender, but less control than Restate

---

### Option 4: Restate ✅ **SELECTED**
**Pros:**
- ✅ **TypeScript-first:** Designed for TS/Node.js workflows
- ✅ **Simple infrastructure:** Single runtime (RocksDB-based)
- ✅ **Lightweight:** <100MB memory per suspended workflow
- ✅ **Excellent DX:** `ctx.run()`, `ctx.promise()`, `ctx.sleep()` primitives
- ✅ **Self-hosted:** Full control, no vendor lock-in
- ✅ **Fast to learn:** Concepts align with our existing async code
- ✅ **Great observability:** Built-in tracing, easy debugging
- ✅ **Deterministic replay:** Automatic crash recovery
- ✅ **HTTP/gRPC:** Works with our existing Fastify API

**Cons:**
- ⚠️ **Newer project:** Founded 2023, less battle-tested than Temporal
- ⚠️ **Smaller ecosystem:** Fewer integrations/tools
- ⚠️ **Community size:** Smaller community than Temporal

**Verdict:** Best fit for AgentOS - balances simplicity, power, and team fit

---

### Option 5: Custom State Machine (Keep Polling, Add Persistence)
**Pros:**
- No new dependencies
- Full control
- Familiar codebase

**Cons:**
- ❌ **High maintenance:** Build and maintain complex state machine
- ❌ **Time investment:** 3-4 months to build properly
- ❌ **Reinventing the wheel:** Solved problem
- ❌ **Opportunity cost:** Engineering time better spent on features

**Verdict:** Rejected - not worth the investment

---

## Comparison Matrix

| Feature | Temporal | AWS Step Fns | Inngest | Restate | Custom |
|---------|----------|--------------|---------|---------|--------|
| **Infrastructure** | Heavy (4+ services) | Managed only | Managed-first | Light (1 service) | Minimal |
| **TypeScript DX** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Learning Curve** | Steep | Medium | Easy | Easy | N/A |
| **Self-Hosted** | ✅ | ❌ | ⚠️ (paid) | ✅ | ✅ |
| **Vendor Lock-in** | None | High | Medium | None | None |
| **Maturity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | N/A |
| **Scalability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Observability** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Cost (self-hosted)** | High | N/A | Medium | Low | Medium |
| **Crash Recovery** | ✅ | ✅ | ✅ | ✅ | ⚠️ (manual) |
| **Local Dev** | ⚠️ (complex) | ❌ | ⚠️ | ✅ | ✅ |

---

## Decision Rationale

### Why Restate Won

1. **Team Fit:** Our team is TypeScript-native. Restate's API feels natural:
   ```typescript
   // This reads like normal async code
   const draft = await ctx.run('draft', () => llm.generate(...));
   const approval = await ctx.promise('approval');
   if (approval === 'APPROVED') {
     await ctx.run('send', () => sendEmail(draft));
   }
   ```

2. **Low Operational Overhead:** Single Docker container vs. Temporal's 4+ services
   - Faster to deploy
   - Easier to debug
   - Lower infrastructure cost

3. **Excellent DX:** 
   - Workflows crash → auto-resume from last checkpoint
   - Deterministic replay → no manual state management
   - Built-in observability → easy debugging

4. **Right Size for Current Scale:**
   - Handles 10,000+ concurrent workflows (our target: 1,000)
   - <100MB per suspended workflow (polling: ~50MB)
   - Can scale horizontally if needed

5. **No Vendor Lock-in:**
   - Self-hosted, open source
   - Can migrate to Temporal later if needed (similar concepts)
   - HTTP/gRPC API means language-agnostic

### Why Not Temporal

While Temporal is more mature, it's **over-engineered for our current needs**:
- We don't need multi-datacenter deployments
- We don't need millions of workflows/day
- We don't need polyglot support
- We **do** need fast onboarding for our small team

**Decision:** Start with Restate. Migrate to Temporal if we outgrow it (unlikely in next 2-3 years).

---

## Implementation Strategy

### Phase 1: Proof of Concept (2 weeks)
- Set up Restate runtime
- Implement email approval workflow
- Validate crash recovery
- **Go/No-Go Decision:** If PoC fails, evaluate Inngest

### Phase 2: Production Rollout (6 weeks)
- Full implementation (see HLD/LLD)
- Gradual rollout with feature flag
- Keep polling as fallback for 2 releases

### Phase 3: Deprecation (2 weeks)
- Remove polling code
- Restate becomes the only path

---

## Success Criteria

| Metric | Before (Polling) | After (Restate) | Timeline |
|--------|-----------------|-----------------|----------|
| Crash recovery rate | 0% | 99.9% | Month 1 |
| Max approval wait time | 30 min | 7 days | Month 1 |
| Concurrent workflows | 100 | 10,000 | Month 3 |
| Resource cost per workflow | $0.05/hr | $0.001/hr | Month 2 |
| Agent execution completion | 95% | 99.9% | Month 2 |

---

## Risks & Mitigation

### Risk 1: Restate Stability in Production
- **Likelihood:** Low (1.3+ is stable)
- **Impact:** High
- **Mitigation:** 
  - Extensive testing in staging
  - Gradual rollout (10% → 50% → 100%)
  - Keep polling fallback for 2 releases
  - Monitor closely, instant rollback capability

### Risk 2: Team Learning Curve
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:**
  - 1-week training period
  - Start with simple workflow
  - Document patterns as we learn
  - Pair programming on first implementation

### Risk 3: Outgrowing Restate
- **Likelihood:** Low (not in next 2-3 years)
- **Impact:** High
- **Mitigation:**
  - Monitor metrics (workflow throughput, latency)
  - Set hard limits (e.g., 5,000 workflows/day)
  - Have migration path to Temporal documented
  - Concepts are similar, code is portable

---

## Alternatives Revisited

We will **re-evaluate this decision** if:
1. Restate proves unstable in production (>3 critical bugs in 6 months)
2. We consistently hit 5,000+ workflows/day (Temporal scale)
3. We need features Restate doesn't support (multi-DC, polyglot)
4. Restate project becomes unmaintained (no releases for 6+ months)

**Re-evaluation Trigger:** Any of the above → Architecture review meeting

---

## Decision Logs

### 2026-05-15: Initial Options Review
- Evaluated 5 options
- Narrowed to Restate vs. Inngest
- **Decision:** Restate (better control, lighter weight)

### 2026-05-17: Technical Spike Completed
- Set up Restate locally
- Implemented test workflow
- Verified crash recovery
- **Outcome:** Meets all requirements ✅

### 2026-05-19: Final Approval
- Reviewed HLD/LLD with team
- Discussed risks and mitigation
- Allocated resources (6 FTE * 8 weeks)
- **Decision:** APPROVED - Proceed with implementation

---

## References

- [Restate Documentation](https://docs.restate.dev/)
- [Restate GitHub](https://github.com/restatedev/restate)
- [Temporal vs. Restate Comparison](https://docs.restate.dev/concepts/durable-execution)
- [AgentOS HLD/LLD](/docs/RESTATE_INTEGRATION_HLD_LLD.md)
- [Task Breakdown](/docs/RESTATE_TASK_BREAKDOWN.md)

---

**Status:** ✅ Approved  
**Next Review:** 2026-11-19 (6 months post-deployment)  