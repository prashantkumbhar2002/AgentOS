# Data Model: Policy Engine

## Entities

### Policy (existing in schema.prisma)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| name | String | unique, required | e.g., "Delete Protection" |
| description | String | required | Human-readable purpose |
| isActive | Boolean | default true | Inactive policies are skipped during evaluation |
| createdAt | DateTime | auto-generated | |
| rules | PolicyRule[] | one-to-many | |
| agents | AgentPolicy[] | many-to-many via join | |

### PolicyRule (existing in schema.prisma)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| policyId | UUID | FK → Policy.id, required | |
| actionType | String | required | "*" matches all actions |
| riskTiers | RiskTier[] | array | Empty array matches all tiers |
| effect | PolicyEffect | required | ALLOW, DENY, or REQUIRE_APPROVAL |
| conditions | JSON | nullable | Shallow key-value matching against context |

### AgentPolicy (existing in schema.prisma)

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| agentId | UUID | FK → Agent.id, part of composite PK | |
| policyId | UUID | FK → Policy.id, part of composite PK | |

### Relationships

- **Policy → PolicyRule**: One-to-many. A policy contains zero or more rules.
- **Policy → Agent**: Many-to-many via AgentPolicy. A policy with assignments is agent-specific; without assignments, it's global.

### Policy Scope Logic

```
IF policy has AgentPolicy entries → agent-specific (only applies to those agents)
IF policy has zero AgentPolicy entries → global (applies to all agents)
```

### Evaluation Flow

```
evaluatePolicy(agentId, actionType, riskTier, context)
  │
  ├─ Load agent-specific policies (AgentPolicy WHERE agentId)
  ├─ Load global policies (Policy WHERE NOT EXISTS AgentPolicy)
  │
  ├─ For each active policy:
  │    For each rule:
  │      IF ruleMatches(actionType, riskTier, context) → collect effect
  │
  ├─ Priority resolution:
  │    DENY found? → return DENY
  │    REQUIRE_APPROVAL found? → return REQUIRE_APPROVAL
  │    ALLOW found? → return ALLOW
  │    Nothing matched? → return REQUIRE_APPROVAL (safe default)
  │
  └─ Return { effect, matchedRule?, matchedPolicy?, reason }
```

### Condition Matching

Shallow key-value equality:
- For each key `k` in `rule.conditions`:
  - `context[k]` must equal `rule.conditions[k]`
- If `rule.conditions` is null or `{}`, the rule matches unconditionally
