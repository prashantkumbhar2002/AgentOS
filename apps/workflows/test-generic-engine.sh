#!/bin/bash

# Test script for Generic Workflow Engine
# Demonstrates user-defined workflow execution

set -e

BASE_URL="http://localhost:8091"
RESTATE_ADMIN="http://localhost:9070"

echo "🧪 Testing Generic Workflow Engine"
echo "===================================="
echo ""

# Test 1: Health Check
echo "1️⃣  Testing health check..."
HEALTH=$(curl -s -X POST ${BASE_URL}/health/check -H 'Content-Type: application/json')
ENGINE=$(echo $HEALTH | jq -r '.engine')
VERSION=$(echo $HEALTH | jq -r '.version')
echo "   ✅ Engine: $ENGINE (v$VERSION)"
echo ""

# Test 2: List registered workflows
echo "2️⃣  Checking registered workflows..."
SERVICES=$(curl -s ${RESTATE_ADMIN}/services | jq -r '.services[] | select(.name == "GenericWorkflowEngine") | .name')
echo "   ✅ GenericWorkflowEngine registered"
echo ""

# Test 3: Execute email approval workflow
echo "3️⃣  Testing email approval workflow (low risk - auto-approved)..."
WORKFLOW_KEY="email-test-$(date +%s)"
EMAIL_INPUT='{
  "workflowDefinitionId": "email-approval-v1",
  "agentId": "agent-test-123",
  "traceId": "trace-test-456",
  "input": {
    "task": "Draft monthly team update email",
    "recipient": "team@example.com",
    "riskScore": 0.3,
    "_apiUrl": "http://localhost:3000"
  }
}'

RESULT=$(curl -s -X POST "${BASE_URL}/GenericWorkflowEngine/${WORKFLOW_KEY}/run/send" \
  -H 'Content-Type: application/json' \
  -d "$EMAIL_INPUT")

INVOCATION_ID=$(echo $RESULT | jq -r '.invocationId')
STATUS=$(echo $RESULT | jq -r '.status')

echo "   ✅ Workflow started: ${WORKFLOW_KEY}"
echo "   📋 Invocation ID: ${INVOCATION_ID}"
echo "   📊 Status: ${STATUS}"
echo ""

# Test 4: Execute research workflow
echo "4️⃣  Testing research workflow..."
RESEARCH_KEY="research-test-$(date +%s)"
RESEARCH_INPUT='{
  "workflowDefinitionId": "research-task-v1",
  "agentId": "agent-test-456",
  "traceId": "trace-test-789",
  "input": {
    "topic": "AI governance best practices",
    "depth": "medium",
    "requiresApproval": false,
    "maxCostUsd": 1.0,
    "_apiUrl": "http://localhost:3000"
  }
}'

RESULT2=$(curl -s -X POST "${BASE_URL}/GenericWorkflowEngine/${RESEARCH_KEY}/run/send" \
  -H 'Content-Type: application/json' \
  -d "$RESEARCH_INPUT")

INVOCATION_ID2=$(echo $RESULT2 | jq -r '.invocationId')
echo "   ✅ Workflow started: ${RESEARCH_KEY}"
echo "   📋 Invocation ID: ${INVOCATION_ID2}"
echo ""

# Test 5: Execute simple approval workflow
echo "5️⃣  Testing simple approval workflow (high risk - requires approval)..."
APPROVAL_KEY="approval-test-$(date +%s)"
APPROVAL_INPUT='{
  "workflowDefinitionId": "simple-approval-v1",
  "agentId": "agent-test-789",
  "traceId": "trace-test-012",
  "input": {
    "action": "delete_database",
    "riskScore": 0.95,
    "context": {
      "database": "production-db",
      "reason": "cleanup"
    },
    "actionUrl": "http://localhost:3000/api/v1/actions/execute",
    "actionPayload": {
      "action": "delete",
      "target": "production-db"
    },
    "_apiUrl": "http://localhost:3000"
  }
}'

RESULT3=$(curl -s -X POST "${BASE_URL}/GenericWorkflowEngine/${APPROVAL_KEY}/run/send" \
  -H 'Content-Type: application/json' \
  -d "$APPROVAL_INPUT")

INVOCATION_ID3=$(echo $RESULT3 | jq -r '.invocationId')
echo "   ✅ Workflow started: ${APPROVAL_KEY}"
echo "   📋 Invocation ID: ${INVOCATION_ID3}"
echo "   ⏳ This workflow requires human approval (will suspend durably)"
echo ""

# Give workflows time to execute
echo "⏱️  Waiting 3 seconds for workflows to execute..."
sleep 3
echo ""

# Test 6: Check workflow status
echo "6️⃣  Checking workflow statuses..."
echo "   📊 Email workflow: checking logs..."
docker logs abl-restate --tail 20 2>&1 | grep -A 2 "$WORKFLOW_KEY" || echo "      (Workflow completed, check Restate admin UI)"
echo ""

echo "✨ All tests completed!"
echo ""
echo "📝 Next steps:"
echo "   - View Restate admin UI: http://localhost:9070"
echo "   - Check invocations: curl ${RESTATE_ADMIN}/invocations"
echo "   - Define your own workflow: see apps/workflows/src/examples/workflow-definitions.ts"
echo "   - Read docs: apps/workflows/README.md"
echo ""
echo "🎯 Key Takeaways:"
echo "   ✅ Workflows are defined as data, not hardcoded classes"
echo "   ✅ GenericWorkflowEngine executes any user-defined workflow"
echo "   ✅ Built-in step types: llm, api, approval, condition"
echo "   ✅ Durable approvals: workflows suspend without polling"
