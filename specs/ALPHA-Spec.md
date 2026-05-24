# ALPHA Self-Improvement Loop Spec v0.4 — 2026-05-24

**Owner:** atomeam  
**Status:** Living contract — update each pass  
**Source of truth:** Notion (backend for specs + Council Todo tasks)

---

## What changed this pass

- **CI is Canonical:** Locked GitHub Actions (`deploy.yml`) as sole authorized deployment mechanism for Cloudflare workers; local terminal deploys are strictly deprecated.
- **Environment Gating:** Default-deny deployment posture; `production` requires explicit manual human approval in GitHub UI.
- **Governance Rule:** "No deploy guidance outside CI runbook" is now an active constraint for all AI agents.
- **Workspace Rebranding:** Enforced global terminology shift from "Atomind" to "Loxa" and "Aether" across all specs and agent contexts.
- **Notion as Source of Truth:** Notion serves as definitive backend for system specs and Council Todo task list.

---

## Changelog (latest first)

### v0.4 — 2026-05-24

- CI is canonical (GitHub Actions as sole authorized deploy mechanism)
- Environment gating with default-deny posture (production requires approval)
- Governance rule: no deploy guidance outside CI runbook
- Workspace rebranding: Atomind → Loxa/Aether
- Notion as source of truth for specs and Council Todo

### v0.3 — 2026-05-24

- Added CI deploy workflow with staging/production environments
- Added PowerShell scripts for local and CI-based deploys
- Renamed worker to `aether-bridge`
- Fixed `--local` → `--remote` for D1 migrations
- Added `CLOUDFLARE_ACCOUNT_ID` to deploy job
- Added canonical file paths to decisions table
- Added Next Pass Focus with DoD definitions

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

| Decision                      | Value                                              | Rationale                                 |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------- |
| **Workspace**                 | Loxa / Aether                                      | Rebranding from Atomind                   |
| **Source of Truth**           | Notion                                             | Backend for specs + Council Todo          |
| **CI is Canonical**           | Yes (GitHub Actions)                               | Sole authorized deploy mechanism          |
| **Deploy Pipeline**           | GitHub Actions → wrangler → Manual Production Gate | Default-deny posture                      |
| **Worker name**               | `aether-bridge`                                    | Cloudflare deployment target              |
| **Deploy path**               | `apps/alpha-orchestrator/`                         | Single app directory                      |
| **Canonical wrangler config** | `apps/alpha-orchestrator/wrangler.toml`            | Eliminates wrong-config failures          |
| **Canonical workflow file**   | `.github/workflows/deploy.yml`                     | Eliminates wrong-folder failures          |
| **Local deploy**              | **DEPRECATED**                                     | Use CI only                               |
| **Local fallback**            | PowerShell script (emergency only)                 | `scripts/deploy-aether-bridge.ps1`        |
| **D1 table**                  | `artifacts`                                        | Standardized naming                       |
| **Auth: deploy**              | `CLOUDFLARE_API_TOKEN`                             | Wrangler authentication                   |
| **Auth: runtime**             | `BRIDGE_API_TOKEN`                                 | Bridge API authentication                 |
| **Infrastructure model**      | Additive bindings only                             | No mutating existing `council-routing-db` |

---

## Next Pass Focus (max 3)

### 1. Execute and validate staging CI run

**Done when:** First manual `staging` CI run completes in GitHub UI with all jobs passing (validate → deploy → smoke-test → notify).

### 2. Cloudflare node verify API bindings post-deployment

**Done when:** Cloudflare node confirms API bindings (`BRIDGE_DB`, `METRICS`, `ACTIONS`) are correctly attached to `aether-bridge` worker.

### 3. Hook up Notion backend via API secrets

**Done when:** Council Todo app (generated in AI Studio) connects to Notion API using stored secrets; task list syncs bidirectionally.

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
