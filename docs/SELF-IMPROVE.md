# Alpha Self-Improving System

## Overview

Alpha uses a closed-loop self-improvement system that combines:

- **OpenHands Cloud** — The "developer/ops brain" that can plan work, edit code, run commands, and apply changes
- **GitHub Actions** — CI/CD pipeline for automated testing and deployment
- **Cloudflare Workers** — Alpha's runtime environment at the edge

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Telemetry & Goals                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐   │
│  │ /api/health  │  │ /api/metrics│  │ alpha_objectives.md  │   │
│  └─────────────┘  └─────────────┘  └──────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  OpenHands Improvement Cycle                                     │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 1. Read metrics + objectives                              │     │
│  │ 2. Identify improvement areas                             │     │
│  │ 3. Plan and implement changes                              │     │
│  │ 4. Run tests + smoke checks                               │     │
│  │ 5. Open PR with summary + rollback plan                   │     │
│  └─────────────────────────────────────────────────────────┘     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CI/CD Pipeline (GitHub Actions)                                │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Lint/Test│  │ Deploy Prev│  │ Smoke Test │  │ Auto-Merge │  │
│  └──────────┘  └────────────┘  └────────────┘  └───────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Workers (Runtime)                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │ Preview Workers │  │ Production Worker│  │ Workers AI   │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Alpha Objectives (`alpha_objectives.md`)

Defines what Alpha should optimize for:

- **Latency targets**: p95 < 200ms
- **Trust coverage**: 100% kernel coverage
- **Success rates**: Integration > 95%
- **Constraints**: Locked areas (auth, bridge, grant-types)

### 2. Metrics Endpoint (`/api/metrics`)

Alpha's telemetry surface for the improvement loop:

```json
{
  "latency_p95_ms": 150,
  "trust_check_rate": 100,
  "integration_success_rates": {
    "notion": 0.98,
    "slack": 0.95,
    "gemini": 1.0
  },
  "error_budget_remaining": "80%",
  "last_cycle_at": "2024-01-15T10:00:00Z"
}
```

### 3. OpenHands Client (`scripts/openhands_alpha.py`)

CLI tool to interact with OpenHands Cloud:

```bash
# Check account
python scripts/openhands_alpha.py whoami

# Search recent conversations
python scripts/openhands_alpha.py search --limit 10

# Start an improvement cycle
python scripts/openhands_alpha.py start --objective alpha_objectives.md

# Check conversation status
python scripts/openhands_alpha.py status <conversation_id>

# Dispatch an automation
python scripts/openhands_alpha.py dispatch <automation_id>
```

### 4. Self-Improvement Workflow (`.github/workflows/alpha-self-improve.yml`)

GitHub Actions workflow that:
- Runs weekly (Mondays 9 AM UTC) or on-demand
- Validates the objectives file
- Starts an OpenHands improvement cycle
- Monitors for PR creation
- Auto-merges if CI passes

### 5. Deploy Workflow (`.github/workflows/deploy.yml`)

Multi-phase deployment pipeline:

1. **Quality Gate**: Lint, typecheck, test, build
2. **Preview Deploy**: Smoke test against preview URL
3. **Production Deploy**: Full deploy with error monitoring
4. **Auto-Merge**: For self-improvement PRs that pass all checks

## Key Concepts

### OpenHands vs Cloudflare

| Component | Role |
|-----------|------|
| **OpenHands** | Developer/ops agent that edits code, tests, opens PRs |
| **Cloudflare** | Runtime environment where Alpha executes |

**OpenHands doesn't run Alpha in production** — it edits the code that Cloudflare runs.

### Autonomy Levels

| Phase | Description |
|-------|-------------|
| Phase 1 | OpenHands opens PRs only; humans review and merge |
| Phase 2 | Auto-merge when tests + smoke checks pass |
| Phase 3 | OpenHands adjusts improvement cadence (with guardrails) |

### Guardrails

The system enforces:

- **PR-only changes**: No direct commits to main
- **Test requirements**: All checks must pass before merge
- **Smoke tests**: Preview URL validation before production
- **Auto-revert**: Rollback if error rate spikes
- **Constraint zones**: Locked files (auth, billing, grant-types)

## Setup

### 1. Configure GitHub Secrets

Add these secrets to your repository:

| Secret | Description |
|--------|-------------|
| `OPENHANDS_API_KEY` | OpenHands Cloud API key |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers edit |

### 2. Configure GitHub Variables

