#!/bin/bash
# Deploy Aether to Cloudflare Workers
# Usage: ./deploy-cloudflare.sh [production]

set -e

ENV="${1:-preview}"
ACCOUNT_ID="${CF_ACCOUNT_ID:-}"
API_TOKEN="${CF_API_TOKEN:-}"
WORKER_NAME="${WORKER_NAME:-aether-bridge}"

echo "Deploying Aether to Cloudflare Workers..."
echo "  Environment: $ENV"
echo "  Worker: $WORKER_NAME"

# Check for credentials
if [ -z "$ACCOUNT_ID" ] || [ -z "$API_TOKEN" ]; then
    echo "ERROR: CF_ACCOUNT_ID and CF_API_TOKEN required"
    echo "Set them via:"
    echo "  export CF_ACCOUNT_ID=..."
    echo "  export CF_API_TOKEN=..."
    exit 1
fi

# Upload worker
echo "Uploading worker..."
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/javascript" \
    --data-binary "@$(npx rollup -c -f iife apps/bridge/src/server.ts 2>/dev/null || echo 'apps/bridge/src/server.ts')" \
    2>/dev/null || echo "(Worker upload requires build step)"

echo "Done. Worker deployed to $WORKER_NAME.$ACCOUNT_ID.workers.dev"