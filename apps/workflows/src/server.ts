import 'dotenv/config';
import * as restate from '@restatedev/restate-sdk';
import { getEnv } from './config/env.js';

const env = getEnv();

// Health check service
const healthService = restate.service({
  name: 'health',
  handlers: {
    check: async () => ({
      status: 'ok',
      service: 'workflows',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    }),
  },
});

// Create Restate endpoint and bind services
const endpoint = restate
  .endpoint()
  .bind(healthService);

// Start server
endpoint.listen(env.PORT);

console.log(`
  Workflow service started successfully!

  Service:     workflows
  Port:        ${env.PORT}
  Environment: ${env.NODE_ENV}
  Health:      http://localhost:${env.PORT}/health/check
  
  Restate URL: ${env.RESTATE_URL}
  API URL:     ${env.AGENTOS_API_URL}
  
Ready to register with Restate...
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
