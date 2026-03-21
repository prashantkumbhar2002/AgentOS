# API Contracts: Showcase Agents

All endpoints require `Authorization: Bearer <JWT>`.

---

## POST /api/showcase/email-agent/run

**Description**: Trigger the email draft agent to generate an email and request approval to send.

**Auth**: Any authenticated user.

**Request Body**:
```json
{
  "task": "Follow up with the client about the Q2 contract renewal"
}
```

**Response 201** (approval ticket created):
```json
{
  "traceId": "uuid",
  "status": "PENDING",
  "ticketId": "uuid",
  "subject": "Follow-Up: Q2 Contract Renewal",
  "body": "Dear Client,\n\nI wanted to follow up on..."
}
```

**Response 201** (auto-approved by policy):
```json
{
  "traceId": "uuid",
  "status": "AUTO_APPROVED",
  "subject": "Follow-Up: Q2 Contract Renewal",
  "body": "Dear Client,\n\n..."
}
```

**Response 500** (LLM key not configured):
```json
{
  "error": "ANTHROPIC_API_KEY not configured"
}
```

**Notes**:
- The agent does NOT wait for approval resolution — it returns immediately after creating the ticket
- If the policy auto-approves (unlikely at riskScore 0.82), the agent completes the full loop synchronously

---

## POST /api/showcase/research-agent/run

**Description**: Trigger the research agent to search the web, synthesize a report, and request approval to save.

**Auth**: Any authenticated user.

**Request Body**:
```json
{
  "topic": "Latest developments in AI governance frameworks"
}
```

**Response 201**:
```json
{
  "traceId": "uuid",
  "report": "# Research Report: AI Governance Frameworks\n\n## Key Findings\n...",
  "status": "PENDING",
  "ticketId": "uuid"
}
```

**Response 500** (LLM key not configured):
```json
{
  "error": "ANTHROPIC_API_KEY not configured"
}
```

**Notes**:
- The research agent always returns the report content regardless of approval status
- Approval only gates the "save" action, not the report generation itself

---

## POST /api/showcase/mock/seed

**Description**: Seed the platform with mock agents, audit logs, and approval tickets for demo purposes.

**Auth**: Admin only.

**Request Body**: None.

**Response 200**:
```json
{
  "agentsCreated": 3,
  "logsCreated": 50,
  "approvalsCreated": 5
}
```

**Response 200** (second run — idempotent):
```json
{
  "agentsCreated": 0,
  "logsCreated": 0,
  "approvalsCreated": 0
}
```

**Notes**:
- Idempotent: safe to run multiple times
- Creates 3 mock agents if they don't exist
- Creates 50 audit log entries spread across 15 traces and 7 days
- Creates 5 approval tickets (2 APPROVED, 1 DENIED, 2 PENDING)
