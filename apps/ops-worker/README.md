# ops-worker v0.1

Slack Events API → D1 audit_events → Notion task auto-close.

## Endpoints

| Endpoint | Method | Purpose |
|---------|--------|---------|
| `/ops/slack/events` | POST | Slack Events API receiver (challenge + event ingestion) |
| `/ops/run-close` | POST | Internal endpoint for run-close (testing) |
| `/health` | GET | Worker health check |

## Architecture

```
Slack (RESULT posted in #ops-runs)
    │
    ▼ POST /ops/slack/events
ops-worker
    │
    ├──► D1 BRIDGE_DB.audit_events (UPSERT)
    │
    └──► Notion API
            │
            ├── PATCH /v1/pages/<id> → Status: Done
            └── POST /v1/comments → Evidence comment
```

## Data Model

**audit_events table** (UPSERT by run_id):

```sql
CREATE TABLE audit_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL UNIQUE,
    task        TEXT,
    type        TEXT NOT NULL,
    env         TEXT NOT NULL,
    owner       TEXT NOT NULL,
    result      TEXT NOT NULL DEFAULT 'unknown',
    started_at  TEXT,
    ended_at    TEXT,
    duration    TEXT,
    commit_pr   TEXT,
    artifacts   TEXT,
    logs        TEXT,
    notes       TEXT,
    slack_ts    TEXT,
    slack_channel TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_audit_events_run_id ON audit_events(run_id);
```

## Canonical Behavior

| Decision | Value |
|----------|-------|
| Notion write | Status → Done (best-effort) + evidence as page comment |
| D1 model | UPSERT single row per run_id (not append-only) |
| Idempotency | Slack event_id stored in processed_slack_events (24h TTL) |
| Correlation key | TASK: field with Notion URL — required, `TASK: none` if no task |
| Auth | Bot token (SLACK_BOT_TOKEN) — not webhook |

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `SLACK_BOT_TOKEN` | secret | Slack bot token |
| `SLACK_SIGNING_SECRET` | secret | Slack Events API signing secret |
| `SLACK_OPS_RUNS_CHANNEL_ID` | var | ops-runs channel ID (C...) |
| `NOTION_TOKEN` | secret | Notion integration token |
| `BRIDGE_DB` | binding | D1 database |

## Evidence Comment Format

```
🏁 RUN Completed — Evidence

Run ID: gha:1234567890
Result: success
Duration: 15m
Commit/PR: https://github.com/...
Artifacts: https://github.com/...
Logs: —
Notes: Webhook path normalized

Slack: https://slack.com/archives/C.../p...
Thread: 1234567890.123456 | Event ID: Ev...

Posted by: OpenHands (ALPHA Council)
Timestamp: 2026-05-27T22:15:00Z
```

## Deployment

```bash
# Set secrets
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put NOTION_TOKEN

# Deploy
cd apps/ops-worker
npx wrangler deploy

# Verify
curl https://ops-worker.<subdomain>.workers.dev/health
```

## Testing

```bash
# Manual run-close
curl -X POST https://ops-worker.<subdomain>.workers.dev/ops/run-close \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "gha:1234567890",
    "task": "https://www.notion.so/...",
    "type": "build",
    "env": "staging",
    "owner": "OpenHands",
    "result": "success",
    "startedAt": "2026-05-27T22:00:00Z",
    "endedAt": "2026-05-27T22:15:00Z",
    "duration": "15m",
    "artifacts": "https://github.com/..."
  }'
```

## Guardrails

1. **Signature verification** — Reject non-Slack requests
2. **Channel filter** — Only process events in SLACK_OPS_RUNS_CHANNEL_ID
3. **RESULT required** — Only process messages containing `RESULT:`
4. **Dedupe** — Store event_id to prevent duplicate processing
5. **TASK validation** — Only process if TASK is Notion URL or `none`