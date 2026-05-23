# Alpha — First Improvement Target

> **Status**: Draft for first supervised cycle
> **Created**: 2026-05-23
> **Priority**: HIGH — Current error rate is unsustainable

## Current State (Baseline)

| Metric | Value | Target | Gap |
|--------|-------|--------|-----|
| Total requests | 117 | — | — |
| Errors | 109 | — | — |
| Success rate | ~6.8% | >95% | -88% |
| Error budget remaining | CRITICAL | >20% | Exceeded |

**Assessment**: System is in degraded state. The first improvement cycle must address the root cause of the 109 errors.

## Root Cause Hypothesis

Based on the 93% error rate, likely causes:

1. **Trust kernel blocking**: Missing grants for common subjects (frontend, integrations)
2. **Integration misconfiguration**: API keys not set, wrong endpoints
3. **Metrics pipeline broken**: /api/metrics not returning data correctly
4. **Queue consumer failing**: Messages not being processed

## First Cycle Tasks

### Task 1: Fix Trust Kernel (Critical)

The `checkTrust` function in `packages/permissions/src/index.ts` is default-deny. If subjects aren't in the registry, every request fails.

**Actions**:
1. Review `bootstrapGrantRegistry()` — ensure all expected subjects are registered
2. Check if `app:frontend` is missing from subjects list
3. Verify `integration:*` grants cover all providers (notion, slack, gemini, etc.)

**Expected impact**: 50-70% error reduction if grants are missing

### Task 2: Verify Metrics Endpoint

Current `/state` shows `metrics: {}` — no metrics being collected.

**Actions**:
1. Check if metrics are being reported to the Worker
2. Verify KV binding is working
3. Add test that calls `/metrics` POST with sample data

**Expected impact**: Metrics visible in `/state` response

### Task 3: Test Queue Processing

Action history is empty — queue consumer may not be processing messages.

**Actions**:
1. Send a test message to `adaptive-actions` queue
2. Verify `handleQueueBatch` is called
3. Check Cloudflare Queue dashboard for message backlog

**Expected impact**: Non-empty actionHistory in `/state`

## Success Criteria

After the first cycle, the following must be true:

| Criterion | Measurement |
|-----------|-------------|
| Error rate < 10% | 109 errors → < 12 errors |
| Success rate > 90% | /state shows 90%+ healthy |
| Metrics visible | `/state` shows non-empty `metrics` object |
| Action history populated | At least 1 action logged |

## Constraint Reminder

**Do NOT modify**:
- `packages/permissions/src/grant-types.ts` — Core grant models
- `apps/bridge/` — Requires manual review
- Auth/billing code

## If Error Rate Stays High

If errors persist after Task 1, investigate:
1. Cloudflare Worker logs (via Logpush → aether-logs)
2. Queue consumer errors in Cloudflare dashboard
3. KV write failures (METRICS binding)

## Post-First-Cycle

Once error rate is under control, next improvement targets:
- Latency: p95 < 200ms
- Trust kernel coverage: 100% of routes
- Integration success rates: > 95% per provider