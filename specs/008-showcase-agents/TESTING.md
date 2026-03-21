# Manual Integration Test: Showcase Agents & Mock Data

## Prerequisites

1. API server running at `http://localhost:3000`
2. Database seeded: `cd apps/api && npx prisma db seed`
3. `ANTHROPIC_API_KEY` set in `.env` (required for Steps 3 and 5)

## Step 0: Authenticate

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' | jq -r '.accessToken')

echo "Token: $TOKEN"
```

## Step 1: Run Mock Seeder

```bash
curl -s -X POST http://localhost:3000/api/showcase/mock/seed \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected**:
```json
{
  "agentsCreated": 3,
  "logsCreated": 50,
  "approvalsCreated": 5
}
```

Run again to verify idempotency:
```bash
curl -s -X POST http://localhost:3000/api/showcase/mock/seed \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected** (second run): `agentsCreated: 0, logsCreated: 0, approvalsCreated: 0`

## Step 2: Verify Analytics Populated

```bash
curl -s http://localhost:3000/api/analytics/costs \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s http://localhost:3000/api/analytics/agents \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected**: Non-zero cost values and 3+ agents in leaderboard.

## Step 3: Run Email Agent

> Requires `ANTHROPIC_API_KEY`

```bash
EMAIL_RESULT=$(curl -s -X POST http://localhost:3000/api/showcase/email-agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"Notify the engineering team about the deployment schedule change"}')

echo "$EMAIL_RESULT" | jq

TRACE_ID=$(echo "$EMAIL_RESULT" | jq -r '.traceId')
TICKET_ID=$(echo "$EMAIL_RESULT" | jq -r '.ticketId // empty')
STATUS=$(echo "$EMAIL_RESULT" | jq -r '.status')

echo "TraceId: $TRACE_ID"
echo "TicketId: $TICKET_ID"
echo "Status: $STATUS"
```

**Expected**: Response with `traceId`, `subject`, `body`, and either:
- `status: "PENDING"` + `ticketId` (requires manual approval)
- `status: "AUTO_APPROVED"` (if policy auto-approves)

## Step 4: Verify Audit Trail

```bash
curl -s "http://localhost:3000/api/audit/logs?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq ".data[] | select(.traceId == \"$TRACE_ID\") | {event, traceId, success}"
```

**Expected**: At least 2 entries:
1. `event: "llm_call"` (the email draft)
2. `event: "approval_requested"` or approval-related event

## Step 5: Verify Approval Ticket Created

> Skip if `STATUS` was `AUTO_APPROVED`

```bash
if [ -n "$TICKET_ID" ]; then
  curl -s "http://localhost:3000/api/approvals/$TICKET_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '{id, status, actionType, riskScore}'
fi
```

**Expected**: `status: "PENDING"`, `actionType: "send_email"`

## Step 6: Resolve Ticket

> Skip if `STATUS` was `AUTO_APPROVED`

```bash
if [ -n "$TICKET_ID" ]; then
  curl -s -X PATCH "http://localhost:3000/api/approvals/$TICKET_ID/decide" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"decision":"APPROVED","comment":"Looks good for demo"}' | jq
fi
```

**Expected**: `status: "APPROVED"`

## Step 7: Verify Resolution

```bash
if [ -n "$TICKET_ID" ]; then
  curl -s "http://localhost:3000/api/approvals/$TICKET_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '{id, status, resolvedAt}'
fi
```

**Expected**: `status: "APPROVED"`, `resolvedAt` is set.

## Step 8: Run Research Agent

> Requires `ANTHROPIC_API_KEY`

```bash
curl -s -X POST http://localhost:3000/api/showcase/research-agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"AI governance best practices 2026"}' | jq '{traceId, status, ticketId, reportLength: (.report | length)}'
```

**Expected**: Response with `traceId`, `report` (non-empty string), `status`, and optional `ticketId`.

## Step 9: Check All Audit Logs

```bash
curl -s "http://localhost:3000/api/audit/logs?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {event, agentId, traceId, success, createdAt}'
```

**Expected**: Showcase agent entries visible alongside mock data entries.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 500 "ANTHROPIC_API_KEY not configured" | Missing API key | Set `ANTHROPIC_API_KEY` in `.env` |
| 404 "Email Draft Agent not registered" | DB not seeded | Run `npx prisma db seed` |
| 500 "No admin user found" | Missing admin user | Run `npx prisma db seed` |
| Empty analytics data | Mock seeder not run | POST `/api/showcase/mock/seed` first |
| 401 on any endpoint | Token expired | Re-run Step 0 to get a fresh token |
