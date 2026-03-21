# Research: Policy Engine

## Decision 1: Policy Evaluation Architecture

**Decision**: Implement as a pure async function in `policies.evaluator.ts` that receives a Prisma client, queries policies, and returns the evaluation result. Exposed both as an HTTP endpoint and an importable function.
**Rationale**: A pure function is independently testable with Vitest without Fastify. The approval workflow can import it directly without HTTP overhead.
**Alternatives considered**:
- Middleware-based evaluation — too coupled to Fastify request lifecycle
- Separate microservice — over-engineered for a single evaluator function

## Decision 2: Policy Scope (Agent-Specific vs Global)

**Decision**: A policy is "agent-specific" if it has any entries in the AgentPolicy join table. A policy with zero agent assignments is "global" and applies to all agents. During evaluation, agent-specific policies are loaded first, then global policies.
**Rationale**: The AgentPolicy join table already exists in the Prisma schema. This approach requires no schema changes and gives clear semantics: assign = scoped, unassigned = global.
**Alternatives considered**:
- Explicit `isGlobal` boolean on Policy — redundant with assignment count; adds schema migration
- Separate GlobalPolicy model — unnecessary model duplication

## Decision 3: Condition Matching

**Decision**: Shallow key-value equality between `rule.conditions` (JSON object) and the `context` parameter. For each key in `rule.conditions`, the context must have the same key with the same value. If `rule.conditions` is null or empty, the rule matches unconditionally.
**Rationale**: Simple, predictable, and sufficient for the documented use cases (e.g., `{ recipientType: "external" }`). Complex expression evaluation (regex, ranges, logical operators) is explicitly out of scope.
**Alternatives considered**:
- JSONPath expressions — too complex for v1
- OPA/Rego integration — explicitly out of scope per spec

## Decision 4: Effect Priority Resolution

**Decision**: Collect all matched effects from all active policies, then resolve: DENY wins over REQUIRE_APPROVAL, which wins over ALLOW. If nothing matches, default to REQUIRE_APPROVAL.
**Rationale**: DENY-first is the security-safe default. Matching the user's exact specification for the evaluation algorithm.
**Alternatives considered**:
- First-match-wins — order-dependent and hard to reason about
- Weighted scoring — over-complex for three discrete effects

## Decision 5: Approval Workflow Integration

**Decision**: Replace the stub `evaluatePolicy()` in `approvals.service.ts` with a call to the real `evaluatePolicy()` from `policies.evaluator.ts`. The evaluator receives the Prisma client, agentId, actionType, and derives riskTier from the agent's record. The riskScore from the approval request is mapped to a RiskTier label for policy matching.
**Rationale**: The stub was designed to be replaced. The evaluator function signature aligns with what the approval route already passes.
**Alternatives considered**:
- Keep the stub and add a separate pre-check — would leave dead code and split logic across two files
