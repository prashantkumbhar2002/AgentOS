# API Contract: Policy Engine

## POST /api/policies

**Auth**: Bearer JWT (admin only)
**Body**: CreatePolicySchema

```json
{
  "name": "Delete Protection",
  "description": "Block delete actions on HIGH/CRITICAL agents",
  "rules": [
    {
      "actionType": "delete_record",
      "riskTiers": ["HIGH", "CRITICAL"],
      "effect": "DENY",
      "conditions": null
    }
  ]
}
```

**Response 201**:
```json
{
  "id": "uuid",
  "name": "Delete Protection",
  "description": "Block delete actions on HIGH/CRITICAL agents",
  "isActive": true,
  "rules": [
    {
      "id": "uuid",
      "actionType": "delete_record",
      "riskTiers": ["HIGH", "CRITICAL"],
      "effect": "DENY",
      "conditions": null
    }
  ],
  "createdAt": "2026-03-21T13:00:00Z"
}
```

**Response 400**: Zod validation errors or `{ "error": "Policy name already exists" }`
**Response 403**: `{ "error": "Insufficient permissions" }`

---

## GET /api/policies

**Auth**: Bearer JWT (any role)
**Query**: PolicyListQuerySchema

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| isActive | boolean | — | Filter by active status |
| page | int | 1 | Pagination |
| limit | int | 20 | Page size (max 100) |

**Response 200**:
```json
{
  "data": [ /* Policy[] with rules */ ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

## GET /api/policies/:id

**Auth**: Bearer JWT (any role)

**Response 200**: Full Policy with rules and assigned agent IDs
```json
{
  "id": "uuid",
  "name": "Delete Protection",
  "description": "...",
  "isActive": true,
  "rules": [ /* PolicyRule[] */ ],
  "agents": [ { "agentId": "uuid", "agentName": "Email Agent" } ],
  "createdAt": "2026-03-21T13:00:00Z"
}
```

**Response 404**: `{ "error": "Policy not found" }`

---

## PATCH /api/policies/:id

**Auth**: Bearer JWT (admin only)
**Body**: UpdatePolicySchema

```json
{ "isActive": false }
```

**Response 200**: Updated policy object
**Response 404**: `{ "error": "Policy not found" }`

---

## DELETE /api/policies/:id

**Auth**: Bearer JWT (admin only)

**Response 200**: `{ "id": "uuid", "deleted": true }`
**Response 400**: `{ "error": "Cannot delete policy assigned to 3 agents. Unassign first." }`
**Response 404**: `{ "error": "Policy not found" }`

---

## POST /api/policies/:id/assign

**Auth**: Bearer JWT (admin only)
**Body**: `{ "agentId": "uuid" }`

**Response 200**: `{ "policyId": "uuid", "agentId": "uuid", "assigned": true }`
**Response 400**: `{ "error": "Policy already assigned to this agent" }`
**Response 404**: `{ "error": "Policy not found" }` or `{ "error": "Agent not found" }`

---

## DELETE /api/policies/:id/assign/:agentId

**Auth**: Bearer JWT (admin only)

**Response 200**: `{ "policyId": "uuid", "agentId": "uuid", "unassigned": true }`
**Response 404**: `{ "error": "Assignment not found" }`

---

## POST /api/policies/evaluate

**Auth**: Bearer JWT (any role)
**Body**: PolicyEvaluationRequestSchema

```json
{
  "agentId": "uuid",
  "actionType": "send_email",
  "riskTier": "HIGH",
  "context": { "recipientType": "external" }
}
```

**Response 200**: PolicyEvaluationResultSchema
```json
{
  "effect": "REQUIRE_APPROVAL",
  "matchedRule": {
    "id": "uuid",
    "actionType": "send_email",
    "riskTiers": ["MEDIUM", "HIGH", "CRITICAL"],
    "effect": "REQUIRE_APPROVAL",
    "conditions": { "recipientType": "external" }
  },
  "matchedPolicy": {
    "id": "uuid",
    "name": "External Email Approval Required"
  },
  "reason": "Approval required by policy: External Email Approval Required"
}
```

**Response 404**: `{ "error": "Agent not found" }`
