# Quickstart: Repository Pattern Refactor

## Verifying the Refactor

### 1. Run existing integration tests (regression check)

```bash
cd apps/api
npm run test
```

All existing tests must pass with zero changes to assertions.

### 2. Run new unit tests (business logic check)

```bash
cd apps/api
npx vitest run --reporter=verbose src/modules/**/*.unit.test.ts
```

Unit tests run in milliseconds with no database dependency.

### 3. Verify no Prisma imports in services

```bash
grep -r "from '@prisma/client'" apps/api/src/modules/*/  --include="*.service.ts"
grep -r "from '@prisma/client'" apps/api/src/modules/*/  --include="*evaluator.ts"
```

Expected output: zero matches.

### 4. Verify no unknown/any return types

```bash
grep -rn "unknown\|: any" apps/api/src/modules/*/*.service.ts | grep -v "test"
```

Expected output: zero matches in function signatures.

### 5. Boot the application

```bash
npm run dev
```

API starts on port 3000 with all services wired through the container.

### 6. Test end-to-end flow

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agentos.dev","password":"admin123"}' | \
  grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# All endpoints should work identically
curl -s http://localhost:3000/api/agents -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/approvals -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/analytics/costs -H "Authorization: Bearer $TOKEN"
```
