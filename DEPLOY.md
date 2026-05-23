# Deploy Instructions for alpha-orchestrator

## Prerequisites

1. **Cloudflare account** with Workers permission
2. **Wrangler CLI** authenticated

## Authentication

```bash
# If not logged in:
npx wrangler login

# Verify authentication:
npx wrangler whoami
```

## Deployment

```bash
cd apps/alpha-orchestrator
npx wrangler deploy
```

## Post-Deploy Verification

After deployment completes, you'll see the live URL. Run:

```bash
curl -i https://alpha-orchestrator.<your-subdomain>.workers.dev/health
```

Expected output:
```
HTTP/2 200
{"status":"healthy","version":1,...}
```

## Current Status

| Item | Status |
|------|--------|
| Code | ✅ Committed (e076c64) |
| Auth | ❌ Needs `wrangler login` |
| Deploy | ⏳ Pending |

## Files Ready

- `apps/alpha-orchestrator/src/orchestration-brain.ts` — DO with FSM, TTL locks, idempotency
- `apps/alpha-orchestrator/src/index.ts` — HTTP interface
- `wrangler.toml` — Configuration with migrations

## After Deploy

Once live, the following endpoints are available:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | System status |
| `/state` | GET | Current state snapshot |
| `/transition` | POST | Apply FSM-validated transition |
| `/transition/idempotent` | POST | Idempotent transition |
| `/agents` | GET | List agent states |
| `/lock` | GET/POST | Lock management with TTL |
| `/events` | GET | Event log |
| `/snapshot` | GET | Full state + events |