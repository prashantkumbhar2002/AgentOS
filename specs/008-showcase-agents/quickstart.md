# Quickstart: Showcase Agents & Mock Data

## Prerequisites

1. API server running at `http://localhost:3000`
2. Database seeded (`npx prisma db seed`)
3. `ANTHROPIC_API_KEY` set in `.env` (required for email + research agents)
4. A valid JWT token:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' | jq -r '.accessToken')
```

## 1. Seed Mock Data (Run First)

```bash
curl -s -X POST http://localhost:3000/api/showcase/mock/seed \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `{ agentsCreated: 3, logsCreated: 50, approvalsCreated: 5 }`

Then verify dashboards have data:
```bash
curl -s http://localhost:3000/api/analytics/costs \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s http://localhost:3000/api/analytics/agents \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 2. Run Email Draft Agent

```bash
curl -s -X POST http://localhost:3000/api/showcase/email-agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"Notify the engineering team about the deployment schedule change"}' | jq
```

Expected: Returns traceId, subject, body, and either a ticketId (PENDING) or AUTO_APPROVED status.

If PENDING, approve the ticket:
```bash
TICKET_ID="<ticketId from response>"
curl -s -X PATCH "http://localhost:3000/api/approvals/$TICKET_ID/decide" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"APPROVED","comment":"Looks good"}' | jq
```

## 3. Run Research Agent

```bash
curl -s -X POST http://localhost:3000/api/showcase/research-agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"AI governance best practices 2026"}' | jq
```

Expected: Returns traceId, report content, and a ticketId for the save action.

## Verification

After running the agents, check audit logs:
```bash
curl -s "http://localhost:3000/api/audit/logs?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {event, agentId, traceId, success}'
```

Check pending approvals:
```bash
curl -s "http://localhost:3000/api/approvals?status=PENDING" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {id, actionType, riskScore, status}'
```
