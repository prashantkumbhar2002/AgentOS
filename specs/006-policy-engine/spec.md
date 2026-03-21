# Feature Specification: Policy Engine

**Feature Branch**: `002-jwt-auth-rbac`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "EPIC 5 — Policy Engine"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Creates a Governance Policy (Priority: P1)

An administrator defines a governance policy to control what AI agents can do. The admin provides a policy name, description, and one or more rules. Each rule specifies an action type (e.g., "send_email", "delete_record", or wildcard "*"), the risk tiers it applies to, the governing effect (ALLOW, DENY, or REQUIRE_APPROVAL), and optional conditions. Once created, the policy is immediately active and begins governing agent actions that match its rules.

**Why this priority**: Without the ability to create policies, the entire policy engine is non-functional. This is the foundational capability that all other stories depend on.

**Independent Test**: Can be fully tested by creating a policy with multiple rules via the API and verifying it is persisted with all rules, is marked active, and can be retrieved.

**Acceptance Scenarios**:

1. **Given** an admin user, **When** they create a policy with valid name, description, and rules, **Then** a policy is created with status active and all rules are persisted, returning a 201 status.
2. **Given** a policy name that already exists, **When** an admin attempts to create a duplicate, **Then** the system returns 400 with "Policy name already exists".
3. **Given** a non-admin user, **When** they attempt to create a policy, **Then** the system returns 403 "Insufficient permissions".
4. **Given** an empty rules array, **When** an admin creates the policy, **Then** it is created successfully (a policy with no rules never matches anything).

---

### User Story 2 - Platform Evaluates Policies for an Agent Action (Priority: P1)

Before an AI agent performs a governed action, the platform evaluates all applicable policies. The evaluator loads agent-specific policies first (policies explicitly assigned to the agent), then global policies (policies not assigned to any specific agent). For each active policy, it checks whether any rules match the requested action type, risk tier, and context. Matched effects are prioritized: DENY takes precedence over REQUIRE_APPROVAL, which takes precedence over ALLOW. If no policy matches, the default is REQUIRE_APPROVAL (safe default). The evaluation result includes the governing effect, the matched rule and policy (if any), and a human-readable reason.

**Why this priority**: Policy evaluation is the core intelligence of the engine. Without it, policies exist but have no effect. This also replaces the stub `evaluatePolicy()` in the approval workflow (EPIC 4), connecting the two systems.

**Independent Test**: Can be tested by creating policies with different rules, assigning some to specific agents, then calling the evaluation endpoint with various action types, risk tiers, and contexts to verify correct effect resolution and priority ordering.

**Acceptance Scenarios**:

1. **Given** a DENY rule matching the action, **When** the evaluator runs, **Then** it returns effect DENY with the matched policy name in the reason.
2. **Given** both a DENY and an ALLOW rule matching, **When** the evaluator runs, **Then** DENY takes precedence.
3. **Given** only a REQUIRE_APPROVAL rule matching, **When** the evaluator runs, **Then** it returns REQUIRE_APPROVAL with the matched policy and rule.
4. **Given** only an ALLOW rule matching, **When** the evaluator runs, **Then** it returns ALLOW with the matched policy and rule.
5. **Given** no matching rules across all policies, **When** the evaluator runs, **Then** it returns REQUIRE_APPROVAL with reason "No matching policy — default to require approval".
6. **Given** agent-specific and global policies with conflicting rules, **When** the evaluator runs, **Then** agent-specific policies are evaluated before global ones.
7. **Given** a non-existent agent ID, **When** the evaluator is called, **Then** it returns 404 "Agent not found".

---

### User Story 3 - Admin Manages Policy Lifecycle (Priority: P2)

An administrator can view all policies, view a single policy with its rules, update a policy's name, description, or active status, and delete a policy. Listing supports filtering by active status and pagination. Deleting a policy is only allowed if no agents are currently assigned to it; otherwise the system returns an error indicating how many agents must be unassigned first.

**Why this priority**: CRUD management is essential for ongoing governance but secondary to creation and evaluation. Admins need to iterate on policies after the initial setup.

**Independent Test**: Can be tested by creating multiple policies, listing them with filters, updating one, and attempting to delete one with and without agent assignments.

**Acceptance Scenarios**:

