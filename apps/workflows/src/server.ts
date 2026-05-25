import 'dotenv/config';
import * as restate from '@restatedev/restate-sdk';
import { getEnv } from './config/env.js';
import { disconnectDatabase } from './config/database.js';
import { seedSystemData } from './config/seed.js';
import { dagWorkflowEngine } from './workflows/dag-engine.js';
import { registerWorkflowDefinition } from './utils/workflow-registry.js';
import {
  emailApprovalDAG,
  parallelChecksDAG,
  conditionalRoutingDAG,
} from './examples/workflow-definitions-dag.js';

const env = getEnv();

// Seed system data and register DAG workflows
async function initializeWorkflows() {
  try {
    // Seed system user and agent
    await seedSystemData();
    
    // Register DAG workflows
    await registerWorkflowDefinition(emailApprovalDAG);
    await registerWorkflowDefinition(parallelChecksDAG);
    await registerWorkflowDefinition(conditionalRoutingDAG);
    
    console.log('All DAG workflows registered to database\n');
  } catch (error) {
    console.error('Error initializing workflows:', error);
  }
}

// Initialize in background (don't block server startup)
initializeWorkflows();

// Health check service
const healthService = restate.service({
  name: 'health',
  handlers: {
    check: async () => ({
      status: 'ok',
      service: 'workflows',
      version: '0.3.0',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      engine: 'DAG',
      description: 'DAG-based workflow execution engine',
      storage: 'postgresql',
    }),
  },
});

// Create Restate endpoint and bind services
const endpoint = restate
  .endpoint()
  .bind(healthService)
  .bind(dagWorkflowEngine);

// Start server
endpoint.listen(env.PORT);

console.log(`
 DAG Workflow Engine started successfully!

  Service:     workflows
  Port:        ${env.PORT}
  Environment: ${env.NODE_ENV}
  Health:      http://localhost:${env.PORT}/health/check
  
  Engine:      DAGWorkflowEngine (nodes + edges)
  Storage:     PostgreSQL (persistent)
  
  DAG Workflows Registered:
    - email-approval-dag-v1        (Linear: Draft → Policy → Approve → Send)
    - parallel-checks-dag-v1       (Parallel: 3 checks → Aggregate → Decide)
    - conditional-routing-dag-v1   (Branching: Risk → High/Low Path → Complete)
  
  Restate URL: ${env.RESTATE_URL}
  API URL:     ${env.AGENTOS_API_URL}
  
Ready to register with Restate...

 To execute a DAG workflow:
   POST ${env.RESTATE_URL}/DAGWorkflowEngine/{unique-key}/run/send
   Body: {
     "workflowDefinitionId": "email-approval-dag-v1",
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
async function shutdown() {
  console.log('\nShutting down workflow service...');
  
  // Disconnect from database
  try {
    await disconnectDatabase();
    console.log('Database disconnected');
  } catch (error) {
    console.error('Error disconnecting database:', error);
  }
  
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
