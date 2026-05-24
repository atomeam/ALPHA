# Tasks Hub Contract

D1-backed task management API for "The Place" inside Cloudflare `aether-bridge`.

## Canonical Enums

| Enum | Values |
|------|--------|
| `lane` | `Human`, `Council` |
| `status` | `Not started`, `In progress`, `Done` |
| `priority` | `P0`, `P1`, `P2`, `P3` |

## Validation Rules

- `title`: required, non-empty string
- `lane`: required, must be one of `Human`, `Council`
- `status`: optional on create (defaults to `Not started`), must be valid enum on update
- `priority`: required on create, must be valid enum
- `dueDate`: optional ISO8601 string or null
- `tags`: optional string array
- `blockedBy`: optional UUID or null
- `blocking`: optional integer (0 or 1)

## Query Rules by View

| View | SQL Filter |
|------|------------|
| `now` | `status != 'Done' AND priority IN ('P0', 'P1')` ORDER BY priority, NULLS LAST due_date, updated_at DESC |
| `human` | `lane = 'Human' AND status != 'Done'` ORDER BY updated_at DESC |
| `ai` | `lane = 'Council' AND status != 'Done'` ORDER BY updated_at DESC |
| `blocked` | `blocked_by IS NOT NULL AND EXISTS (SELECT 1 FROM tasks WHERE id = blocked_by AND status != 'Done')` ORDER BY updated_at DESC |
| `done` | `status = 'Done'` ORDER BY updated_at DESC |

## JSON Schemas

### GET /tasks?view={view}

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
      "blocking": 0,
      "blockedBy": "uuid|null",
      "tags": [],
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

### POST /tasks

**Request:**
```json
{
  "title": "string (required)",
  "lane": "Human|Council (required)",
  "priority": "P0|P1|P2|P3 (required)",
  "dueDate": "ISO8601 (optional)",
  "tags": ["string"] (optional),
  "blockedBy": "uuid (optional)",
  "blocking": 0 (optional)
}
```

**Response:** Same structure as GET `/tasks` with single-item array.

### PATCH /tasks/:id

**Request:**
```json
{
  "title": "string (optional)",
  "lane": "Human|Council (optional)",
  "status": "Not started|In progress|Done (optional)",
  "priority": "P0|P1|P2|P3 (optional)",
  "dueDate": "ISO8601 (optional)",
  "tags": ["string"] (optional)",
  "blockedBy": "uuid (optional)",
  "blocking": 0 (optional)"
}
```

**Response:** Same structure as GET `/tasks` with single-item array.

### POST /tasks/:id/done

Shorthand to set `status = "Done"`. Response same as PATCH.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_DENIED` | 401 | Missing or invalid Authorization header |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `NOT_FOUND` | 404 | Task not found |
| `INTERNAL` | 500 | Server error |

## Audit Events

Every write operation (POST/PATCH) writes to `audit_events`:

```sql
INSERT INTO audit_events (id, correlation_id, action, entity_type, entity_id, payload, created_at)
```

- `action`: `CREATE`, `UPDATE`, `COMPLETE`
- `payload`: JSON of changed fields

## Non-Negotiables

- [x] D1 table `tasks` created via migration
- [x] API endpoints work behind `BRIDGE_API_TOKEN`
- [x] Views: Now / Human / AI / Blocked / Done
- [x] No secrets in logs
- [x] Additive-only bindings (don't touch existing DB/STATE/etc.)
- [x] CorrelationId on every response
- [x] Audit_events row for every write