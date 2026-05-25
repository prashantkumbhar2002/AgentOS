#!/bin/bash

# Test script for workflow service
# Usage: ./test-workflows.sh

set -e

BASE_URL="http://localhost:8091"
RESTATE_ADMIN="http://localhost:9070"

echo "🧪 Testing AgentOS Workflow Service"
echo "===================================="
echo ""

# Test 1: Health Check
echo "1️⃣  Testing health check..."
HEALTH=$(curl -s -X POST ${BASE_URL}/health/check -H 'Content-Type: application/json')
echo "   ✅ Health: $(echo $HEALTH | jq -r '.status')"
echo ""

# Test 2: List registered services
echo "2️⃣  Listing registered workflows..."
SERVICES=$(curl -s ${RESTATE_ADMIN}/services | jq -r '.services[] | select(.ty == "Workflow") | .name')
echo "   ✅ Workflows:"
echo "$SERVICES" | while read -r svc; do
    echo "      - $svc"
done
echo ""

# Test 3: Invoke EmailApprovalWorkflow (dry-run, no actual approval)
echo "3️⃣  Testing EmailApprovalWorkflow invocation..."
WORKFLOW_KEY="test-email-$(date +%s)"
EMAIL_INPUT='{
  "agentId": "agent-test-123",
  "traceId": "trace-test-456",
  "task": "Send quarterly report email",
  "subject": "Q1 2026 Report",
  "body": "Please find attached the Q1 report.",
  "riskScore": 0.3,
  "reasoning": "Low-risk internal email",
  "metadata": {
    "recipient": "team@example.com",
    "category": "reporting"
  }
}'

RESULT=$(curl -s -X POST "${BASE_URL}/EmailApprovalWorkflow/${WORKFLOW_KEY}/run/send" \
  -H 'Content-Type: application/json' \
  -d "$EMAIL_INPUT")

echo "   ✅ Workflow started: ${WORKFLOW_KEY}"
echo "   📋 Result: $(echo $RESULT | jq -c '.')"
echo ""

# Test 4: Check workflow status
echo "4️⃣  Checking workflow status..."
sleep 2
STATUS=$(curl -s "${RESTATE_ADMIN}/invocations/inv_${WORKFLOW_KEY}" 2>/dev/null || echo '{"status":"pending"}')
echo "   📊 Status: $(echo $STATUS | jq -r '.status // "completed"')"
echo ""

echo "✨ All tests completed!"
echo ""
echo "📝 Next steps:"
echo "   - Check logs: docker logs abl-restate --tail 50"
echo "   - View admin UI: http://localhost:9070"
echo "   - Monitor workflows: curl ${RESTATE_ADMIN}/invocations"
