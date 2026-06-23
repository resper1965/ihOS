#!/bin/bash
# scripts/run_cron.sh
# Triggers the proactive compliance triggers cron endpoint locally

BASE_URL=${1:-"http://localhost:3000"}
CRON_SECRET_VALUE=${CRON_SECRET:-""}

echo "=== Triggering GRC Agentic Evolution Cron Triggers ==="
echo "Target Base URL: $BASE_URL"

if [ -n "$CRON_SECRET_VALUE" ]; then
  echo "Using authorization header..."
  curl -s -X GET "$BASE_URL/api/cron/agentic-triggers" \
    -H "Authorization: Bearer $CRON_SECRET_VALUE" \
    -H "Content-Type: application/json" | json_pp 2>/dev/null || curl -s -X GET "$BASE_URL/api/cron/agentic-triggers" -H "Authorization: Bearer $CRON_SECRET_VALUE"
else
  echo "No CRON_SECRET env variable detected. Running request directly..."
  curl -s -X GET "$BASE_URL/api/cron/agentic-triggers" | json_pp 2>/dev/null || curl -s -X GET "$BASE_URL/api/cron/agentic-triggers"
fi

echo -e "\n=== Execution Completed ==="
