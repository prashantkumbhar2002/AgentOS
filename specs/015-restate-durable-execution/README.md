# 015: Restate Durable Execution

**Status:** 🟡 In Progress  
**Priority:** High  
**Started:** 2026-05-25  
**Target:** 2026-07-20 (8 weeks)

---

## Overview

Integrate Restate as the durable execution engine for human-in-the-loop approval workflows, enabling agents to survive crashes and support multi-day approvals.

**Problem:** Current polling approach crashes lose state, limits approvals to 30 minutes, wastes resources.

**Solution:** Restate workflows with automatic crash recovery, unlimited wait times, 100x scalability.

---

## Documents

| File | Purpose |
|------|---------|
| **spec.md** | Complete HLD/LLD architecture (51KB) |
| **plan.md** | Technology choice & decision rationale |
| **tasks.md** | Sprint tasks breakdown (26 tasks, 161h) |
| **quickstart.md** | Developer onboarding guide |
| **checklists/implementation.md** | Phase completion tracking |

---

## Quick Facts

- **Timeline:** 8 weeks (5 phases)
- **Effort:** 161 hours
- **Team:** 2 Backend, 1 Frontend (1wk), 0.5 DevOps
- **Risk:** Low (all risks mitigated)
- **Impact:** 50x cost reduction, 99.9% completion rate

---

## Current Phase

**Phase 1: Foundation** (Week 1-2)
- ✅ T1.1: Dependencies added
- ⏳ T1.2: Restate runtime (next)
- ⏳ T1.3: Workflow skeleton
- ⏳ T1.4: Database migration
- ⏳ T1.5: Dev deployment

---

## Implementation

```bash
# Check current progress
cat checklists/implementation.md

# Read architecture
less spec.md

# Start development
less tasks.md  # See Phase 1 tasks
```

---

**See also:** specs/004-audit-logging, specs/005-approval-workflows
