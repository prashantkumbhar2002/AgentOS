# DAG-Based Workflow Architecture

**Created:** 2026-05-25  
**Status:** Design Approved

---

## Overview

Migrating from sequential step-based workflows to **Directed Acyclic Graph (DAG)** representation for better expressiveness, parallelism, and visual editing.

---

## DAG Structure

### Core Components

```typescript
WorkflowDAG {
  nodes: Node[]      // Workflow tasks/steps
  edges: Edge[]      // Dependencies between nodes
  metadata: Metadata // Workflow-level config
}

Node {
  id: string
  type: 'llm' | 'api' | 'approval' | 'condition' | 'parallel' | 'transform'
  name: string
  config: NodeConfig  // Type-specific configuration
}

Edge {
  id: string
  from: string       // Source node ID
  to: string         // Target node ID
  condition?: string // Optional condition for traversal
  label?: string     // Optional edge label (for UI)
}
```

---

## Node Types

### 1. LLM Node
```typescript
{
  id: 'draft_email',
  type: 'llm',
  name: 'Draft Email',
  config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    systemPrompt: '...',
    userPrompt: '{{task}}',
    maxTokens: 1024,
    temperature: 0.7
  }
}
```

### 2. API Node
```typescript
{
  id: 'check_policy',
  type: 'api',
  name: 'Check Policy',
  config: {
    url: '{{_apiUrl}}/api/v1/policy/check',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { agentId: '{{_agentId}}', action: 'send_email' }
  }
}
```

### 3. Approval Node
```typescript
{
  id: 'approval_gate',
  type: 'approval',
  name: 'Human Approval',
  config: {
    requiresApproval: true,
    riskThreshold: 0.7,
    approvers: ['manager@example.com'],
    timeoutMs: 86400000  // 24 hours
  }
}
```

### 4. Condition Node (Branch)
```typescript
{
  id: 'risk_check',
  type: 'condition',
  name: 'Risk Assessment',
  config: {
    expression: '{{check_policy.riskScore}} > 0.7'
  }
}
// Edges: risk_check --[true]--> approval_gate
//        risk_check --[false]--> send_email
```

### 5. Transform Node (Data Manipulation)
```typescript
{
  id: 'format_response',
  type: 'transform',
  name: 'Format Output',
  config: {
    script: 'return { formattedEmail: input.draft_email.content.toUpperCase() }'
  }
}
```

### 6. Parallel Node (Fork-Join)
```typescript
{
  id: 'parallel_checks',
  type: 'parallel',
  name: 'Run Checks in Parallel',
  config: {
    strategy: 'all' | 'any' | 'majority'  // Wait strategy
  }
}
// Edges: start --> parallel_checks
//        parallel_checks --> spam_check
//        parallel_checks --> sentiment_check
//        parallel_checks --> policy_check
//        spam_check --> join
//        sentiment_check --> join
//        policy_check --> join
```

---

## Edge Semantics

### Simple Edge
```typescript
{ id: 'e1', from: 'draft', to: 'check' }
```

### Conditional Edge
```typescript
{
  id: 'e2',
  from: 'risk_check',
  to: 'approval_gate',
  condition: '{{risk_check.result}} === true',
  label: 'High Risk'
}
```

### Multiple Outgoing Edges (Fork)
```typescript
// Parallel execution
{ from: 'start', to: 'task_a' }
{ from: 'start', to: 'task_b' }
{ from: 'start', to: 'task_c' }
```

### Multiple Incoming Edges (Join)
```typescript
// Wait for all to complete
{ from: 'task_a', to: 'join' }
{ from: 'task_b', to: 'join' }
{ from: 'task_c', to: 'join' }
```

---

## Execution Algorithm

### Topological Sort + Level-Based Execution

```
1. Validate DAG (no cycles, all nodes reachable)
2. Compute in-degree for all nodes
3. Find entry nodes (in-degree = 0)
4. Execute level by level:
   - Execute all ready nodes in parallel
   - Mark completed nodes
   - Decrement in-degree of children
   - Add newly ready nodes to queue
5. Continue until all nodes executed or blocked
```

### Example Execution Flow

```
DAG:
  A --> B --> D
  A --> C --> D

Execution Order:
  Level 0: [A]           (execute A)
  Level 1: [B, C]        (execute B and C in parallel)
  Level 2: [D]           (execute D after both B and C complete)
```

---

## Database Schema

### WorkflowDefinition Table (Updated)

```prisma
model WorkflowDefinition {
  id            String   @id @default(uuid())
  name          String
  description   String?
  version       String
  status        WorkflowStatus
  
  // DAG Structure (stored as JSONB)
  dag           Json     // { nodes: [], edges: [] }
  
  // Entry point
  entryNodeId   String
  
  // Schemas
  inputSchema   Json?
  outputSchema  Json?
  
  // ... existing fields ...
}
```

### DAG JSON Structure

```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "llm",
      "name": "Draft Email",
      "config": { ... },
      "position": { "x": 100, "y": 100 }  // For UI layout
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "from": "node_1",
      "to": "node_2",
      "condition": null,
      "label": null
    }
  ]
}
```

