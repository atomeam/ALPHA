# Cloudflare Workers Setup Guide

This guide walks through setting up the Cloudflare Workers deployment for Alpha's self-improving loop.

## Current Configuration

Your Cloudflare resources are already configured:

| Resource | ID | Name |
|----------|-----|------|
| KV Namespace | `f3171ead95434d0a9be7a3a2526700b8` | self-adaptive-metrics |
| Queue | `21ba5f44bfe34956b44f14ce10aa2b7b` | adaptive-actions |
| DO Namespace | `7c03bd81d8ea4435829ab42ee2ce2ddc` | AssessmentBrain |

Worker URL: `self-adaptive-app.atomicmoonbeam88.workers.dev`

### Current Worker Endpoints (already deployed)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Worker info and bindings |
| `/health` | GET | Health check: `{"status":"alive","id":"global"}` |
| `/state` | GET | Full state: metrics, thresholds, assessment, action history |
| `/metrics` | POST | Report metrics (JSON body) |
| `/assess` | GET | Force assessment check |
| `/thresholds` | POST | Update thresholds (JSON body) |

The Worker runs the AssessmentBrain Durable Object. Metrics from PR #20 (`/api/metrics`) will be added when that PR is merged and deployed.

### Current R2 Bucket

- **Bucket**: `aether-logs` exists and is ready as Logpush destination

## Step 1: Create API Token (if not already)

If you don't have an API token yet:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Profile → API Tokens
2. Create Custom Token with these permissions:
   - **Account**: Workers Scripts (Edit)
   - **Account**: Workers KV Namespaces (Edit)
   - **Account**: Workers Queues (Edit)
   - **Account**: Workers Routes (Edit)

## Step 2: Configure GitHub Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Value |
|-------------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | `atomicmoonbeam88` (your Cloudflare account ID) |
| `CLOUDFLARE_API_TOKEN` | API token from Step 1 |
| `OPENHANDS_CLOUD_API_KEY` | From app.all-hands.dev → Settings → API Keys |

### Add GitHub Variables

| Variable Name | Value |
|--------------|-------|
| `CLOUDFLARE_PAGES_SUBDOMAIN` | `atomicmoonbeam88` |

## Step 3: Update wrangler.toml (already done)

The `apps/backend/wrangler.toml` is pre-configured with your real binding IDs:
- KV: `f3171ead95434d0a9be7a3a2526700b8`
- Queue: `adaptive-actions`
- DO: `ASSESSMENT_BRAIN` (AssessmentBrain class)

## Step 4: Set Worker Secrets

For production secrets that shouldn't be in environment variables:

```bash
cd apps/backend

# Set required secrets (will prompt for values securely)
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENHANDS_CLOUD_API_KEY
wrangler secret put NOTION_TOKEN
# ... etc for all integration keys
```

## Step 5: Connect Repository to OpenHands Cloud

1. Go to [app.all-hands.dev](https://app.all-hands.dev)
2. Navigate to Settings → Repositories
3. Click "Add Repository"
4. Select `atomeam/ALPHA`
5. Configure permissions (read/write for PR creation)

## Step 6: Test the Pipeline

### 6.1 Manual Smoke Test

```bash
# Build locally
cd apps/backend
pnpm build

# Deploy to preview (dry run first)
wrangler deploy --env preview --dry-run

# Actually deploy
wrangler deploy --env preview

# Check deployment
curl https://self-adaptive-app.<your-subdomain>.workers.dev/api/health
```

### 6.2 Trigger First Improvement Cycle

```bash
# Via GitHub Actions UI
# 1. Go to Actions tab
# 2. Select "alpha-self-improvement"
# 3. Click "Run workflow"
# 4. Leave defaults or specify custom objective file

# Via CLI
gh workflow run alpha-self-improve.yml
```

### 6.3 Monitor OpenHands

1. Go to [app.all-hands.dev/conversations](https://app.all-hands.dev/conversations)
2. Find the "Alpha self-improvement cycle" conversation
3. Watch it analyze code, make changes, open PRs

## First Run Checklist

Before running the first full self-improvement cycle:

- [x] Cloudflare resources exist (KV, queues, DO)
- [ ] GitHub secrets configured (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OPENHANDS_CLOUD_API_KEY`)
- [x] wrangler.toml updated with real IDs
- [ ] Worker secrets set via `wrangler secret put`
- [ ] Repository connected in OpenHands Cloud
- [ ] PR #20 merged to main

## Deployment Flow

```
OpenHands Agent                    GitHub Actions                  Cloudflare
     │                                   │                              │
     ▼                                   ▼                              ▼
Edit code ─────────────────────────► PR opened                      
                                    │                              
                                    ▼                              
                               CI: lint ────────────────────────────► validate
                               CI: test                              
                               CI: build                             
                                    │                                
                                    ▼                                
                    wrangler deploy --env preview ──────────────────► Deploy
                                    │                                
                                    ▼                                
                               Smoke tests                          
                                    │                                
                                    ▼                                
                    If PR merge: deploy --env production ────────────► Deploy
                                    │                                
                                    ▼                                
                               Monitor + auto-revert on errors       
```

## Troubleshooting

### Wrangler not authenticated

```bash
wrangler login
```

### Secrets not found

```bash
# Check what secrets are set
wrangler secret list

# Set missing secrets
wrangler secret put SECRET_NAME
```

### Deployment failing

```bash
# Check for errors
wrangler deploy --env preview --verbose

# View recent deployments
wrangler deployments list
```

### Metrics endpoint not working

1. Check Worker logs: `wrangler tail`
2. Verify KV binding: `wrangler kv:key list --env preview`
3. Test locally: `wrangler dev --env preview`

## Rollback

If a deployment causes issues:

```bash
# Rollback to previous version
wrangler deployments rollback --env production

# Or specific version
wrangler deployments rollback --env production --message "v1.2.3"
```

## Next Steps

After first successful deployment:

1. **Verify telemetry**: Check `/api/metrics` returns expected data
2. **Run improvement cycle**: Trigger `alpha-self-improve` workflow
3. **Monitor first PR**: Confirm OpenHands follows `alpha_objectives.md`
4. **Review changes**: Ensure constraint zones are respected
5. **Iterate**: Adjust objectives and guardrails based on results