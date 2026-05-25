# Follow-Up Issues: Restate Integration Enhancements

**Created:** 2026-05-25  
**Based on:** RESTATE_AUDIT_REPORT.md  
**Priority:** P2 (Should Have Before Implementation)

---

## Issue 1: Add Monitoring & Observability Configuration

**Issue ID:** RESTATE-407  
**Type:** Enhancement  
**Priority:** P2 - Should Have  
**Effort:** 4 hours  
**Owner:** DevOps + Backend  
**Phase:** Phase 4 (Week 7-8)  

### Description
Add comprehensive monitoring and alerting for Restate workflows to ensure production observability.

### Acceptance Criteria
- [ ] Grafana dashboard created with 5+ key metrics
- [ ] Prometheus configured to scrape Restate metrics endpoint
- [ ] PagerDuty alerts configured for critical failures
- [ ] Slack notifications for warnings
- [ ] Documentation updated (HLD Appendix 8.6)

### Implementation Tasks
1. Create Grafana dashboard JSON template
2. Configure Prometheus scraping:
   ```yaml
   scrape_configs:
     - job_name: 'restate'
       static_configs:
         - targets: ['restate:9070']
   ```
3. Set up alert rules:
   - WorkflowErrorRate > 5% → PagerDuty
   - RestateMemoryUsage > 80% → Slack
   - WorkflowP99Latency > 30s → Slack
4. Test alerts in staging
5. Update HLD with monitoring section

### Metrics to Track
```
# Restate workflow metrics
workflow_invocations_total{workflow_type, status}
workflow_duration_seconds{workflow_type, quantile}
workflow_errors_total{workflow_type, error_type}
workflow_suspended_count{workflow_type}

# Restate runtime metrics
restate_memory_usage_bytes
restate_cpu_usage_percent
restate_event_log_size_bytes
restate_active_handlers_count
```

### Dependencies
- Phase 4 completion (workflows in staging)
- Prometheus/Grafana infrastructure available

---

## Issue 2: Set Up CI/CD Pipeline for Workflow Service

**Issue ID:** RESTATE-106  
**Type:** Infrastructure  
**Priority:** P2 - Should Have  
**Effort:** 6 hours  
**Owner:** DevOps  
**Phase:** Phase 1 (Week 1-2)  

### Description
Automate build, test, and deployment of the workflow service using GitHub Actions.

### Acceptance Criteria
- [ ] GitHub Actions workflow created (`.github/workflows/workflows-service.yml`)
- [ ] Automated Docker build on merge to main
- [ ] Automated tests run in CI
- [ ] Deploy to dev environment on success
- [ ] Deploy to staging requires manual approval
- [ ] Rollback mechanism documented

### Implementation Tasks
1. Create GitHub Actions workflow file
2. Configure Docker build and push to registry
3. Add automated tests (unit + integration)
4. Set up deployment to dev (auto)
5. Set up deployment to staging (manual approval)
6. Add rollback script
7. Update task breakdown documentation

### GitHub Actions Workflow (Draft)
```yaml
name: Workflow Service CI/CD

on:
  push:
    branches: [main]
    paths:
      - 'apps/workflows/**'
  pull_request:
    paths:
      - 'apps/workflows/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test --workspace=apps/workflows

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          context: ./apps/workflows
          push: true
          tags: agentos/workflows:${{ github.sha }}

  deploy-dev:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: kubectl set image deployment/workflows workflows=agentos/workflows:${{ github.sha }}
```

### Dependencies
- Docker registry access
- Kubernetes cluster (or Docker Compose remote)
- GitHub Actions secrets configured

---

## Issue 3: Add Windows Development Support to Quickstart

**Issue ID:** DOC-301  
**Type:** Documentation  
**Priority:** P3 - Nice to Have  
**Effort:** 2 hours  
**Owner:** Technical Writer / Backend  
**Phase:** Phase 3 (Week 5)  

