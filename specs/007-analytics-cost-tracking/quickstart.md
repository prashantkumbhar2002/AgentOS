# Quickstart: Analytics & Cost Tracking

Manual testing guide using cURL. Assumes the API is running at `http://localhost:3000`.

## Prerequisites

1. API server running with seeded data (agents + audit logs + approval tickets)
2. A valid JWT token (login first):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' | jq -r '.accessToken')
```

## 1. Cost Summary

```bash
# All-time cost summary
curl -s http://localhost:3000/api/analytics/costs \
  -H "Authorization: Bearer $TOKEN" | jq

# With date range
curl -s "http://localhost:3000/api/analytics/costs?fromDate=2026-03-01&toDate=2026-03-21" \
  -H "Authorization: Bearer $TOKEN" | jq

# Invalid date range (should return 400)
curl -s "http://localhost:3000/api/analytics/costs?fromDate=2026-03-21&toDate=2026-03-01" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 2. Cost Timeline

```bash
# Last 30 days (default)
curl -s http://localhost:3000/api/analytics/costs/timeline \
  -H "Authorization: Bearer $TOKEN" | jq

# Last 7 days
curl -s "http://localhost:3000/api/analytics/costs/timeline?days=7" \
  -H "Authorization: Bearer $TOKEN" | jq

# Specific agent, 90 days
curl -s "http://localhost:3000/api/analytics/costs/timeline?days=90&agentId=AGENT_UUID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 3. Usage Statistics

```bash
# All-time usage stats
curl -s http://localhost:3000/api/analytics/usage \
  -H "Authorization: Bearer $TOKEN" | jq

# With date range
curl -s "http://localhost:3000/api/analytics/usage?fromDate=2026-03-01&toDate=2026-03-21" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 4. Agent Leaderboard

```bash
# Top 10 by cost (default)
curl -s http://localhost:3000/api/analytics/agents \
  -H "Authorization: Bearer $TOKEN" | jq

# Top 5 by error rate
curl -s "http://localhost:3000/api/analytics/agents?sortBy=errorRate&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq

# Top 10 by runs
curl -s "http://localhost:3000/api/analytics/agents?sortBy=runs&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 5. Model Usage

```bash
curl -s http://localhost:3000/api/analytics/models \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Verification Checklist

- [ ] Cost summary returns `todayUsd`, `last7dUsd`, `last30dUsd`, `totalUsd`, `changeVs7dAgo`
- [ ] Timeline returns exactly N dates with zero-filled daily costs per agent
- [ ] Usage stats returns run count, LLM/tool call counts, approval breakdown
- [ ] Agent leaderboard sorts correctly by cost, runs, or errorRate
- [ ] Model usage sorted by cost descending, excludes null models
- [ ] All endpoints return zeros/empty arrays on fresh install (no data)
- [ ] Invalid date range returns 400
- [ ] Unauthenticated requests return 401
