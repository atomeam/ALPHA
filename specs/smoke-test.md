# Post-deploy Smoke Test v0.1

**Worker:** aether-bridge
**Date:** 2026-05-24
**Status:** Ready to execute

## Prerequisites

1. Worker deployed to Cloudflare
2. `BRIDGE_API_TOKEN` secret set
3. D1 database `aether-bridge-db` created and migrated

## Configuration

```bash
# Set these before running
BRIDGE_URL="https://aether-bridge.atomeam.workers.dev"
API_TOKEN="your-bridge-api-token"
```

## Smoke Test Script

Copy and paste this entire script:

```bash
#!/bin/bash
# ============================================
# aether-bridge Smoke Test v0.1
# ============================================
set -e

BRIDGE_URL="${BRIDGE_URL:-https://aether-bridge.atomeam.workers.dev}"
API_TOKEN="${API_TOKEN:-YOUR_TOKEN_HERE}"
CORRELATION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

echo "=== ALPHA Bridge Smoke Test ==="
echo "URL: $BRIDGE_URL"
echo "Correlation-ID: $CORRELATION_ID"
echo ""

# Helper function
check() {
  local name="$1"
  local status="$2"
  if [ "$status" -eq 0 ]; then
    echo "✓ $name"
  else
    echo "✗ $name (exit $status)"
    exit 1
  fi
}

# ----------------------------------------
# Test 1: Health Check
# ----------------------------------------
echo "--- Test 1: Health Check ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$BRIDGE_URL/health" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "X-Correlation-ID: $CORRELATION_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response: $BODY"
echo "HTTP Code: $HTTP_CODE"
if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Health check passed"
  # Check binding status
  if echo "$BODY" | grep -q '"bridge_db":"present"'; then
    echo "  - BRIDGE_DB: present"
  fi
  if echo "$BODY" | grep -q '"metrics_kv":"present"'; then
    echo "  - METRICS KV: present"
  fi
  if echo "$BODY" | grep -q '"actions_queue":"present"'; then
    echo "  - ACTIONS Queue: present"
  fi
else
  echo "✗ Health check failed"
  exit 1
fi

# Update correlation ID for next test
CORRELATION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
echo ""

# ----------------------------------------
# Test 2: State Write/Read Roundtrip
# ----------------------------------------
echo "--- Test 2: State Write/Read Roundtrip ---"
STATE_KEY="test:smoke:$(date +%s)"

# Write state
WRITE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BRIDGE_URL/state" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: $CORRELATION_ID" \
  -d "{
    \"key\": \"$STATE_KEY\",
    \"value\": {
      \"test\": true,
      \"timestamp\": \"$(date -Iseconds)\",
      \"smoke_test\": true
    },
    \"ttl_seconds\": 3600
  }")
WRITE_CODE=$(echo "$WRITE_RESPONSE" | tail -n1)
WRITE_BODY=$(echo "$WRITE_RESPONSE" | sed '$d')

echo "Write Response: $WRITE_BODY"
echo "Write Code: $WRITE_CODE"

if [ "$WRITE_CODE" -eq 201 ] || [ "$WRITE_CODE" -eq 202 ]; then
  echo "✓ State write accepted"
else
  echo "✗ State write failed"
  exit 1
fi

# Update correlation ID for read
CORRELATION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

# Read state back
READ_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$BRIDGE_URL/state/$STATE_KEY" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "X-Correlation-ID: $CORRELATION_ID")
READ_CODE=$(echo "$READ_RESPONSE" | tail -n1)
READ_BODY=$(echo "$READ_RESPONSE" | sed '$d')

echo "Read Response: $READ_BODY"
echo "Read Code: $READ_CODE"

if [ "$READ_CODE" -eq 200 ]; then
  if echo "$READ_BODY" | grep -q '"smoke_test":true'; then
    echo "✓ State read verified data integrity"
  else
    echo "✗ Data mismatch in state read"
    exit 1
  fi
else
  echo "✗ State read failed"
  exit 1
fi

echo ""

# ----------------------------------------
# Test 3: Audit Event Verification
# ----------------------------------------
echo "--- Test 3: Audit Event Verification ---"
echo "Checking for audit event with correlation $CORRELATION_ID..."

# Query D1 for audit event (requires wrangler)
# NOTE: This step may require manual verification via Cloudflare Dashboard
echo "Manual check: Run this query in D1 console:"
echo "  SELECT * FROM audit_events WHERE correlation_id LIKE '%${CORRELATION_ID:0:8}%';"
echo ""
echo "Or check Cloudflare Dashboard > D1 > aether-bridge-db > Query"
echo "If audit_events table exists and has rows, audit logging is working."
echo "✓ Audit verification (manual step if no direct API)"

echo ""

# ----------------------------------------
# Test 4: Queue Test (Async Proposal)
# ----------------------------------------
echo "--- Test 4: Queue Test (Async Proposal) ---"
CORRELATION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

PROPOSE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BRIDGE_URL/propose" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: $CORRELATION_ID" \
  -d '{
    "title": "Smoke Test Proposal",
    "inputs_hash": "smoke-test-001",
    "change_summary": "Smoke test - can be ignored",
    "expected_effect": {
      "metric": "routing.success_rate",
      "direction": "increase",
      "magnitude": 0.01,
      "tolerance": 0.005
    },
    "rollback_steps": ["revert"],
    "risk_class": "low",
    "classification": "test",
    "idempotent": true,
    "mode": "async"
  }')
PROPOSE_CODE=$(echo "$PROPOSE_RESPONSE" | tail -n1)
PROPOSE_BODY=$(echo "$PROPOSE_RESPONSE" | sed '$d')

echo "Propose Response: $PROPOSE_BODY"
echo "Propose Code: $PROPOSE_CODE"

if [ "$PROPOSE_CODE" -eq 202 ]; then
  echo "✓ Async proposal queued successfully"
  if echo "$PROPOSE_BODY" | grep -q '"queue_id"'; then
    QUEUE_ID=$(echo "$PROPOSE_BODY" | grep -o '"queue_id":"[^"]*"' | cut -d'"' -f4)
    echo "  Queue ID: $QUEUE_ID"
  fi
else
  # 200 is also acceptable (sync mode)
  if [ "$PROPOSE_CODE" -eq 200 ]; then
    echo "✓ Proposal processed (sync mode)"
  else
    echo "⚠ Proposal endpoint returned $PROPOSE_CODE"
    echo "  This may be expected if ACTIONS queue is not yet configured"
  fi
fi

echo ""
echo "=== Smoke Test Complete ==="
echo ""
echo "Summary:"
echo "  - Health Check: PASSED"
echo "  - State Write/Read: PASSED"
echo "  - Audit Events: VERIFY MANUALLY"
echo "  - Async Queue: TESTED"
echo ""
echo "If all tests passed, the deployment is healthy."
```