1. **Given** multiple policies exist, **When** an authenticated user lists policies, **Then** a paginated list is returned with total count.
2. **Given** a policy with rules, **When** a user retrieves it by ID, **Then** the full policy with all rules is returned.
3. **Given** an active policy, **When** an admin updates its isActive to false, **Then** the policy is deactivated and no longer matches during evaluation.
4. **Given** a policy with no agents assigned, **When** an admin deletes it, **Then** the policy and its rules are removed.
5. **Given** a policy assigned to 3 agents, **When** an admin attempts to delete it, **Then** the system returns 400 with "Cannot delete policy assigned to 3 agents. Unassign first."
6. **Given** a non-existent policy ID, **When** a user retrieves or updates it, **Then** the system returns 404 "Policy not found".

---

### User Story 4 - Admin Assigns Policies to Agents (Priority: P2)

An administrator assigns a policy to a specific agent, making that policy agent-specific rather than global. This allows fine-grained governance where certain agents have stricter or more permissive rules than the global defaults. An admin can also unassign a policy from an agent, which makes it apply globally again (if no other agents are assigned).

**Why this priority**: Assignment is what makes the policy engine flexible — without it, all policies are global and cannot be tailored to individual agents.

**Independent Test**: Can be tested by assigning a policy to an agent, evaluating that agent (should see agent-specific policy), then evaluating a different agent (should not see it as agent-specific, but may see it as global if no agents are assigned).

**Acceptance Scenarios**:

1. **Given** a valid policy and agent, **When** an admin assigns the policy to the agent, **Then** the assignment is created and returned with confirmation.
2. **Given** a policy already assigned to an agent, **When** an admin assigns the same policy again, **Then** the system returns 400 "Policy already assigned to this agent".
3. **Given** a non-existent policy ID, **When** an admin attempts to assign it, **Then** the system returns 404 "Policy not found".
4. **Given** a non-existent agent ID, **When** an admin attempts to assign to it, **Then** the system returns 404 "Agent not found".
5. **Given** a policy assigned to an agent, **When** an admin unassigns it, **Then** the assignment is removed.
6. **Given** no existing assignment, **When** an admin attempts to unassign, **Then** the system returns 404 "Assignment not found".

---

### User Story 5 - Approval Workflow Uses Real Policy Evaluation (Priority: P1)

The approval workflow (EPIC 4) currently has a stub `evaluatePolicy()` function that always returns REQUIRE_APPROVAL. With the policy engine complete, this stub is replaced with a call to the real policy evaluator. When an agent submits an approval request, the system evaluates applicable policies: if a policy allows the action, it returns AUTO_APPROVED immediately; if a policy denies it, the request is blocked with the policy name; if no policy matches or a REQUIRE_APPROVAL rule matches, a pending approval ticket is created as before.

**Why this priority**: This is the critical integration point between EPIC 4 and EPIC 5. Without it, the policy engine is disconnected from the approval workflow and has no runtime effect.

**Independent Test**: Can be tested by creating a policy with an ALLOW rule, submitting an approval request that matches it, and verifying AUTO_APPROVED is returned. Then creating a DENY policy and verifying the request is blocked.

**Acceptance Scenarios**:

1. **Given** an ALLOW policy matching a LOW-risk action, **When** an agent submits an approval request, **Then** the system returns AUTO_APPROVED without creating a ticket.
2. **Given** a DENY policy matching a delete action on a CRITICAL agent, **When** an agent submits an approval request, **Then** the system returns 403 with the blocking policy name.
3. **Given** no matching policy, **When** an agent submits an approval request, **Then** a PENDING ticket is created (default behavior, same as before).

---

### Edge Cases

