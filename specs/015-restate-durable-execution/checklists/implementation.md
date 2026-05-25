# Restate Durable Execution - Implementation Checklist

**Feature:** 015-restate-durable-execution  
**Status:** In Progress - Phase 1  
**Started:** 2026-05-25

---

## Phase 1: Foundation ✅ 40% Complete

- [x] T1.1: Add Restate Dependencies (2h) - DONE
- [x] T1.2: Set up Restate Runtime (4h) - DONE (reusing existing container on ports 8091/9070)
- [ ] T1.3: Workflow Service Skeleton (4h) - TODO  
- [ ] T1.4: Database Migration (3h) - TODO
- [ ] T1.5: Dev Environment Deploy (4h) - TODO

**Phase 1 Target:** Week 1-2 (by 2026-06-08)

---

## Phase 2: Core Workflow

- [ ] T2.1: EmailApprovalWorkflow (16h)
- [ ] T2.2: Approval Routes Modification (6h)
- [ ] T2.3: SDK executeWorkflow() (8h)
- [ ] T2.4: Showcase Agent (6h)
- [ ] T2.5: Workflow Tracking Service (8h)
- [ ] T2.6: E2E Testing (12h)

**Phase 2 Target:** Week 3-4

---

## Phase 3: Observability

- [ ] T3.1: Workflow Status API (4h)
- [ ] T3.2: Dashboard Integration (12h)
- [ ] T3.3: SSE Events (4h)
- [ ] T3.4: Restate Metrics (6h)

**Phase 3 Target:** Week 5

---

## Phase 4: Production Hardening

- [ ] T4.1: Retry Policies (6h)
- [ ] T4.2: Idempotency Keys (4h)
- [ ] T4.3: Workflow Cancellation (6h)
- [ ] T4.4: Load Testing (8h)
- [ ] T4.5: Documentation (8h)
- [ ] T4.6: Security Review (6h)

**Phase 4 Target:** Week 6-7

---

## Phase 5: Rollout

- [ ] T5.1: Feature Flag (4h)
- [ ] T5.2: Staging Deploy (8h)
- [ ] T5.3: Canary Rollout (ongoing)
- [ ] T5.4: Full Prod Rollout (ongoing)
- [ ] T5.5: Post-Deploy Monitoring (ongoing)

**Phase 5 Target:** Week 8

---

## Success Criteria

- [ ] Crash recovery verified (99.9% success)
- [ ] 7-day approval wait supported
- [ ] 10,000 concurrent workflows supported
- [ ] Cost reduced by 50x ($0.05/hr → $0.001/hr)
- [ ] Completion rate 95% → 99.9%

---

**Total Effort:** 161 hours across 8 weeks  
**Last Updated:** 2026-05-25

---

## T1.2 Completion Notes

Successfully reused existing container (v1.6.2):
- **Admin API**: `http://localhost:9070`
- **Ingress API**: `http://localhost:8091`
- **Deployment ID**: `dp_13QQKNa2Cy0xaha0HbxSVXj`
- **Network**: Connected via host IP (172.14.2.26)
- **Status**: Verified healthy and accepting workflow service registrations