---

## Validation Rules

### DAG Constraints

1. **No Cycles**: Must be acyclic (detect using DFS)
2. **Single Entry Point**: Must have exactly one node with in-degree = 0 (or explicitly defined)
3. **Reachability**: All nodes must be reachable from entry point
4. **No Orphans**: All nodes must have at least one incoming or outgoing edge (except entry/exit)
5. **Valid References**: All edge `from`/`to` IDs must reference existing nodes
6. **Condition Syntax**: Conditional edges must have valid expressions

### Node Constraints

1. **Unique IDs**: All node IDs must be unique
2. **Required Config**: Each node type must have required config fields
3. **Type Safety**: Config must match node type schema

---

## Migration Strategy

### Phase 1: Add DAG Support (Backward Compatible)

1. Keep existing `steps` + `next` structure
2. Add new `dag` field (optional)
3. Execution engine checks: if `dag` exists, use DAG executor; else use legacy executor

### Phase 2: Convert Existing Workflows

1. Create migration script to convert `steps` → DAG
2. Generate edges from `next` properties
3. Preserve all existing functionality

### Phase 3: Deprecate Legacy Format

1. Mark `steps` + `next` as deprecated
2. All new workflows must use DAG
3. Eventually remove legacy support

---

## UI Workflow Builder Integration

### Visual DAG Editor

```
┌───────────────────────────────────────┐
│  Workflow Builder                     │
├───────────────────────────────────────┤
│  Node Palette      │  Canvas          │
│  ┌─────────────┐   │  ┌──────────┐    │
│  │ LLM         │   │  │ Draft    │    │
│  │ API         │   │  │ Email    │    │
│  │ Approval    │   │  └────┬─────┘    │
│  │ Condition   │   │       │          │
│  │ Transform   │   │  ┌────▼─────┐    │
│  └─────────────┘   │  │ Check    │    │
│                    │  │ Policy   │    │
│                    │  └──────────┘    │
└───────────────────────────────────────┘
```

### Features

- Drag-and-drop nodes
- Connect nodes with edges
- Visual edge routing
- Inline node configuration
- Real-time validation
- Auto-layout algorithms

---

## Advantages Over Sequential

| Feature | Sequential | DAG |
|---------|-----------|-----|
| Parallelism | Limited | Native |
| Visualization | Text-based | Graph-based |
| Complex Flows | Difficult | Natural |
| Validation | Basic | Comprehensive |
| UI Integration | Manual | Direct mapping |
| Industry Standard | No | Yes |

---

## Example DAG Workflows

### Simple Linear Flow

```json
{
  "nodes": [
    { "id": "n1", "type": "llm", "name": "Generate" },
    { "id": "n2", "type": "approval", "name": "Approve" },
    { "id": "n3", "type": "api", "name": "Execute" }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" }
  ]
}
```

### Parallel Execution

```json
{
  "nodes": [
    { "id": "start", "type": "transform", "name": "Prepare" },
    { "id": "check_a", "type": "api", "name": "Spam Check" },
    { "id": "check_b", "type": "api", "name": "Sentiment" },
    { "id": "check_c", "type": "api", "name": "Policy" },
    { "id": "join", "type": "transform", "name": "Aggregate" }
  ],
  "edges": [
    { "from": "start", "to": "check_a" },
    { "from": "start", "to": "check_b" },
    { "from": "start", "to": "check_c" },
    { "from": "check_a", "to": "join" },
    { "from": "check_b", "to": "join" },
    { "from": "check_c", "to": "join" }
  ]
}
```

### Conditional Branching

```json
{
  "nodes": [
    { "id": "assess", "type": "condition", "name": "Risk Check" },
    { "id": "low_risk", "type": "api", "name": "Auto Execute" },
    { "id": "high_risk", "type": "approval", "name": "Manual Review" },
    { "id": "final", "type": "api", "name": "Complete" }
  ],
  "edges": [
    { "from": "assess", "to": "low_risk", "condition": "{{risk}} < 0.5", "label": "Low Risk" },
    { "from": "assess", "to": "high_risk", "condition": "{{risk}} >= 0.5", "label": "High Risk" },
    { "from": "low_risk", "to": "final" },
    { "from": "high_risk", "to": "final" }
  ]
}
```

---

## Implementation Checklist

- [ ] Design DAG TypeScript types
- [ ] Update Prisma schema for DAG storage
- [ ] Create DAG validation utilities
- [ ] Implement DAG execution engine
- [ ] Create migration script (steps → DAG)
- [ ] Update workflow registry for DAG
- [ ] Add DAG visualization endpoint
- [ ] Update documentation
- [ ] Create example DAG workflows
- [ ] Test parallel execution
- [ ] Test conditional branching

---

## Next Steps

1. Approve this design document
2. Implement DAG types and schema
3. Rewrite generic-engine.ts for DAG execution
4. Migrate existing 3 workflows to DAG format
5. Test thoroughly
6. Prepare for UI integration
