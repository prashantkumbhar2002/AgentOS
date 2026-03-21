# API Contract: Approval Workflows

## POST /api/approvals

**Auth**: Bearer JWT (any authenticated role)
**Body**: CreateApprovalSchema

```json
{
  "agentId": "uuid",
  "actionType": "send_email",
  "payload": { "to": "external@example.com", "subject": "Report" },
  "riskScore": 0.75,
  "reasoning": "Agent needs to send report to external stakeholder"
}
```

**Response 201** (REQUIRE_APPROVAL):
```json
{ "ticketId": "uuid", "status": "PENDING", "expiresAt": "2026-03-21T13:30:00Z" }
```

**Response 200** (AUTO_APPROVED):
```json
{ "status": "AUTO_APPROVED" }
```

**Response 403** (DENY policy):
```json
{ "error": "Action blocked by policy", "policyName": "Delete Protection" }
```

**Response 400**: Zod validation errors or "Agent not found"
**SSE**: `{ type: "approval.requested", payload: { ticketId, agentId, actionType, riskScore } }`

---

## GET /api/approvals

**Auth**: Bearer JWT
**Query**: ApprovalQuerySchema

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| status | ApprovalStatus | PENDING | Filter by status |
| agentId | UUID | — | Filter by agent |
| page | int | 1 | Pagination |
| limit | int | 20 | Page size (max 100) |

**Response 200**:
```json
{
  "data": [ /* ApprovalTicket[] with agent.name and resolvedBy.name */ ],
  "total": 42,
  "pendingCount": 12,
  "page": 1,
  "limit": 20
}
```

Default sort: `expiresAt ASC` (most urgent first)

---

## GET /api/approvals/:id

**Auth**: Bearer JWT

**Response 200**: Full ApprovalTicket with agent name and resolver details
```json
{
  "id": "uuid",
  "agentId": "uuid",
  "agentName": "Email Draft Agent",
  "actionType": "send_email",
  "payload": {},
  "riskScore": 0.75,
  "reasoning": "...",
  "status": "PENDING",
  "resolvedBy": null,
  "resolvedAt": null,
  "expiresAt": "2026-03-21T13:30:00Z",
  "createdAt": "2026-03-21T13:00:00Z"
}
```

**Response 404**: `{ "error": "Ticket not found" }`

---

## PATCH /api/approvals/:id/decide

**Auth**: Bearer JWT (admin or approver role)
**Body**: ApprovalDecisionSchema

```json
{ "decision": "APPROVED", "comment": "Looks good" }
```

**Response 200**:
```json
{
  "id": "uuid",
  "status": "APPROVED",
  "resolvedBy": { "name": "Platform Admin", "email": "admin@agentos.dev" },
  "resolvedAt": "2026-03-21T13:05:00Z"
}
```

**Response 400**: `{ "error": "Ticket expired" }` or `{ "error": "Ticket already resolved" }`
**Response 403**: `{ "error": "Insufficient permissions" }`
**SSE**: `{ type: "approval.resolved", payload: { ticketId, decision, resolvedBy, agentId } }`
**Audit**: logs `approval_resolved` event for the agent

---

## POST /slack/interactions

**Auth**: Slack signature verification (X-Slack-Signature header)
**Body**: Slack interaction payload (URL-encoded)

Parses action value: `"approve:ticketId"` or `"deny:ticketId"`
Calls same resolution logic as PATCH endpoint.
Updates Slack message to show resolver name and remove buttons.