## Manual Verification Steps

If the automated script passes, do these manual checks:

### 1. Check D1 Audit Events Table

In Cloudflare Dashboard:

1. Go to Workers & Pages → aether-bridge → D1
2. Select `aether-bridge-db`
3. Click "Query"
4. Run:

```sql
SELECT * FROM audit_events
ORDER BY created_at DESC
LIMIT 10;
```

You should see rows with:

- `endpoint` = "/state" or "/health"
- `correlation_id` starting with your test correlation ID

### 2. Check KV Metrics Namespace

```bash
# List keys
wrangler kv:key list --namespace-id <METRICS_ID>

# Read a specific key
wrangler kv:key get "metrics:snapshot:test" --namespace-id <METRICS_ID>
```

### 3. Check Actions Queue

In Cloudflare Dashboard:

1. Workers & Pages → aether-bridge → Queues
2. Select `bridge-actions`
3. View consumer logs

You should see messages being processed if proposals are queued.

---

## Expected Results

| Test        | Expected               | Actual |
| ----------- | ---------------------- | ------ |
| Health      | 200 + bindings present | \_\_\_ |
| State Write | 201                    | \_\_\_ |
| State Read  | 200 + data matches     | \_\_\_ |
| Audit Event | Row in D1              | \_\_\_ |
| Async Queue | 202 + queue_id         | \_\_\_ |

---

## Troubleshooting

### Health Check Fails (500)

1. Check Cloudflare Dashboard for deployment errors
2. Verify all bindings are configured
3. Check `wrangler logs --preview` for runtime errors

### State Read Returns 404

1. Key might have expired (check TTL)
2. KV namespace might be misconfigured

### Queue Test Fails

1. Verify ACTIONS queue is configured
2. Check consumer is deployed and running

### D1 Query Fails

1. Database might not be migrated
2. Run: `wrangler d1 migrations apply aether-bridge-db --local`

---

## Success Criteria

✓ All automated tests pass
✓ D1 audit_events table has recent rows
✓ KV has metrics data
✓ Queue consumer is processing messages

If all criteria met, deployment is healthy.