### Description
Add Windows-specific setup instructions to RESTATE_QUICKSTART.md for developers on Windows.

### Acceptance Criteria
- [ ] Section 1.1 "Windows-Specific Notes" added
- [ ] Docker Desktop for Windows setup documented
- [ ] Path differences explained (C:\ vs /)
- [ ] PowerShell equivalents for bash commands
- [ ] WSL2 alternative mentioned

### Content to Add
```markdown
### 1.1 Windows-Specific Notes

**Docker Desktop:**
- Download from https://www.docker.com/products/docker-desktop
- Enable WSL2 backend in settings
- Allocate at least 4GB RAM in Docker settings

**Path Differences:**
- Unix: `/home/user/AgentOS`
- Windows: `C:\Users\user\AgentOS`
- Docker volumes: Use forward slashes in docker-compose.yml

**PowerShell Commands:**
```powershell
# Instead of: curl http://localhost:9070/health
Invoke-WebRequest http://localhost:9070/health

# Instead of: export RESTATE_URL=...
$env:RESTATE_URL = "http://localhost:8080"
```

**Recommended: Use WSL2**
For best experience, use WSL2 (Windows Subsystem for Linux):
1. Install WSL2: `wsl --install`
2. Install Ubuntu from Microsoft Store
3. Follow Unix setup instructions
```

### Dependencies
- Access to Windows machine for testing
- RESTATE_QUICKSTART.md exists

---

## Issue 4: Add VS Code Debugging Configuration

**Issue ID:** DOC-302  
**Type:** Documentation  
**Priority:** P3 - Nice to Have  
**Effort:** 1 hour  
**Owner:** Backend  
**Phase:** Phase 2 (Week 3-4)  

### Description
Add VS Code debugging configuration for workflow service to improve developer experience.

### Acceptance Criteria
- [ ] `.vscode/launch.json` created for workflow service
- [ ] Debugging instructions added to RESTATE_QUICKSTART.md
- [ ] Breakpoints working in workflow handlers
- [ ] Environment variables configured
- [ ] README updated

### Implementation
```json
// apps/workflows/.vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Workflow Service",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/apps/workflows",
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/agentos",
        "RESTATE_URL": "http://localhost:8080",
        "ANTHROPIC_API_KEY": "${env:ANTHROPIC_API_KEY}"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/apps/workflows/dist/**/*.js"]
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Workflow Service",
      "port": 9229,
      "restart": true,
      "sourceMaps": true
    }
  ]
}
```

### Documentation Addition
```markdown
### 6. Debugging Workflows in VS Code

**Setup:**
1. Open `apps/workflows` in VS Code
2. Copy `.vscode/launch.json.example` to `.vscode/launch.json`
3. Update environment variables

**Usage:**
1. Press F5 or click "Run > Start Debugging"
2. Set breakpoints in workflow handlers
3. Invoke workflow via curl
4. Debugger pauses at breakpoints

**Tips:**
- Use "Debug Console" to inspect `ctx` object
- Watch variables: `ctx.key`, `ctx.random`, workflow state
- Step through `ctx.run()` calls to see durability in action
```

---

## Issue 5: Document Workflow Versioning Strategy

**Issue ID:** DOC-303  
**Type:** Documentation  
**Priority:** P3 - Nice to Have  
**Effort:** 3 hours  
**Owner:** Backend + Tech Lead  
**Phase:** Phase 4 (Week 7-8)  

### Description
Document strategy for deploying workflow updates without breaking in-flight workflows.

### Acceptance Criteria
- [ ] Versioning strategy documented in HLD
- [ ] Example workflow migration provided
- [ ] Testing approach for compatibility
- [ ] Rollback procedure for bad deployments

