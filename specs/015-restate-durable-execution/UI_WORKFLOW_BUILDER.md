# UI Workflow Builder & Triggers Design

## Overview

A visual workflow builder UI that allows users to:
1. **Define workflows** using drag-and-drop interface
2. **Configure triggers** (cron schedule, manual, webhook, event-based)
3. **Execute workflows** with form-based inputs
4. **Monitor execution** with real-time status updates

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Dashboard UI                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Workflow Builder Page                                  │ │
│  │  - Drag-and-drop step editor                           │ │
│  │  - Step library (LLM, API, Approval, Condition)        │ │
│  │  - Visual flow diagram                                 │ │
│  │  - Variable mapping                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Trigger Configuration                                  │ │
│  │  - Cron schedule builder                               │ │
│  │  - Manual trigger with input form                      │ │
│  │  - Webhook URL generator                               │ │
│  │  - Event subscriptions                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Execution Monitor                                      │ │
│  │  - Live workflow status                                │ │
│  │  - Step-by-step progress                               │ │
│  │  - Cost tracking                                       │ │
│  │  - Approval actions                                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Fastify API (apps/api)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Workflow Management API                                │ │
│  │  POST   /api/v1/workflows/definitions                  │ │
│  │  GET    /api/v1/workflows/definitions                  │ │
│  │  GET    /api/v1/workflows/definitions/:id              │ │
│  │  PUT    /api/v1/workflows/definitions/:id              │ │
│  │  DELETE /api/v1/workflows/definitions/:id              │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Trigger Management API                                 │ │
│  │  POST   /api/v1/workflows/triggers                     │ │
│  │  GET    /api/v1/workflows/triggers                     │ │
│  │  PUT    /api/v1/workflows/triggers/:id                 │ │
│  │  DELETE /api/v1/workflows/triggers/:id                 │ │
│  │  POST   /api/v1/workflows/triggers/:id/execute         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Execution API                                          │ │
│  │  POST   /api/v1/workflows/executions                   │ │
│  │  GET    /api/v1/workflows/executions                   │ │
│  │  GET    /api/v1/workflows/executions/:id               │ │
│  │  GET    /api/v1/workflows/executions/:id/status        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Scheduler Service (BullMQ)                 │
│  - Cron-based trigger execution                             │
│  - Retry logic                                              │
│  - Job queue management                                     │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Restate Workflow Engine (apps/workflows)            │
│  - GenericWorkflowEngine                                    │
│  - Durable execution                                        │
│  - Step execution                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### WorkflowDefinition Table

```sql
CREATE TABLE "WorkflowDefinition" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL DEFAULT '1.0.0',
  "status" TEXT NOT NULL DEFAULT 'draft', -- draft, active, archived
  
  -- Workflow structure
  "definition" JSONB NOT NULL, -- Full workflow definition
  "inputSchema" JSONB, -- JSON Schema for input validation
  "outputSchema" JSONB, -- JSON Schema for output
  
  -- Metadata
  "agentId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "tags" TEXT[],
  
  -- Constraints
  "maxCostUsd" DECIMAL(10,4),
  "maxDurationMs" INTEGER,
  
  -- Stats
  "executionCount" INTEGER DEFAULT 0,
  "successCount" INTEGER DEFAULT 0,
  "failureCount" INTEGER DEFAULT 0,
  
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id"),
  FOREIGN KEY ("createdBy") REFERENCES "User"("id")
);

CREATE INDEX "WorkflowDefinition_agentId_idx" ON "WorkflowDefinition"("agentId");
CREATE INDEX "WorkflowDefinition_status_idx" ON "WorkflowDefinition"("status");
CREATE INDEX "WorkflowDefinition_tags_idx" ON "WorkflowDefinition" USING GIN("tags");
```

### WorkflowTrigger Table

