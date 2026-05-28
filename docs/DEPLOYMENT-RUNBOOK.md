# Deployment Runbook v0.1

> **Status:** Ready for deployment  
> **Last updated:** 2026-05-27

---

## Pre-Requisites Checklist

Before running any step below, confirm:

- [ ] Cloudflare account with D1 access
- [ ] Slack workspace with admin access to create apps
- [ ] Notion integration token with access to 🎭 Todo List
- [ ] GitHub repo access for secrets configuration

---

## Step 1: Apply D1 Migrations

**Target:** Staging D1 database (`aether-bridge-db` or as configured)

### Migration Order

1. `d1/migrations/0002_events_council_logs.sql` — audit_events table
2. `d1/migrations/0003_processed_slack_events.sql` — processed_slack_events dedupe

### Apply via Wrangler

```bash
# Login to Cloudflare
npx wrangler login

# Apply migration to staging D1
cd /workspace/project/ALPHA
npx wrangler d1 migrations apply aether-bridge-db --local=False

# Or for specific migration
npx wrangler d1 execute aether-bridge-db --command="$(cat d1/migrations/0002_events_council_logs.sql)" --local=False
```

### Verify Migration

```sql
-- Check audit_events table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='audit_events';

-- Check processed_slack_events exists
SELECT name FROM sqlite_master WHERE type='table' AND name='processed_slack_events';

-- Verify schema
PRAGMA table_info(audit_events);
PRAGMA table_info(processed_slack_events);
```

---

## Step 2: Configure Worker Secrets

**Worker:** `apps/ops-worker/`

### Required Secrets

| Secret | How to Set |
|--------|------------|
| `SLACK_BOT_TOKEN` | `npx wrangler secret put SLACK_BOT_TOKEN` |
| `SLACK_SIGNING_SECRET` | `npx wrangler secret put SLACK_SIGNING_SECRET` |
| `NOTION_TOKEN` | `npx wrangler secret put NOTION_TOKEN` |

### Required Variables (in wrangler.toml)

| Variable | Value |
|----------|-------|
| `SLACK_OPS_RUNS_CHANNEL_ID` | Channel ID (C...) from Slack |

### Setup Commands

```bash
cd /workspace/project/ALPHA/apps/ops-worker

# Set each secret (will prompt for value)
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put NOTION_TOKEN

# Update channel ID in wrangler.toml
# Edit: SLACK_OPS_RUNS_CHANNEL_ID = "C..."
```

---

## Step 3: Deploy ops-worker

### Deploy Commands

```bash
cd /workspace/project/ALPHA/apps/ops-worker

# Deploy to Cloudflare Workers
npx wrangler deploy

# Verify deployment
curl https://ops-worker.<your-subdomain>.workers.dev/health
```

### Expected Response

```json
{
  "service": "ops-worker",
  "status": "operational",
  "endpoints": ["/ops/slack/events", "/ops/run-close", "/health"]
}
```

---

## Step 4: Configure Slack App

### Create Slack App (if not exists)

1. Go to https://api.slack.com/apps
2. Create new App → "From scratch"
3. Name: `ops-worker` or similar
4. Select workspace

### Enable Permissions

**OAuth & Permissions → Bot Token Scopes:**
- `chat:write`
- `channels:read`
- `channels:history`

### Subscribe to Events

**Event Subscriptions:**
- Enable Events: `Yes`
- Request URL: `https://ops-worker.<your-subdomain>.workers.dev/ops/slack/events`
- Subscribe to events: `message.channels`

### Install App to Workspace

**Install App → Install to Workspace**

Copy `Bot User OAuth Token` (starts with `xoxb-`) → set as `SLACK_BOT_TOKEN`

### Get Channel IDs

```bash
# Via Slack API
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  https://slack.com/api/conversations.list \
  | jq '.channels[] | {name, id}'
```

Find `#ops-runs` channel ID (starts with `C`)

---

## Step 5: Acceptance Test

### Test Sequence

**1. Post to #ops-runs thread with valid TASK:**
```
RUN: gha:test123
TASK: https://www.notion.so/...
TYPE: build
ENV: staging
OWNER: OpenHands
RESULT: unknown
START: 2026-05-27T22:00:00Z
```

**2. Reply in thread with RESULT:**
```
RUN: gha:test123
RESULT: success
END: 2026-05-27T22:15:00Z
DURATION: 15m
ARTIFACTS: https://github.com/atomeam/ALPHA/pull/24
NOTES: Test run
```

**3. Verify D1 (via wrangler):**
```bash
npx wrangler d1 execute aether-bridge-db --command="
SELECT run_id, result, slack_ts, task, type, started_at, ended_at
FROM audit_events WHERE run_id = 'gha:test123';
" --local=False

npx wrangler d1 execute aether-bridge-db --command="
SELECT * FROM processed_slack_events ORDER BY processed_at DESC LIMIT 5;
" --local=False
```

**Expected:**
- 1 row in audit_events (UPSERT verified)
- 1 row in processed_slack_events (dedupe verified)

**4. Verify Notion:**
- Task `Status` → `Done` (if property exists)
- Comment added with evidence (Slack permalink, thread_ts, event_id)

---

## Rollback Procedure

### Undo Migration

```bash
npx wrangler d1 execute aether-bridge-db --command="
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS processed_slack_events;
" --local=False
```

### Rollback Worker

```bash
cd /workspace/project/ALPHA/apps/ops-worker
npx wrangler deploy --message "revert"
```

---

## Monitoring

### Worker Logs

```bash
npx wrangler tail
```

### D1 Query for Recent Runs

```bash
npx wrangler d1 execute aether-bridge-db --command="
SELECT run_id, result, created_at FROM audit_events
ORDER BY created_at DESC LIMIT 10;
" --local=False
```