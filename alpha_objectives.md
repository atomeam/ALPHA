# Alpha Self-Improvement Contract

This file defines Alpha's optimization targets and constraints for the OpenHands self-improvement loop.

## Objectives

| Objective | Target | Measurement |
|-----------|--------|-------------|
| Backend latency (p95) | < 200ms | `/api/health` response time |
| Trust kernel coverage | 100% | All `/api/*` routes go through `checkTrust` |
| Integration success rate | > 95% | Tracked per provider in metrics |
| Zero trust violations | 0 | No unlogged outbound calls |

## Constraints (Do Not Touch)

The following areas are locked from OpenHands modification without explicit operator approval:

- **`packages/permissions/src/grant-types.ts`** — Core grant models
- **`apps/bridge/`** — Bridge requires manual review before changes
- **Auth/billing code** — Any auth or payment logic

## Metrics Endpoint

OpenHands reads telemetry from:
```
GET /api/metrics
```

Returns:
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

## Improvement Cycle

1. **Trigger**: Manual dispatch or weekly cron
2. **Input**: `alpha_objectives.md` + `/api/metrics` output
3. **Output**: PR with description including:
   - What changed
   - Why it improves the objective
   - Rollback plan
   - Tested against existing test suite

## Guardrails

- PRs required — no direct commits to main
- Tests must pass before merge
- Smoke test against preview URL before production
- Auto-revert if error rate spikes post-deploy

## Status

Phase 0: Infrastructure scaffolded
Next: Wire OpenHands Cloud → GitHub repo