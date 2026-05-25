# Workflow Service

Durable workflow handlers for AgentOS agent orchestration.

## Prerequisites

- Node.js 20+
- Running AgentOS API (`apps/api`)
- Running PostgreSQL database
- Running Restate instance (reusing existing container on ports 8091/9070)

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start in development mode
npm run dev

# In another terminal, register with Restate (use your host IP)
# Get your host IP: hostname -I | awk '{print $1}'
curl -X POST http://localhost:9070/deployments \
  -H 'Content-Type: application/json' \
  -d '{"uri": "http://YOUR_HOST_IP:9080"}'

# Example with host IP 172.14.2.26:
# curl -X POST http://localhost:9070/deployments \
#   -H 'Content-Type: application/json' \
#   -d '{"uri": "http://172.14.2.26:9080"}'

# Build for production
npm run build
npm start
```

## Health Check

```bash
# Workflow service health
curl http://localhost:9080/health/check

# Restate instance health (admin API)
curl http://localhost:9070/health

# Restate ingress health
curl http://localhost:8091/restate/health
```

## Project Structure

```
src/
├── server.ts           # Entry point, Restate endpoint setup
├── workflows/          # Workflow handlers
│   ├── emailApproval.ts
│   └── research.ts
├── config/             # Configuration and env validation
│   └── env.ts
└── utils/              # Shared utilities
    ├── anthropic.ts
    └── cost-calculator.ts
```

## Development

See [RESTATE_QUICKSTART.md](../../docs/RESTATE_QUICKSTART.md) for detailed development guide.
