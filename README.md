<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# HomeBase

Operator surface for **Alpha** — the self-improving loop:

    observe → evaluate → propose → validate → apply → reflect

Every step is wrapped by Curator default-deny. See [ALPHA.md](./ALPHA.md) for the contract and `src/alpha/` for the runtime.

View app in AI Studio: https://ai.studio/apps/b5aaaeef-c202-4714-bf1a-9659a0516786

## Run locally

Prereqs: Node.js 22+.

```
npm install
cp .env.example .env.local      # then set GEMINI_API_KEY in .env.local
npm run server:dev              # terminal 1 — Express on :8080
npm run dev                     # terminal 2 — Vite client on :3000
```

The Vite dev server proxies `/api/*` to `http://localhost:8080`, so the client never sees `GEMINI_API_KEY`.

## Endpoints

- `GET  /api/health` — service status, version, git sha, building info, bridge + Gemini config flags.
- `POST /api/prompt/:name` — dispatches an Alpha prompt to Gemini server-side. Names: `observer`, `evaluator`, `proposer`, `curator`, `applier`, `reflector`, `repeatCheck`, `councilSecondOpinion`. Body: `{ "input": "…" }`.

## Tests

```
npm test           # one-shot
npm run test:watch # watch mode
```

Covers all Curator denial codes and all 9 Applier hardening rules.

## Bridge Health Monitoring

HomeBase polls the AtomArcade Bridge every 15 seconds to check:

- **env** — required environment variables loaded
- **notion** — Notion API connectivity (`/users/me`)
- **ollama** — local Ollama runtime (`/api/tags`)
- **gemini** — Gemini API key valid (if configured)

### Health Telemetry

The `/api/bridge/health` endpoint returns:

```json
{
  "ok": true,
  "checks": { "env": { "ok": true, ... }, ... },
  "telemetry": {
    "historyLength": 5,
    "isFlapping": false,
    "firstFailureTime": null,
    "lastSuccessTime": "2026-05-18T12:00:00Z"
  }
}
```

- `isFlapping`: true if 3+ failures in last 10 checks.
- `firstFailureTime`: timestamp of first consecutive failure.

### Alert Banner

A red alert banner appears when:
- Overall status flips from `ok: true` to `ok: false`
- Flapping is detected (3+ failures in 10 checks)

### History Persistence

Health snapshots are stored in-memory (ring buffer of 50) and optionally persisted to JSONL:

```bash
HOMEBASE_HEALTH_HISTORY_PATH=C:\AtomArcade\health-history.jsonl
```

## Incident Logging (Optional)

When bridge health fails, HomeBase can write incidents to Notion.

### Requirements

1. Enable the feature:
```bash
NOTION_INCIDENT_LOG_ENABLED=true
```

2. Configure Notion:
```bash
NOTION_API_KEY=secret_...
ATOMARCADE_NOTION_LOG_DB_ID=your-log-db-id
```

### How It Works

- Triggers on: `ok` flips true→false, OR flapping starts (false→true)
- Rate limited: 1 incident per unique failure signature per 30 minutes
- No secrets written: API keys never appear in Notion

### Notion Schema

If using the Logs DB, ensure it has these properties:
- **Kind**: Select (e.g., "Incident", "Log")
- **Timestamp**: Title or Rich Text
- **Status**: Select (e.g., "Open", "Resolved")
- **Detail**: Rich Text
- **Source**: Rich Text (e.g., "HomeBase Telemetry")

### Automated Resolution

When the system recovers (health transitions from `ok: false` → `ok: true`), the most recent incident is automatically resolved:

1. System detects: `ok` flips false → true
2. Looks up open incident by signature (same failed checks)
3. Updates Status: "Open" → "Resolved"
4. Appends: `Resolved at <timestamp>` to Detail
5. Clears tracking so next failure creates a fresh incident

This ensures you never have stale "Open" incidents after temporary blips.