### Content Outline
```markdown
## Workflow Versioning Strategy

### Approach: Versioned Workflow Names

**Current:** `email-approval`  
**New Version:** `email-approval-v2`

### Migration Process
1. Deploy new workflow handler (`email-approval-v2`)
2. Register with Restate (both versions active)
3. Update SDK to invoke v2 for new workflows
4. Wait for v1 workflows to complete (monitor count)
5. Deprecate v1 after 30 days

### Breaking vs Non-Breaking Changes

**Non-Breaking (Safe):**
- Add new optional steps
- Improve error messages
- Update logging
- Add new fields to output

**Breaking (Needs New Version):**
- Change step order
- Remove steps
- Change promise names
- Modify input/output schemas

### Testing
```typescript
describe('Workflow Compatibility', () => {
  it('v2 can read v1 state', async () => {
    // Start workflow with v1
    const id = await startWorkflow('email-approval', data);
    
    // Deploy v2
    await deployNewVersion();
    
    // Resolve promise (should work)
    await resolvePromise(id, 'APPROVED');
    
    // Verify completion
    const result = await getWorkflowStatus(id);
    expect(result.status).toBe('COMPLETED');
  });
});
```
```

---

## Issue 6: Add Future Considerations to HLD

**Issue ID:** DOC-304  
**Type:** Documentation  
**Priority:** P3 - Nice to Have  
**Effort:** 2 hours  
**Owner:** Tech Lead  
**Phase:** Phase 5 (Week 8)  

### Description
Document future architectural considerations for scale and advanced use cases.

### Acceptance Criteria
- [ ] Section 8.7: Multi-agent orchestration added
- [ ] Section 8.8: Restate cluster mode (HA) added
- [ ] Section 8.9: Advanced patterns added
- [ ] Migration path to Temporal discussed

### Content Outline
```markdown
## Appendix 8.7: Future Considerations

### 8.7.1 Multi-Agent Orchestration

**Scenario:** Agent A needs to invoke Agent B's workflow

**Approach 1: Direct Invocation**
```typescript
// Agent A workflow
const agentBResult = await ctx.run('invoke-agent-b', async () => {
  return await invokeWorkflow('agent-b-workflow', data);
});
```

**Approach 2: Event-Driven**
- Agent A emits event → Event bus → Agent B consumes

### 8.7.2 Restate Cluster Mode (High Availability)

**When to Consider:** >5,000 workflows/day or 99.99% uptime required

**Setup:**
- 3+ Restate nodes
- Shared state store (RocksDB + S3 backup)
- Load balancer (nginx/HAProxy)
- Consul/etcd for coordination

### 8.7.3 Advanced Patterns

**Saga Pattern:** Distributed transactions with compensations
**Child Workflows:** Workflows spawning sub-workflows
**Workflow Queries:** Query workflow state without side effects
**Scheduled Workflows:** Cron-like recurring executions

### 8.7.4 Migration to Temporal

**Trigger:** Outgrow Restate (>10,000 workflows/day, polyglot needs)

**Migration Path:**
1. Concepts map 1:1 (ctx.run → activity, ctx.promise → signal)
2. Rewrite workflows using Temporal SDK
3. Deploy Temporal cluster
4. Gradual migration (new workflows → Temporal, old → Restate)
5. Deprecate Restate after all workflows completed
```

---

## Priority Summary

| Issue ID | Title | Priority | Effort | Phase |
|----------|-------|----------|--------|-------|
| RESTATE-407 | Monitoring & Alerts | **P2** | 4h | Week 7-8 |
| RESTATE-106 | CI/CD Pipeline | **P2** | 6h | Week 1-2 |
| DOC-301 | Windows Support | P3 | 2h | Week 5 |
| DOC-302 | VS Code Debugging | P3 | 1h | Week 3-4 |
| DOC-303 | Workflow Versioning | P3 | 3h | Week 7-8 |
| DOC-304 | Future Considerations | P3 | 2h | Week 8 |

**Total Effort:** 18 hours  
**Critical (P2):** 10 hours  
**Nice-to-Have (P3):** 8 hours

---

**Created:** 2026-05-25  
**Review:** Add to backlog after HLD/LLD approval  
**Tracking:** Create Jira/Linear tickets from this document
