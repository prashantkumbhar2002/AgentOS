# Repository API Contracts

This refactor does not change any external API contracts. All changes are internal.

## Internal Contracts

### Service → Repository

Services call repository methods through typed interfaces. Services MUST NOT:
- Import `PrismaClient` or any `@prisma/client` symbol
- Construct database queries directly
- Access database-specific types (e.g., `Prisma.JsonNull`, `Prisma.AgentWhereInput`)

### Route → Service

Routes access services through `fastify.services.<name>`. Routes MUST NOT:
- Construct service instances directly
- Pass `PrismaClient` to service methods

### Container → Fastify

The composition root is invoked in the Prisma plugin after the client is ready:

```
createContainer(prisma: PrismaClient) → ServiceContainer
fastify.decorate('services', container)
```

### ServiceContainer Shape

```
interface ServiceContainer {
  agentService:    AgentService
  auditService:    AuditService
  approvalService: ApprovalService
  policyService:   PolicyService
  analyticsService: AnalyticsService
}
```

## Unchanged External Contracts

All HTTP endpoints, request schemas, response shapes, status codes, and authentication requirements remain identical. This is verified by the existing Supertest integration test suite passing at 100%.
