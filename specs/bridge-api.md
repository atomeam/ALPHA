# Bridge API Spec v0.1

**Worker:** aether-bridge (alpha-orchestrator)
**Date:** 2026-05-24
**Status:** Draft

## Overview

The Bridge API provides HTTP endpoints for ALPHA's self-improvement loop: health, state management, metrics ingestion/refresh, Slack notifications, GitHub issue creation, and proposal submission.

---

## Endpoints

### GET /health

Health check with binding verification.

**Request:** `GET /health`

**Response:**

```json
{
  "status": "ok|degraded|error",
  "worker": "aether-bridge",
  "version": "0.1",
  "started_at": "2026-05-24T12:00:00Z",
  "bindings": {
    "bridge_db": "present|absent",
    "metrics_kv": "present|absent",
    "actions_queue": "present|absent"
  },
  "errors": []
}
```

**Status Codes:**

- `200` — All bindings operational
- `200` — Degraded (some bindings missing)
- `500` — Critical error

---

### POST /state

Write state to KV storage.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `Content-Type: application/json`
- `X-Correlation-ID: <uuid>` (recommended)

**Request:**

```json
{
  "key": "neighborhood:aether-001",
  "value": { ... },
  "ttl_seconds": 86400
}
```

**Response:**

```json
{
  "key": "neighborhood:aether-001",
  "stored_at": "2026-05-24T12:00:00Z",
  "correlation_id": "..."
}
```

**Status Codes:**

- `201` — Created
- `202` — Accepted (async write)
- `400` — Validation error
- `401` — AUTH_DENIED
- `500` — INTERNAL

---

### GET /state/:key

Read state from KV storage.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `X-Correlation-ID: <uuid>` (recommended)

**Request:** `GET /state/neighborhood:aether-001`

**Response:**

```json
{
  "key": "neighborhood:aether-001",
  "value": { ... },
  "version": 1,
  "stored_at": "2026-05-24T12:00:00Z"
}
```

**Status Codes:**

- `200` — OK
- `404` — Key not found
- `401` — AUTH_DENIED
- `500` — INTERNAL

---

### POST /metrics/ingest

Ingest metrics snapshot from external source.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `Content-Type: application/json`
- `X-Correlation-ID: <uuid>` (required)

**Request:**

```json
{
  "metrics": [
    {
      "metric": "routing.success_rate",
      "value": 0.95,
      "timestamp": "2026-05-24T12:00:00Z",
      "tags": { "service": "api-gateway" }
    }
  ],
  "source": "external-monitor",
  "ttl_seconds": 3600
}
```

**Response:**

```json
{
  "accepted": 5,
  "rejected": 0,
  "correlation_id": "...",
  "stored_at": "2026-05-24T12:00:00Z"
}
```

**Status Codes:**

- `202` — Accepted
- `400` — VALIDATION_ERROR
- `401` — AUTH_DENIED
- `429` — RATE_LIMITED
- `500` — INTERNAL

---

### GET /metrics/refresh

Force refresh of cached metrics from Amplitude.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `X-Correlation-ID: <uuid>` (recommended)

**Request:** `GET /metrics/refresh`

**Query Params:**

- `force=true` (optional, bypass cache)

**Response:**

```json
{
  "refreshed": true,
  "metrics_count": 42,
  "sources": ["amplitude", "kv"],
  "correlation_id": "..."
}
```

**Status Codes:**

- `200` — OK
- `401` — AUTH_DENIED
- `500` — UPSTREAM_TIMEOUT (Amplitude unreachable)
- `500` — INTERNAL

---

### POST /slack/notify

Send notification to Slack channel.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `Content-Type: application/json`
- `X-Correlation-ID: <uuid>` (required)

**Request:**

```json
{
  "channel": "#alpha-alerts",
  "message": "ALPHA proposal approved: {title}",
  "blocks": [ ... ],
  "severity": "info|warning|critical"
}
```

**Response:**

```json
{
  "sent": true,
  "ts": "1234567890.123456",
  "channel": "#alpha-alerts",
  "correlation_id": "..."
}
```

**Status Codes:**

- `200` — OK
- `400` — VALIDATION_ERROR (missing channel/message)
- `401` — AUTH_DENIED (missing SLACK_BOT_TOKEN)
- `500` — INTERNAL

---

### POST /github/issue

Create GitHub issue from ALPHA findings.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `Content-Type: application/json`
- `X-Correlation-ID: <uuid>` (required)

**Request:**

```json
{
  "repo": "atomeam/ALPHA",
  "title": "[ALPHA] Proposal: Fix routing latency",
  "body": "## Finding\n\nMetric: routing.latency_p99\nValue: 250ms (threshold: 100ms)\n\n## Proposal\n\n...",
  "labels": ["alpha", "proposal"],
  "assignees": []
}
```

**Response:**

```json
{
  "created": true,
  "issue_url": "https://github.com/atomeam/ALPHA/issues/123",
  "issue_number": 123,
  "correlation_id": "..."
}
```

**Status Codes:**

- `201` — Created
- `400` — VALIDATION_ERROR
- `401` — AUTH_DENIED (missing GITHUB_TOKEN)
- `404` — Repository not found
- `500` — INTERNAL

---

### POST /propose

Submit proposal for ALPHA processing.

**Headers:**

- `Authorization: Bearer <BRIDGE_API_TOKEN>` (required)
- `Content-Type: application/json`
- `X-Correlation-ID: <uuid>` (required)

**Request:**

```json
{
  "title": "Fix routing latency",
  "inputs_hash": "abc123",
  "change_summary": "Reduce latency by adjusting connection pool size",
  "files_or_pages_touched": ["config/routing.toml"],
  "expected_effect": {
    "metric": "routing.latency_p99",
    "direction": "decrease",
    "magnitude": 0.2,
    "tolerance": 0.05
  },
  "rollback_steps": ["revert config/routing.toml"],
  "risk_class": "medium",
  "classification": "config-change",
  "idempotent": true,
  "mode": "sync|async"
}
```

**Response (sync):**

```json
{
  "proposal_id": "P-abc123",
  "status": "approved|denied|halted",
  "curator_decision": {
    "code": "CUR_APPROVED",
    "message": "..."
  },
  "correlation_id": "..."
}
```

**Response (async):**

```json
{
  "proposal_id": "P-abc123",
  "status": "queued",
  "queue_id": "q-xyz789",
  "correlation_id": "..."
}
```

**Status Codes:**

- `200` — Sync complete
- `202` — Async queued
- `400` — VALIDATION_ERROR
- `401` — AUTH_DENIED
- `429` — RATE_LIMITED
- `500` — INTERNAL

---

## Error Codes

| Code               | HTTP Status | Description                  |
| ------------------ | ----------- | ---------------------------- |
| `AUTH_DENIED`      | 401         | Missing or invalid API token |
| `RATE_LIMITED`     | 429         | Too many requests            |
| `UPSTREAM_TIMEOUT` | 504         | External service timeout     |
| `VALIDATION_ERROR` | 400         | Invalid request payload      |
| `INTERNAL`         | 500         | Unexpected server error      |

---

## Correlation ID

Every request should include `X-Correlation-ID` header for tracing:

```
X-Correlation-ID: <uuid-v4>
```

The correlation ID is:

- Logged to audit_events table
- Returned in response headers
- Used for idempotency key derivation

---

## Audit Trail

All API calls are logged to `audit_events` table in BRIDGE_DB:

```sql
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
```
