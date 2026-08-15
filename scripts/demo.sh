#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

NOW="$(
  date -u +"%Y-%m-%dT%H:%M:%SZ"
)"

SINCE="$(
  date -u \
    -d "10 minutes ago" \
    +"%Y-%m-%dT%H:%M:%SZ"
)"

UNTIL="$(
  date -u \
    -d "1 minute" \
    +"%Y-%m-%dT%H:%M:%SZ"
)"

echo
echo "======================================"
echo "1. HEALTH"
echo "======================================"

curl -s \
  "${BASE_URL}/health"

echo
echo
echo "======================================"
echo "2. INGEST SAMPLE LOGS"
echo "======================================"

curl -s \
  -X POST \
  "${BASE_URL}/logs" \
  -H "content-type: application/json" \
  -d "{
    \"logs\": [
      {
        \"timestamp\": \"${NOW}\",
        \"level\": \"error\",
        \"service\": \"checkout\",
        \"message\": \"Payment declined during competition demo\",
        \"attributes\": {
          \"region\": \"eu-west\",
          \"retries\": 3,
          \"premium\": true
        }
      },
      {
        \"timestamp\": \"${NOW}\",
        \"level\": \"info\",
        \"service\": \"auth\",
        \"message\": \"User authenticated successfully\",
        \"attributes\": {
          \"region\": \"eu-west\",
          \"premium\": false
        }
      },
      {
        \"timestamp\": \"${NOW}\",
        \"level\": \"warn\",
        \"service\": \"checkout\",
        \"message\": \"Checkout request is slow\",
        \"attributes\": {
          \"region\": \"us-east\",
          \"retries\": 1
        }
      }
    ]
  }"

echo
echo
echo "======================================"
echo "3. FILTER BY SERVICE"
echo "======================================"

curl -s \
  "${BASE_URL}/logs?service=checkout&limit=10"

echo
echo
echo "======================================"
echo "4. FILTER BY ATTRIBUTE"
echo "======================================"

curl -s \
  "${BASE_URL}/logs?attr.region=eu-west&limit=10"

echo
echo
echo "======================================"
echo "5. LITERAL MESSAGE SEARCH"
echo "======================================"

curl -s \
  "${BASE_URL}/logs?q=payment&limit=10"

echo
echo
echo "======================================"
echo "6. AGGREGATION"
echo "======================================"

curl -s \
  "${BASE_URL}/logs/aggregate?since=${SINCE}&until=${UNTIL}&bucket=1m&group_by=service"

echo
echo
echo "======================================"
echo "DEMO COMPLETED"
echo "======================================"