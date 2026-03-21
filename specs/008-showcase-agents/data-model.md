# Data Model: Showcase Agents & Mock Data

## No New Entities

This feature introduces **no new Prisma models**. It uses existing tables and the GovernanceClient SDK.

## Agent Registrations (in seed.ts)

### Showcase Agents

| Name | Risk Tier | Environment | Owner Team | Tools |
|------|-----------|-------------|------------|-------|
| Email Draft Agent | HIGH | PROD | platform-demo | send_email, read_inbox |
| Research Agent | MEDIUM | PROD | platform-demo | web_search, web_fetch, save_report |

### Mock Agents

| Name | Risk Tier | Environment | Owner Team | Tools |
|------|-----------|-------------|------------|-------|
| Mock CRM Agent | MEDIUM | DEV | platform-demo | crm_read, crm_write, send_notification |
| Mock Analytics Agent | LOW | DEV | platform-demo | query_db, generate_chart, export_csv |
| Mock Compliance Agent | CRITICAL | DEV | platform-demo | audit_read, flag_record, notify_compliance |

## Mock Data Distributions

### Audit Logs (50 entries)

| Field | Distribution |
|-------|-------------|
| agentId | Evenly across 3 mock agents (~17 each) |
| traceId | 15 random UUIDs (3-4 logs per trace) |
| event | 30% llm_call, 50% tool_call, 10% approval_requested, 10% approval_resolved |
| model | claude-sonnet-4-5 (for llm_call events), null otherwise |
| costUsd | $0.001–$0.05 for llm_call, $0 for tool_call |
| inputTokens | 500–5000 (for llm_call), null otherwise |
| outputTokens | 100–2000 (for llm_call), null otherwise |
| latencyMs | 200–3000 |
| success | 90% true, 10% false |
| createdAt | Random within last 7 days |

### Approval Tickets (5 entries)

| Status | Count | Resolved By | Expires At |
|--------|-------|-------------|------------|
| APPROVED | 2 | Seed admin user | Past |
| DENIED | 1 | Seed admin user | Past |
| PENDING | 2 | — | 2 hours from seed time |

## GovernanceClient Flow (per showcase agent)

```
[API Route] → new GovernanceClient(config)
  → createMessage() → logs llm_call audit event
  → requestApproval() → creates ApprovalTicket, polls until resolved
  → callTool() → logs tool_call audit event
  → logEvent() → logs action_blocked (if denied)
```