Add these variables to your repository:

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_PAGES_SUBDOMAIN` | Your Cloudflare pages subdomain |

### 3. Connect Repository to OpenHands

1. Go to [app.all-hands.dev](https://app.all-hands.dev)
2. Navigate to Settings → Repositories
3. Add `atomeam/ALPHA`

### 4. Cloudflare Resources

See [docs/CLOUDFLARE_SETUP.md](docs/CLOUDFLARE_SETUP.md) for step-by-step setup:

1. Create KV namespace for metrics
2. Create queues for action processing
3. Configure wrangler.toml with real IDs
4. Set worker secrets via `wrangler secret put`

### 5. Enable the Workflow

The `alpha-self-improve.yml` workflow can be triggered:

- **Manually**: GitHub Actions → "Run workflow" button
- **Scheduled**: Automatically every Monday at 9 AM UTC
- **API**: `workflow_dispatch` event with custom objective file

## Usage

### Manual Improvement Cycle

```bash
# Trigger via GitHub CLI
gh workflow run alpha-self-improve.yml

# Or via the OpenHands client
OPENHANDS_CLOUD_API_KEY=your_key python scripts/openhands_alpha.py start
```

### Monitor Progress

```bash
# Check conversation status
OPENHANDS_CLOUD_API_KEY=your_key python scripts/openhands_alpha.py status <id>

# Search recent conversations
OPENHANDS_CLOUD_API_KEY=your_key python scripts/openhands_alpha.py search
```

### View in OpenHands Cloud

Visit [app.all-hands.dev](https://app.all-hands.dev) to:
- See active conversations
- View conversation history
- Monitor improvement cycles

## File Structure

```
ALPHA/
├── alpha_objectives.md          # Optimization targets and constraints
├── scripts/
│   └── openhands_alpha.py        # OpenHands Cloud CLI client
├── .github/
│   └── workflows/
│       ├── alpha-self-improve.yml  # Self-improvement cycle workflow
│       ├── deploy.yml              # Deployment pipeline
│       ├── lint.yml                # Lint + typecheck
│       └── test.yml                # Unit tests
└── apps/
    └── backend/
        └── src/
            └── server.ts         # Backend with /api/metrics endpoint
```

## Maintenance

### Updating Objectives

Edit `alpha_objectives.md` to change Alpha's optimization targets. Changes take effect on the next improvement cycle.

### Adding Constraints

Add file paths to the "Do Not Touch" section in `alpha_objectives.md`. OpenHands will skip these files.

### Adjusting Autonomy

Modify the `auto-merge-improve` job in `.github/workflows/deploy.yml` to change when auto-merge triggers.

## Troubleshooting

### OpenHands not creating PRs

1. Check `OPENHANDS_API_KEY` is valid
2. Verify repository is connected in OpenHands Cloud
3. Check conversation status with `scripts/openhands_alpha.py status <id>`

### Deployment failing

1. Verify Cloudflare credentials in GitHub secrets
2. Check Wrangler configuration in `wrangler.toml`
3. Run `wrangler whoami` locally to validate credentials

### Auto-merge not triggering

1. Ensure branch name contains `alpha-improve`
2. Check all CI checks have passed
3. Verify `alpha-improve` environment is configured in GitHub

## See Also

- [OpenHands Cloud Documentation](https://docs.openhands.dev/openhands/usage/cloud/openhands-cloud)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Alpha Trust Architecture](TRUST.md)
- [Integration Scopes](INTEGRATIONS.md)

---

## Security & Trust Boundary

### API Authentication

Write endpoints are protected by Bearer token authentication. Set the secret:

```bash
# Via wrangler:
wrangler secret put ASSESSMENT_API_KEY

# Or in Cloudflare dashboard:
# Workers → self-adaptive-app → Settings → Variables → Secret text
```

Protected endpoints:
- `POST /api/trust/check` — Trust kernel decisions
- `POST /metrics` — Metrics ingestion
- `POST /thresholds` — Threshold updates
- `POST /ingest` — Action ingestion

### Trust Kernel Guardrails

The `packages/permissions/src/index.ts` file contains `bootstrapGrantRegistry()` — the trust kernel. **This file is blocked from automatic modification by the self-improvement pipeline.**

| File | Auto-modify Allowed |
|------|---------------------|
| `packages/permissions/src/index.ts` | ❌ Blocked — requires human review |
| `packages/permissions/src/grant-types.ts` | ❌ Blocked — core grant models |
| `apps/bridge/**` | ❌ Blocked — requires manual review |
| `**/auth/**` | ❌ Blocked — security-sensitive |
| `**/billing/**` | ❌ Blocked — financial data |
| `wrangler.toml` | ❌ Blocked — infrastructure config |

### Auto-Merge Controls

Auto-merge is **disabled by default**. To enable after reviewing 2-3 cycles:

1. Set repo variable `ALLOW_AUTO_MERGE=true` in GitHub repo settings
2. Or run workflow with auto-merge enabled

Before enabling auto-merge:
- Review that OpenHands made reasonable changes
- CI passed all checks
- Metrics improved or stayed stable