```sql
CREATE TYPE "TriggerType" AS ENUM (
  'MANUAL',      -- Triggered by user button click
  'SCHEDULED',   -- Cron-based schedule
  'WEBHOOK',     -- External webhook
  'EVENT'        -- Internal event (approval completed, etc.)
);

CREATE TABLE "WorkflowTrigger" (
  "id" TEXT PRIMARY KEY,
  "workflowDefinitionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "TriggerType" NOT NULL,
  "enabled" BOOLEAN DEFAULT true,
  
  -- Schedule config (for SCHEDULED type)
  "cronExpression" TEXT, -- "0 9 * * 1" (Every Monday at 9 AM)
  "timezone" TEXT DEFAULT 'UTC',
  
  -- Webhook config (for WEBHOOK type)
  "webhookSecret" TEXT,
  "webhookUrl" TEXT, -- Generated URL
  
  -- Event config (for EVENT type)
  "eventType" TEXT, -- "approval.completed", "agent.registered"
  "eventFilter" JSONB, -- Conditions for event triggering
  
  -- Input config
  "defaultInput" JSONB, -- Default values for workflow input
  "inputOverrides" JSONB, -- User-provided overrides
  
  -- Metadata
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastTriggeredAt" TIMESTAMP(3),
  "triggerCount" INTEGER DEFAULT 0,
  
  FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE,
  FOREIGN KEY ("createdBy") REFERENCES "User"("id")
);

CREATE INDEX "WorkflowTrigger_workflowDefinitionId_idx" ON "WorkflowTrigger"("workflowDefinitionId");
CREATE INDEX "WorkflowTrigger_type_enabled_idx" ON "WorkflowTrigger"("type", "enabled");
CREATE INDEX "WorkflowTrigger_eventType_idx" ON "WorkflowTrigger"("eventType") WHERE "type" = 'EVENT';
```

### WorkflowExecution Table

```sql
CREATE TYPE "WorkflowExecutionStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUSPENDED', -- Waiting for approval
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "WorkflowExecution" (
  "id" TEXT PRIMARY KEY,
  "workflowId" TEXT UNIQUE NOT NULL, -- Restate workflow ID
  "workflowDefinitionId" TEXT NOT NULL,
  "triggerId" TEXT, -- NULL for manual API calls
  "agentId" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "status" "WorkflowExecutionStatus" DEFAULT 'PENDING',
  
  -- Execution data
  "input" JSONB NOT NULL,
  "output" JSONB,
  "error" TEXT,
  "steps" JSONB, -- Array of step statuses
  
  -- Timing
  "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  
  -- Cost tracking
  "totalCostUsd" DECIMAL(10,6) DEFAULT 0,
  
  -- Restate integration
  "restateInvocationId" TEXT,
  "restateDeploymentId" TEXT,
  
  FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id"),
  FOREIGN KEY ("triggerId") REFERENCES "WorkflowTrigger"("id"),
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id"),
  FOREIGN KEY ("traceId") REFERENCES "Trace"("id")
);

CREATE INDEX "WorkflowExecution_workflowDefinitionId_idx" ON "WorkflowExecution"("workflowDefinitionId");
CREATE INDEX "WorkflowExecution_status_idx" ON "WorkflowExecution"("status");
CREATE INDEX "WorkflowExecution_startedAt_idx" ON "WorkflowExecution"("startedAt");
CREATE INDEX "WorkflowExecution_agentId_idx" ON "WorkflowExecution"("agentId");
```

---

## Frontend UI Components

### 1. Workflow List Page

```tsx
// apps/web/src/pages/WorkflowsPage.tsx
import { WorkflowCard } from '@/components/workflows/WorkflowCard';
import { CreateWorkflowButton } from '@/components/workflows/CreateWorkflowButton';

export function WorkflowsPage() {
  const { data: workflows } = useWorkflows();
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Workflows</h1>
        <CreateWorkflowButton />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows?.map((workflow) => (
          <WorkflowCard key={workflow.id} workflow={workflow} />
        ))}
      </div>
    </div>
  );
}
```

### 2. Visual Workflow Builder

```tsx
// apps/web/src/components/workflows/WorkflowBuilder.tsx
import { ReactFlow, Node, Edge } from 'reactflow';
import { StepLibrary } from './StepLibrary';
import { StepConfigPanel } from './StepConfigPanel';

export function WorkflowBuilder({ workflowId }: { workflowId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedStep, setSelectedStep] = useState<Node | null>(null);
  
  return (
    <div className="flex h-screen">
      {/* Step Library Sidebar */}
      <StepLibrary onAddStep={handleAddStep} />
      
      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setSelectedStep(node)}
        >
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      
      {/* Config Panel */}
      {selectedStep && (
        <StepConfigPanel
          step={selectedStep}
          onUpdate={handleUpdateStep}
          onClose={() => setSelectedStep(null)}
        />
      )}
    </div>
  );
}
```

