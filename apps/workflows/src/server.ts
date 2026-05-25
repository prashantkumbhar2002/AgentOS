import 'dotenv/config';
import * as restate from '@restatedev/restate-sdk';
import { getEnv } from './config/env.js';
import { genericWorkflowEngine } from './workflows/generic-engine.js';
import { registerWorkflowDefinition } from './utils/workflow-registry.js';
import {
  emailApprovalWorkflowDefinition,
  researchTaskWorkflowDefinition,
  simpleApprovalWorkflowDefinition,
} from './examples/workflow-definitions.js';

const env = getEnv();

// Register example workflow definitions on startup
registerWorkflowDefinition(emailApprovalWorkflowDefinition);
registerWorkflowDefinition(researchTaskWorkflowDefinition);
registerWorkflowDefinition(simpleApprovalWorkflowDefinition);

// Health check service
const healthService = restate.service({
  name: 'health',
  handlers: {
    check: async () => ({
      status: 'ok',
      service: 'workflows',
      version: '0.2.0',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      engine: 'generic',
      description: 'User-defined workflow execution engine',
    }),
  },
});

// Create Restate endpoint and bind services
const endpoint = restate
  .endpoint()
  .bind(healthService)
  .bind(genericWorkflowEngine);

// Start server
endpoint.listen(env.PORT);

console.log(`
✅ Generic Workflow Engine started successfully!

  Service:     workflows
  Port:        ${env.PORT}
  Environment: ${env.NODE_ENV}
  Health:      http://localhost:${env.PORT}/health/check
  
  Engine:      GenericWorkflowEngine (user-defined workflows)
  
  Example Workflows Registered:
    - email-approval-v1      (Email with LLM drafting + approval)
    - research-task-v1       (Multi-step research workflow)
    - simple-approval-v1     (Generic approval for any action)
  
  Restate URL: ${env.RESTATE_URL}
  API URL:     ${env.AGENTOS_API_URL}
  
Ready to register with Restate...

📚 To execute a workflow:
   POST ${env.RESTATE_URL}/GenericWorkflowEngine/{unique-key}/run/send
   Body: {
     "workflowDefinitionId": "email-approval-v1",
     "agentId": "agent-123",
     "traceId": "trace-456",
     "input": {
       "task": "Draft quarterly report email",
       "recipient": "team@example.com",
       "riskScore": 0.8
     }
   }
`);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down workflow service...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Shutting down workflow service...');
  process.exit(0);
});
