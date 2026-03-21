# Quickstart: Policy Engine

## Prerequisites

- PostgreSQL running with migrated schema
- Redis running (for BullMQ)
- API server running (`npm run dev` in apps/api)
- Seed data loaded (`npm run db:seed`)

## 1. Create a Policy

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' \
  | jq -r '.accessToken')

curl -X POST http://localhost:3000/api/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block External Deletes",
    "description": "Deny delete actions for HIGH risk agents",
    "rules": [{
      "actionType": "delete_record",
      "riskTiers": ["HIGH", "CRITICAL"],
      "effect": "DENY"
    }]
  }'
# Returns: { id, name, isActive: true, rules: [...], createdAt }
```

## 2. Assign Policy to an Agent

```bash
POLICY_ID="<from step 1>"
AGENT_ID=$(curl -s http://localhost:3000/api/agents \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.data[0].id')

curl -X POST http://localhost:3000/api/policies/$POLICY_ID/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\": \"$AGENT_ID\"}"
# Returns: { policyId, agentId, assigned: true }
```

## 3. Evaluate a Policy

```bash
curl -X POST http://localhost:3000/api/policies/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"actionType\": \"delete_record\",
    \"riskTier\": \"HIGH\"
  }"
# Returns: { effect: "DENY", matchedRule: {...}, matchedPolicy: {...}, reason: "..." }
```

## 4. List All Policies

```bash
curl "http://localhost:3000/api/policies?isActive=true" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { data: [...], total, page, limit }
```

## 5. Test Integration with Approvals

```bash
# Submit an approval request — if a DENY policy matches, it's blocked
curl -X POST http://localhost:3000/api/approvals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"actionType\": \"delete_record\",
    \"riskScore\": 0.85,
    \"reasoning\": \"Testing policy integration\",
    \"payload\": {}
  }"
# Returns: 403 { error: "Action blocked by policy", policyName: "Block External Deletes" }
```

## Validation Checklist

- [ ] Policy creation returns 201 with rules
- [ ] Evaluate returns DENY for matching DENY rule
- [ ] Evaluate returns ALLOW for matching ALLOW rule
- [ ] Evaluate returns REQUIRE_APPROVAL when no rules match (default)
- [ ] DENY takes precedence over ALLOW when both match
- [ ] Agent-specific policies are evaluated before global ones
- [ ] Inactive policies are skipped during evaluation
- [ ] Deleting a policy with assignments returns 400
- [ ] Approval workflow uses real evaluator (not stub)
