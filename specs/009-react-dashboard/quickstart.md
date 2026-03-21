# Quickstart: Frontend — React Dashboard

## Prerequisites

1. Backend API running at `http://localhost:3000` (EPICs 2–7)
2. Database seeded (`cd apps/api && npx prisma db seed`)
3. Mock data seeded (`POST /api/showcase/mock/seed` with admin token)
4. Node.js 20+

## Setup

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

`.env` file:
```
VITE_API_URL=http://localhost:3000
```

The app will open at `http://localhost:5173`.

## Login

Navigate to `http://localhost:5173/login`. Use seed credentials:

| Email | Password | Role |
|-------|----------|------|
| admin@agentos.dev | admin123 | admin |
| approver@agentos.dev | approver123 | approver |
| viewer@agentos.dev | viewer123 | viewer |

## Walkthrough

1. **Login** → enter admin credentials → redirected to Dashboard
2. **Dashboard** → see stat cards, agent health table, live feed (if SSE connected)
3. **Agents** → browse agent list, try filters, click "Register Agent" to create one
4. **Agent Detail** → click any agent row → see header, stats, tabs
5. **Approvals** → view pending tickets, approve/deny one
6. **Audit** → filter by agent or event type, click a row to see trace drawer
7. **Analytics** → switch time ranges, explore cost charts and leaderboard
8. **Policies** → view all policies and their rules (read-only)

## Verify SSE

Open the browser console. You should see:
```
[SSE] Connected to event stream
```

If you run a showcase agent from another terminal, events should appear in the Dashboard live feed within seconds.