### 3. Step Library

```tsx
// apps/web/src/components/workflows/StepLibrary.tsx
const stepTypes = [
  {
    type: 'llm',
    icon: '🤖',
    label: 'LLM Call',
    description: 'Call Claude or GPT',
    color: 'bg-blue-500',
  },
  {
    type: 'api',
    icon: '🌐',
    label: 'API Call',
    description: 'Call external API',
    color: 'bg-green-500',
  },
  {
    type: 'approval',
    icon: '✋',
    label: 'Approval Gate',
    description: 'Human approval',
    color: 'bg-yellow-500',
  },
  {
    type: 'condition',
    icon: '🔀',
    label: 'Condition',
    description: 'Branch execution',
    color: 'bg-purple-500',
  },
];

export function StepLibrary({ onAddStep }: StepLibraryProps) {
  return (
    <div className="w-64 bg-gray-50 p-4 space-y-2">
      <h2 className="font-semibold mb-4">Step Library</h2>
      {stepTypes.map((step) => (
        <div
          key={step.type}
          draggable
          onDragEnd={() => onAddStep(step)}
          className="p-3 bg-white rounded-lg shadow cursor-move hover:shadow-md"
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{step.icon}</span>
            <div>
              <div className="font-medium">{step.label}</div>
              <div className="text-xs text-gray-500">{step.description}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 4. Trigger Configuration

```tsx
// apps/web/src/components/workflows/TriggerConfig.tsx
export function TriggerConfig({ workflowId }: { workflowId: string }) {
  const [triggerType, setTriggerType] = useState<'manual' | 'scheduled' | 'webhook'>('manual');
  
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Trigger Type</label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as any)}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="manual">Manual (Trigger Now Button)</option>
          <option value="scheduled">Scheduled (Cron)</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>
      
      {triggerType === 'manual' && <ManualTriggerConfig />}
      {triggerType === 'scheduled' && <ScheduledTriggerConfig />}
      {triggerType === 'webhook' && <WebhookTriggerConfig />}
    </div>
  );
}

function ManualTriggerConfig() {
  return (
    <div className="space-y-4">
      <h3 className="font-medium">Manual Trigger</h3>
      <p className="text-sm text-gray-600">
        Users will see a "Trigger Now" button with a form to provide inputs.
      </p>
      
      <InputFieldsEditor />
      
      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Save Trigger
      </button>
    </div>
  );
}

