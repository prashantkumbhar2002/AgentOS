# Workflow Service

Durable workflow handlers for AgentOS agent orchestration.

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start in development mode
npm run dev

# Build for production
npm run build
npm start
```

## Health Check

```bash
curl http://localhost:9080/health
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
