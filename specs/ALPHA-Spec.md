# ALPHA Self-Improvement Loop Spec v0.3 — 2026-05-24

**Owner:** atomeam  
**Status:** Living contract — update each pass  
**Source of truth:** This document (Notion-backed)

---

## What changed this pass

- CI deploy pipeline added (`.github/workflows/deploy.yml`)
- PowerShell deploy scripts created (`scripts/deploy-aether-bridge.ps1`, `scripts/smoke-test-aether-bridge.ps1`)
- Bridge renamed from `alpha-orchestrator` → `aether-bridge`
- D1 table renamed from `proposal_artifacts` → `artifacts`
- Secrets separated: `CLOUDFLARE_API_TOKEN` (deploy) vs `BRIDGE_API_TOKEN` (runtime)

---

## Changelog (latest first)

### v0.3 — 2026-05-24

- Added CI deploy workflow with staging/production environments
- Added PowerShell scripts for local and CI-based deploys
- Renamed worker to `aether-bridge`
- Fixed `--local` → `--remote` for D1 migrations
- Added `CLOUDFLARE_ACCOUNT_ID` to deploy job

### v0.2 — 2026-05-24

- Created PowerShell-native smoke test
- Renamed `proposal_artifacts` → `artifacts`
- Fixed deploy runbook for PowerShell (no bash snippets)

### v0.1 — 2026-05-24

- Initial spec creation
- Bridge API v0.1 endpoints defined
- Bindings map defined

---

## Current Decisions (locked)

| Decision                  | Value                                   | Rationale                                   |
| ------------------------- | --------------------------------------- | ------------------------------------------- |
| Worker name               | `aether-bridge`                         | Matches Cloudflare deployment target        |
| Deploy path               | `apps/alpha-orchestrator/`              | Single app directory                        |
| Canonical wrangler config | `apps/alpha-orchestrator/wrangler.toml` | Eliminates wrong-config failures            |
| Canonical workflow file   | `.github/workflows/deploy.yml`          | Eliminates wrong-folder failures            |
| CI is canonical           | Yes                                     | GitHub Actions workflow with approval gates |
| Local fallback            | PowerShell script                       | `scripts/deploy-aether-bridge.ps1`          |
| D1 table                  | `artifacts`                             | Standardized naming                         |
| Auth: deploy              | `CLOUDFLARE_API_TOKEN`                  | Wrangler authentication                     |
| Auth: runtime             | `BRIDGE_API_TOKEN`                      | Bridge API authentication                   |

---

## Next Pass Focus (max 3)

### 1. Notion lessons sink

**Done when:** A successful proposal writes a Lesson record to Notion (id + correlationId + decision + artifacts) asynchronously.

### 2. Slack lifecycle notifications

**Done when:** On proposal approved/applied/failed, post to a single channel/thread with correlationId + links.

### 3. Error tracking (Sentry)

**Done when:** Uncaught errors emit to Sentry with correlationId and environment tag; no secrets in payload.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ALPHA Self-Improvement Loop              │
├──────────────┬──────────────┬──────────────┬───────────────┤
│   Notion     │  AI Studio   │  OpenHands   │  Cloudflare   │
│  (Source)    │  (Planner)   │  (Executor)  │   (Runtime)   │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────┘
       │              │              │               │
       ▼              ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                        aether-bridge                         │
│  (OrchestrationBrain DO + Express bridge on port 8090)      │
├─────────────────────────────────────────────────────────────┤
│  Bindings: BRIDGE_DB (D1) | METRICS (KV) | ACTIONS (Queue)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Pipeline

### CI Flow (Canonical)

```
1. Human triggers via GitHub Actions UI
   ↓
2. validate job (lint, typecheck, wrangler.toml check)
   ↓
3. deploy job
   ├── authenticate (CLOUDFLARE_API_TOKEN)
   ├── apply D1 migrations (--remote)
   └── wrangler deploy --name aether-bridge
   ↓
4. smoke-test job (BRIDGE_API_TOKEN)
   ├── GET /health
   ├── POST /state (auth required)
   └── POST /propose?mode=async (auth required)
   ↓
5. notify job (always runs, reports status)
```

### Environments

| Environment  | Approval Required | Purpose            |
| ------------ | ----------------- | ------------------ |
| `staging`    | No                | Prove the pipeline |
| `production` | Yes (atomeam)     | Live deploy        |

### Secrets (per environment)

| Secret                  | Purpose                        |
| ----------------------- | ------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Wrangler deploy authentication |
| `CLOUDFLARE_ACCOUNT_ID` | Account-scoped operations      |
| `BRIDGE_API_TOKEN`      | Runtime auth for smoke tests   |
| `SLACK_BOT_TOKEN`       | Slack notifications (optional) |
| `GITHUB_TOKEN`          | GitHub integration (optional)  |
| `AMPLITUDE_API_KEY`     | Metrics backend (optional)     |

---

## Endpoints

### Health (no auth)

```
GET /health
Response: { "ok": true, "services": {...}, "version": "0.1.0" }
```

### State (auth required)

```
POST /state
Headers: Authorization: Bearer $TOKEN
Body: { "key": "...", "value": "...", "scope": "global", "ttl_seconds": 3600 }

GET /state/{key}?scope=global
```

### Propose (auth required)

```
POST /propose
Headers: Authorization: Bearer $TOKEN
Body: { "title": "...", "inputs_hash": "...", "mode": "async" }
```

---

## Open Questions (max 5)

1. ~~Worker name: alpha-orchestrator or aether-bridge?~~ → **Resolved: aether-bridge**
2. ~~Auth token separation~~ → **Resolved: CLOUDFLARE_API_TOKEN vs BRIDGE_API_TOKEN**
3. Should /health require auth in production? → **Deferred**
4. Should we add Sentry for error tracking? → **Deferred**
5. How to handle Notion sync failures? → **Deferred**

---

## Backlog (non-binding)

- [ ] Add Notion API integration for lessons sink
- [ ] Add Slack notifications for proposal lifecycle
- [ ] Add GitHub issue creation for blockers
- [ ] Add Amplitude for metrics aggregation
- [ ] Add Sentry for error tracking

---

## Local Deploy (fallback)

If CI is unavailable, use PowerShell:

```powershell
cd apps/alpha-orchestrator
pwsh ../scripts/deploy-aether-bridge.ps1
```

The script validates:

- Correct folder (`wrangler.toml` exists)
- Correct worker name (`name="aether-bridge"`)
- Applies D1 migrations
- Sets secrets (prompts for required + optional)
- Runs smoke test

---

## Smoke Test (post-deploy)

```powershell
pwsh ../scripts/smoke-test-aether-bridge.ps1 -BaseUrl "https://aether-bridge.atomicmoonbeam88.workers.dev" -Token "..."
```

Or curl:

```bash
# Health (no auth)
curl https://aether-bridge.atomicmoonbeam88.workers.dev/health

# State write (auth required)
curl -X POST https://aether-bridge.atomicmoonbeam88.workers.dev/state \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"test","value":"hello","scope":"global"}'
```
