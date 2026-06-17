# ALPHA Bridge

`atomeam/atomarcade-bridge` is connected through ALPHA's provider registry and backend readiness endpoints. The upstream PowerShell runtime is not copied or executed here yet because it contains local worker loops; migrate it behind `packages/permissions` before enabling command execution.

## Tasks Hub

D1-backed task management API for tracking work across Human and AI lanes.

### Setup

1. Create D1 database (if not already provisioned):
```bash
cd apps/bridge
npx wrangler d1 create aether-bridge-db
```

2. Update `wrangler.toml` with the actual database ID from step 1 (or from Cloudflare dashboard)

3. Apply migration via CI deploy (canonical path):
```bash
# CI will automatically apply migrations on deploy
# Manual local testing only:
npx wrangler d1 migrations apply aether-bridge-db --local
```

### API Reference

**Base URL:** `/tasks`

**Authentication:** All endpoints require `Authorization: Bearer <BRIDGE_API_TOKEN>`

#### Views

| View | Description |
|------|-------------|
| `now` | Status != Done AND priority IN (P0, P1), sorted P0→P1, due_date, updated_at |
| `human` | Lane = "Human" AND status != Done |
| `ai` | Lane = "Council" AND status != Done |
| `blocked` | blocked_by IS NOT NULL AND referenced task not Done |
| `done` | Status = "Done" |

#### Enums

- **lane:** `Human` | `Council`
- **status:** `Not started` | `In progress` | `Done`
- **priority:** `P0` | `P1` | `P2` | `P3`

#### Endpoints

**GET /tasks?view={view}**
```json
{
  "correlationId": "uuid",
  "tasks": [
    {
      "id": "uuid",
      "title": "string",
      "lane": "Human|Council",
      "status": "Not started|In progress|Done",
      "priority": "P0|P1|P2|P3",
      "dueDate": "ISO8601|null",
      "blocking": 0|1,
      "blockedBy": "uuid|null",
      "tags": ["string"],
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

**POST /tasks** (returns same structure as GET)
```json
{
  "correlationId": "uuid",
  "tasks": [{ /* single task object */ }]
}
```

**PATCH /tasks/:id** (returns same structure)
```json
{
  "correlationId": "uuid",
  "tasks": [{ /* updated task object */ }]
}
```

**POST /tasks/:id/done** (returns same structure)

#### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_DENIED` | Missing or invalid Authorization header |
| `VALIDATION_ERROR` | Invalid input data |
| `NOT_FOUND` | Task not found |
| `INTERNAL` | Server error |

### Development

```bash
# Install dependencies
pnpm install

# Run locally
pnpm dev

# Run tests
pnpm test

# Deploy
pnpm deploy
```

### Security

- No secrets in logs (auth headers are filtered)
- Every write operation writes an `audit_events` row
- CorrelationId on every response for tracing