function ScheduledTriggerConfig() {
  const [cronExpression, setCronExpression] = useState('0 9 * * 1');
  const [timezone, setTimezone] = useState('UTC');
  
  return (
    <div className="space-y-4">
      <h3 className="font-medium">Scheduled Trigger</h3>
      
      <div>
        <label className="block text-sm font-medium mb-2">Schedule</label>
        <CronBuilder value={cronExpression} onChange={setCronExpression} />
        <p className="text-xs text-gray-500 mt-1">
          Next run: {getNextCronRun(cronExpression, timezone)}
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Timezone</label>
        <TimezoneSelect value={timezone} onChange={setTimezone} />
      </div>
      
      <InputFieldsEditor label="Default Values" />
      
      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Save Trigger
      </button>
    </div>
  );
}
```

### 5. Manual Trigger Execution

```tsx
// apps/web/src/components/workflows/TriggerNowDialog.tsx
export function TriggerNowDialog({ workflow, trigger }: TriggerNowDialogProps) {
  const { mutate: executeWorkflow, isPending } = useExecuteWorkflow();
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  const inputFields = trigger.inputSchema || workflow.inputSchema;
  
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger: {workflow.name}</DialogTitle>
          <DialogDescription>
            Provide the required inputs to execute this workflow
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {Object.entries(inputFields.properties).map(([key, schema]) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-2">
                {schema.title || key}
                {schema.required && <span className="text-red-500">*</span>}
              </label>
              
              {schema.type === 'string' && (
                <input
                  type="text"
                  value={formData[key] || ''}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder={schema.description}
                />
              )}
              
              {schema.type === 'number' && (
                <input
                  type="number"
                  value={formData[key] || ''}
                  onChange={(e) => setFormData({ ...formData, [key]: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                  step={schema.multipleOf || 0.01}
                />
              )}
              
              {schema.type === 'boolean' && (
                <input
                  type="checkbox"
                  checked={formData[key] || false}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                  className="w-4 h-4"
                />
              )}
              
              {schema.description && (
                <p className="text-xs text-gray-500 mt-1">{schema.description}</p>
              )}
            </div>
          ))}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Executing...' : 'Trigger Workflow'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 6. Execution Monitor

```tsx
// apps/web/src/components/workflows/ExecutionMonitor.tsx
export function ExecutionMonitor({ executionId }: { executionId: string }) {
  const { data: execution } = useWorkflowExecution(executionId);
  const { data: liveStatus } = useWorkflowStatus(executionId, {
    refetchInterval: execution?.status === 'RUNNING' ? 2000 : false,
  });
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Workflow Execution</h2>
        <StatusBadge status={execution.status} />
      </div>
      
      {/* Progress */}
      <ExecutionTimeline steps={execution.steps} />
      
      {/* Live Logs */}
      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400">Logs</span>
          <span className="text-green-400">● Live</span>
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {liveStatus?.logs?.map((log, i) => (
            <div key={i} className="text-xs">
              <span className="text-gray-500">[{log.timestamp}]</span>{' '}
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Pending Approvals */}
      {execution.status === 'SUSPENDED' && (
        <PendingApprovalCard execution={execution} />
      )}
      
      {/* Cost Tracking */}
      <CostSummary totalCost={execution.totalCostUsd} />
    </div>
  );
}
```

---

## API Implementation

### Workflow Management Routes

```typescript
// apps/api/src/modules/workflows/workflows.routes.ts
import { FastifyPluginAsync } from 'fastify';
import {
  createWorkflowDefinition,
  listWorkflowDefinitions,
  getWorkflowDefinition,
  updateWorkflowDefinition,
  deleteWorkflowDefinition,
} from './workflows.service.js';

export const workflowsRoutes: FastifyPluginAsync = async (fastify) => {
  // Create workflow definition
  fastify.post('/definitions', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'definition'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          definition: { type: 'object' },
          inputSchema: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    async handler(request, reply) {
      const userId = request.user.id;
      const agentId = request.body.agentId || request.user.defaultAgentId;
      
      const workflow = await createWorkflowDefinition({
        ...request.body,
        agentId,
        createdBy: userId,
      });
      
      return reply.code(201).send(workflow);
    },
  });
  
  // List workflows
  fastify.get('/definitions', {
    async handler(request, reply) {
      const { agentId, status, tags } = request.query as any;
      
      const workflows = await listWorkflowDefinitions({
        agentId,
        status,
        tags,
      });
      
      return reply.send(workflows);
    },
  });
  
  // Get workflow
  fastify.get('/definitions/:id', {
    async handler(request, reply) {
      const { id } = request.params as { id: string };
      const workflow = await getWorkflowDefinition(id);
      
      if (!workflow) {
        return reply.code(404).send({ error: 'Workflow not found' });
      }
      
      return reply.send(workflow);
    },
  });
  
  // Update workflow
  fastify.put('/definitions/:id', {
    async handler(request, reply) {
      const { id } = request.params as { id: string };
      const workflow = await updateWorkflowDefinition(id, request.body);
      
      return reply.send(workflow);
    },
  });
  
  // Delete workflow
  fastify.delete('/definitions/:id', {
    async handler(request, reply) {
      const { id } = request.params as { id: string };
      await deleteWorkflowDefinition(id);
      
      return reply.code(204).send();
    },
  });
};
```

### Trigger Management Routes

```typescript
// apps/api/src/modules/workflows/triggers.routes.ts
export const triggersRoutes: FastifyPluginAsync = async (fastify) => {
  // Create trigger
  fastify.post('/triggers', {
    async handler(request, reply) {
      const trigger = await createWorkflowTrigger({
        ...request.body,
        createdBy: request.user.id,
      });
      
      // If scheduled, register with BullMQ
      if (trigger.type === 'SCHEDULED' && trigger.enabled) {
        await scheduleWorkflowTrigger(trigger);
      }
      
      return reply.code(201).send(trigger);
    },
  });
  
  // Execute trigger manually
  fastify.post('/triggers/:id/execute', {
    schema: {
      body: {
        type: 'object',
        properties: {
          input: { type: 'object' },
          overrides: { type: 'object' },
        },
      },
    },
    async handler(request, reply) {
      const { id } = request.params as { id: string };
      const { input, overrides } = request.body;
      
      const execution = await executeWorkflowTrigger(id, {
        input: { ...trigger.defaultInput, ...input, ...overrides },
        triggeredBy: request.user.id,
      });
      
      return reply.send(execution);
    },
  });
};
```

### Execution Routes

```typescript
// apps/api/src/modules/workflows/executions.routes.ts
export const executionsRoutes: FastifyPluginAsync = async (fastify) => {
  // Execute workflow directly (no trigger)
  fastify.post('/executions', {
    async handler(request, reply) {
      const { workflowDefinitionId, input } = request.body;
      
      const execution = await executeWorkflow({
        workflowDefinitionId,
        input,
        agentId: request.body.agentId || request.user.defaultAgentId,
        userId: request.user.id,
      });
      
      return reply.code(201).send(execution);
    },
  });
  
  // Get execution status
  fastify.get('/executions/:id/status', {
    async handler(request, reply) {
      const { id } = request.params as { id: string };
      
      // Query Restate for live status
      const restateStatus = await getRestateInvocationStatus(execution.restateInvocationId);
      
      return reply.send({
        ...execution,
        liveStatus: restateStatus,
      });
    },
  });
};
```

---

## Scheduler Implementation

```typescript
// apps/api/src/workers/workflowScheduler.ts
import { Queue, Worker } from 'bullmq';
import { executeWorkflowTrigger } from '../modules/workflows/workflows.service.js';

const workflowSchedulerQueue = new Queue('workflow-scheduler', {
  connection: redis,
});

export async function scheduleWorkflowTrigger(trigger: WorkflowTrigger) {
  if (trigger.type !== 'SCHEDULED' || !trigger.cronExpression) {
    return;
  }
  
  // Add repeatable job
  await workflowSchedulerQueue.add(
    `trigger-${trigger.id}`,
    { triggerId: trigger.id },
    {
      repeat: {
        pattern: trigger.cronExpression,
        tz: trigger.timezone,
      },
      removeOnComplete: true,
    }
  );
}

// Worker
export const workflowSchedulerWorker = new Worker(
  'workflow-scheduler',
  async (job) => {
    const { triggerId } = job.data;
    
    console.log(`Executing scheduled trigger: ${triggerId}`);
    
    const trigger = await prisma.workflowTrigger.findUnique({
      where: { id: triggerId },
      include: { workflowDefinition: true },
    });
    
    if (!trigger || !trigger.enabled) {
      return;
    }
    
    await executeWorkflowTrigger(triggerId, {
      input: trigger.defaultInput,
      triggeredBy: 'system',
    });
  },
  {
    connection: redis,
    concurrency: 5,
  }
);
```

---

## Next Steps

1. **Backend API** (Priority 1)
   - [ ] Implement workflow CRUD endpoints
   - [ ] Implement trigger CRUD endpoints
   - [ ] Add execution status endpoint
   - [ ] Set up BullMQ scheduler

2. **Database Migration** (Priority 2)
   - [ ] Create Prisma schema for WorkflowDefinition
   - [ ] Create Prisma schema for WorkflowTrigger
   - [ ] Create Prisma schema for WorkflowExecution
   - [ ] Run migration

3. **Frontend UI** (Priority 3)
   - [ ] Workflow list page
   - [ ] Visual workflow builder with ReactFlow
   - [ ] Trigger configuration forms
   - [ ] Execution monitor dashboard
   - [ ] "Trigger Now" dialog

4. **Integration** (Priority 4)
   - [ ] Connect workflow registry to database
   - [ ] Integrate scheduler with Restate
   - [ ] Add SSE for live execution updates
   - [ ] Add webhook endpoint support

Would you like me to start implementing any of these components?
