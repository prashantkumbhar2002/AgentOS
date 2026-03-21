# Quickstart: Approval Workflows

## Prerequisites

- PostgreSQL running with migrated schema
- Redis running (for BullMQ)
- API server running (`npm run dev` in apps/api)
- Seed data loaded (`npm run db:seed`)
- Slack env vars optional (Slack features gracefully disabled without them)

## 1. Create an Approval Ticket

```bash
# Login as admin
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' \
  | jq -r '.accessToken')

# Get an agent ID
AGENT_ID=$(curl -s http://localhost:3000/api/agents \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.data[0].id')

# Create approval request
curl -X POST http://localhost:3000/api/approvals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"actionType\": \"send_email\",
    \"payload\": {\"to\": \"external@example.com\"},
    \"riskScore\": 0.75,
    \"reasoning\": \"Agent needs to send report\"
  }"
# Returns: { ticketId, status: "PENDING", expiresAt }
```

## 2. Poll for Decision (Agent Perspective)

```bash
TICKET_ID="<from step 1>"
curl http://localhost:3000/api/approvals/$TICKET_ID \
  -H "Authorization: Bearer $TOKEN"
# Returns full ticket with status: "PENDING"
```

## 3. Resolve the Ticket

```bash
curl -X PATCH http://localhost:3000/api/approvals/$TICKET_ID/decide \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision": "APPROVED", "comment": "Looks safe"}'
# Returns: { id, status: "APPROVED", resolvedBy, resolvedAt }
```

## 4. List Pending Approvals

```bash
curl "http://localhost:3000/api/approvals?status=PENDING" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { data: [...], total, pendingCount, page, limit }
```

## Validation Checklist

- [ ] Ticket creation returns 201 with PENDING status and expiresAt
- [ ] Polling returns the full ticket object
- [ ] Resolution changes status and records resolver
- [ ] Expired tickets return 400 on resolution attempt
- [ ] Already-resolved tickets return 400 on re-resolution
- [ ] SSE events fire for creation and resolution
- [ ] Viewer role gets 403 on resolution attempt
- [ ] Invalid agentId returns 400
