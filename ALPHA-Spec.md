# ALPHA Specification

This document tracks the canonical specification for all ALPHA components.

## Tasks Hub

**Tasks Hub:** Implementation must strictly adhere to `specs/tasks-hub.contract.md`.

### Overview

D1-backed task management API for "The Place" inside Cloudflare `aether-bridge`.

### Contract Location

All Tasks Hub implementation details are defined in:
- `specs/tasks-hub.contract.md` — Full API schema, enums, validation rules, query rules, error codes

### Non-Negotiables

- D1 table `tasks` created via migration
- API endpoints work behind `BRIDGE_API_TOKEN`
- Views: Now / Human / AI / Blocked / Done
- No secrets in logs
- Additive-only bindings (don't touch existing DB/STATE/etc.)
- `X-Correlation-Id` header on every response
- `ok: true` on all success responses
- `correlationId` in body of every response
- Audit_events row for every write operation

## Other Components

[Additional component specifications will be added here as they are implemented.]