# Bindings Map v0.1

**Worker:** aether-bridge (alpha-orchestrator)
**Date:** 2026-05-24
**Status:** Draft

## Current Bindings

### Durable Objects

| Binding               | Class              | Purpose                             | Migration    |
| --------------------- | ------------------ | ----------------------------------- | ------------ |
| `ORCHESTRATION_BRAIN` | OrchestrationBrain | State machine + proposal processing | v1 (initial) |

### KV Namespaces

| Binding       | ID             | Purpose                        | TTL      |
| ------------- | -------------- | ------------------------------ | -------- |
| `STATE`       | (existing)     | Neighborhood state persistence | 30 days  |
| `STATE_CACHE` | (existing)     | Short-term state cache         | 1 hour   |
| `METRICS`     | bridge-metrics | Metrics snapshot storage       | 24 hours |

### Queues

| Binding   | Purpose        | Consumer                       |
| --------- | -------------- | ------------------------------ |
| `LOGS`    | (existing)     | Log aggregation                |
| `ACTIONS` | bridge-actions | Async proposal execution queue |

### D1 Databases

| Binding     | Database           | Purpose              | Schema           |
| ----------- | ------------------ | -------------------- | ---------------- |
| `DB`        | council-routing-db | (legacy)             | -                |
| `BRIDGE_DB` | aether-bridge-db   | Bridge-specific data | See schema below |

### Services

| Binding   | Service    | Purpose               |
| --------- | ---------- | --------------------- |
| `service` | (existing) | Internal service mesh |

---

## New Bindings Required

### BRIDGE_DB

```toml
[[d1_databases]]
binding = "BRIDGE_DB"
database_name = "aether-bridge-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Schema:**

```sql
-- Audit trail for all API calls
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_body TEXT,
  response_status INTEGER,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Idempotency keys for side-effect endpoints
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  response_body TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Proposal artifacts
CREATE TABLE IF NOT EXISTS proposal_artifacts (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content TEXT,
  correlation_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### METRICS (KV)

```toml
[[kv_namespaces]]
binding = "METRICS"
id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Key Patterns:**

- `metrics:snapshot:{neighborhood_id}` — Latest metrics snapshot
- `metrics:history:{neighborhood_id}:{timestamp}` — Historical snapshots
- `metrics:refresh:lock` — Refresh lock (prevents concurrent refresh)

### ACTIONS (Queue)

```toml
[[queues]]
binding = "ACTIONS"
consumer_queue = "bridge-actions"
```

**Message Format:**

```json
{
  "proposal_id": "P-xxx",
  "action": "apply|revert|notify",
  "payload": { ... },
  "correlation_id": "...",
  "retry_count": 0
}
```

---

## Cron Schedules

### Metrics Refresh

```toml
[triggers]
crons = ["*/15 * * * *"]  # Every 15 minutes
```

**Handler:** Refresh cached metrics from Amplitude
**Timeout:** 30 seconds
**Error:** Log + alert if 3 consecutive failures

### Proposal Runner

```toml
[triggers]
crons = ["0 * * * *"]  # Every hour
```

**Handler:** Process queued proposals from ACTIONS queue
**Timeout:** 5 minutes
**Error:** Re-queue with exponential backoff

---

## Environment Variables (Secrets)

| Secret                 | Required | Description               |
| ---------------------- | -------- | ------------------------- |
| `BRIDGE_API_TOKEN`     | Yes      | Bearer token for API auth |
| `SLACK_BOT_TOKEN`      | No       | For /slack/notify         |
| `GITHUB_TOKEN`         | No       | For /github/issue         |
| `AMPLITUDE_API_KEY`    | No       | For metrics refresh       |
| `AMPLITUDE_SECRET_KEY` | No       | For metrics refresh       |
| `SENTRY_DSN`           | No       | Error tracking            |

---

## Binding Health Check

Each binding should report status in `/health`:

```json
{
  "bindings": {
    "bridge_db": "present|absent",
    "metrics_kv": "present|absent",
    "actions_queue": "present|absent"
  }
}
```

- `present` — Binding exists and is accessible
- `absent` — Binding not configured or inaccessible
