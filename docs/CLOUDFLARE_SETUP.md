# Cloudflare Workers Setup Guide

This guide walks through setting up the Cloudflare Workers deployment for Alpha's self-improving loop.

## Prerequisites

- Cloudflare account with Workers & Pages enabled
- Wrangler CLI installed: `npm install -g wrangler`
- GitHub repo with secrets configured (see below)

## Step 1: Create Cloudflare Resources

### 1.1 Get Account ID

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to Workers & Pages → Overview
3. Copy your Account ID (visible near the top)

### 1.2 Create API Token

1. Go to Profile → API Tokens
2. Create Custom Token with these permissions:
   - **Account**: Workers Scripts (Edit)
   - **Account**: Workers KV Namespaces (Edit)
   - **Account**: Workers Queues (Edit)
   - **Account**: Workers Routes (Edit)
3. Save the token securely (shown only once)

### 1.3 Create KV Namespace

```bash
# Login to Wrangler
wrangler login

# Create METRICS namespace for production
wrangler kv:namespace create METRICS

# Create METRICS namespace for preview
wrangler kv:namespace create METRICS --env preview
```

Save the namespace IDs from the output (e.g., `2f0a1234abcd5678...`).

### 1.4 Create Queues

```bash
# Create action queue for production
wrangler queue create adaptive-actions

# Create preview queue
wrangler queue create adaptive-actions-preview
```

## Step 2: Configure GitHub Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Value | Source |
|-------------|-------|--------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Dashboard → Workers → Overview |
| `CLOUDFLARE_API_TOKEN` | API token from Step 1.2 | Cloudflare Profile → API Tokens |
| `OPENHANDS_CLOUD_API_KEY` | API key from OpenHands Cloud | app.all-hands.dev → Settings → API Keys |

### Add GitHub Variables (optional but recommended)

| Variable Name | Value |
|--------------|-------|
| `CLOUDFLARE_PAGES_SUBDOMAIN` | Your workers.dev subdomain |

## Step 3: Update wrangler.toml

Edit `apps/backend/wrangler.toml` and replace placeholder IDs:

```toml
[[kv_namespaces]]
binding = "METRICS"
id = "YOUR_PROD_METRICS_NAMESPACE_ID"      # ← Replace with actual ID
preview_id = "YOUR_PREVIEW_METRICS_NAMESPACE_ID"  # ← Replace with actual ID
```

For production route:
```toml
[env.production]
workers_dev = false
routes = [
  { pattern = "alpha.atomeam.workers.dev/*", zone_name = "atomeam.workers.dev" }
]
```

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

- [ ] Cloudflare resources created (KV, queues)
- [ ] GitHub secrets configured
- [ ] wrangler.toml updated with real IDs
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