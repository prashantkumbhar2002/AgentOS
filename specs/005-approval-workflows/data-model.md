# Data Model: Approval Workflows

## Entities

### ApprovalTicket (existing in schema.prisma)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| agentId | UUID | FK → Agent.id, required | |
| actionType | String | required | e.g., "send_email", "delete_record" |
| payload | JSON | required | Action details for reviewer context |
| riskScore | Float | 0.0–1.0, required | Maps to risk tier labels |
| reasoning | String | required | Agent's justification for the action |
| status | ApprovalStatus | default PENDING | PENDING, APPROVED, DENIED, EXPIRED, AUTO_APPROVED |
| resolvedById | UUID | FK → User.id, nullable | Set on resolution |
| resolvedAt | DateTime | nullable | Set on resolution |
| expiresAt | DateTime | required | 30 minutes from creation |
| slackMsgTs | String | nullable | Slack message timestamp for updates |
| createdAt | DateTime | auto-generated | |

### Relationships

- **ApprovalTicket → Agent**: Many-to-one. Agent name included in Slack notifications.
- **ApprovalTicket → User**: Many-to-one via resolvedById. Resolver identity for audit.

### State Transitions

```
                ┌──────────────────┐
                │     PENDING      │
                └────────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ APPROVED │  │  DENIED  │  │ EXPIRED  │
    └──────────┘  └──────────┘  └──────────┘
    (terminal)    (terminal)    (terminal)
```

- PENDING → APPROVED (by admin/approver via API or Slack)
- PENDING → DENIED (by admin/approver via API or Slack)
- PENDING → EXPIRED (by background job when expiresAt < now)
- AUTO_APPROVED is a creation-time status (never transitions from PENDING)

### Validation Rules

- riskScore: Float between 0.0 and 1.0 inclusive
- agentId: must reference an existing Agent
- resolvedById: must reference an existing User (set server-side from JWT)
- expiresAt: automatically set to `createdAt + 30 minutes`
- status transitions are one-way — no re-opening of resolved/expired tickets

### Risk Tier Labels

| Score Range | Label | Display |
|-------------|-------|---------|
| 0.00–0.39 | LOW | LOW |
| 0.40–0.69 | MEDIUM | MEDIUM |
| 0.70–0.89 | HIGH | HIGH |
| 0.90–1.00 | CRITICAL | CRITICAL |