- Deleting a policy assigned to active agents: return 400 with "Cannot delete policy assigned to [N] agents. Unassign first."
- Evaluating for a non-existent agent ID: return 404 "Agent not found"
- Policy with no rules: never matches anything (effectively inactive despite isActive being true)
- Rule with actionType "*" and empty riskTiers array: matches ALL actions at ALL risk tiers
- Multiple DENY rules matching: return first match found (agent-specific policies are checked before global)
- Duplicate policy name: return 400 "Policy name already exists"
- Duplicate assignment (same policy + same agent): return 400 "Policy already assigned to this agent"
- Inactive policy: skipped during evaluation even if rules match
- Rule with conditions that do not match context: rule is skipped

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow admin users to create a policy with a name, description, and one or more rules.
- **FR-002**: System MUST enforce unique policy names.
- **FR-003**: System MUST persist each rule with an action type, a list of risk tiers, an effect (ALLOW, DENY, or REQUIRE_APPROVAL), and optional conditions.
- **FR-004**: System MUST list all policies with pagination, optional filtering by active status, and total count.
- **FR-005**: System MUST return a single policy with all its rules when queried by ID.
- **FR-006**: System MUST allow admin users to update a policy's name, description, or active status.
- **FR-007**: System MUST allow admin users to delete a policy only if no agents are assigned to it.
- **FR-008**: System MUST return 400 with the count of assigned agents when deletion is attempted on a policy with assignments.
- **FR-009**: System MUST allow admin users to assign a policy to an agent.
- **FR-010**: System MUST prevent duplicate assignments of the same policy to the same agent.
- **FR-011**: System MUST allow admin users to unassign a policy from an agent.
- **FR-012**: System MUST evaluate policies for a given agent, action type, risk tier, and optional context.
- **FR-013**: System MUST load agent-specific policies before global policies during evaluation.
- **FR-014**: System MUST skip inactive policies during evaluation.
- **FR-015**: System MUST apply effect priority during evaluation: DENY > REQUIRE_APPROVAL > ALLOW.
- **FR-016**: System MUST default to REQUIRE_APPROVAL when no policies match.
- **FR-017**: System MUST return the matched rule, matched policy, and a human-readable reason in evaluation results.
- **FR-018**: System MUST support wildcard action type ("*") that matches any action.
- **FR-019**: System MUST treat an empty riskTiers array as matching all risk tiers.
- **FR-020**: System MUST support optional conditions on rules, evaluated against a provided context object.
- **FR-021**: System MUST expose policy evaluation both as an API endpoint and as an importable function for internal use by the approval workflow.
- **FR-022**: System MUST replace the stub `evaluatePolicy()` in the approval workflow with a call to the real policy evaluator.
- **FR-023**: System MUST return 404 when evaluating policies for a non-existent agent.

### Key Entities

- **Policy**: A named governance rule set. Contains a unique name, description, active status, creation timestamp, and a collection of rules. Can be assigned to specific agents or apply globally.
- **PolicyRule**: A single matching criterion within a policy. Specifies an action type pattern, applicable risk tiers, the governing effect, and optional conditions. Belongs to exactly one policy.
- **AgentPolicy**: A join relationship between a policy and an agent. When a policy has agent assignments, it is agent-specific; when it has none, it is global.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can create, update, and delete policies within 3 interactions each.
- **SC-002**: Policy evaluation returns a decision within 500 milliseconds for an agent with up to 20 assigned policies.
- **SC-003**: The correct effect priority (DENY > REQUIRE_APPROVAL > ALLOW) is enforced in 100% of evaluation scenarios.
- **SC-004**: The approval workflow correctly auto-allows, denies, or requires approval based on matching policies, with zero regressions on existing approval tests.
- **SC-005**: Global policies apply to all agents not explicitly assigned, and agent-specific policies take evaluation precedence.
- **SC-006**: Deleting a policy with agent assignments is blocked with an actionable error message in 100% of cases.
- **SC-007**: All seed policies (External Email Approval, Delete Protection, Low Risk Auto Allow) are correctly evaluated by the engine.

## Assumptions

- The Prisma models (Policy, PolicyRule, AgentPolicy) already exist in `schema.prisma` from prior epics. No migration is needed.
- The seed data from `prisma/seed.ts` already creates sample policies with rules. The seed may be enhanced but the structure exists.
- The existing `evaluatePolicy()` stub in `approvals.service.ts` is the only integration point to replace. No other modules call it.
- Condition matching (`checkConditions`) performs shallow key equality between rule conditions and the provided context. Deep or expression-based matching is out of scope.
- The policy evaluation endpoint is public to all authenticated users (any role can evaluate), while CRUD operations are admin-only.

## Out of Scope

- Time-based policies (active only during business hours)
- Policy versioning or change history
- Policy testing sandbox (simulate what-if scenarios)
- OPA/Rego integration (use built-in evaluator)
- Policy import/export
- Complex condition expressions (only shallow key-value matching)
