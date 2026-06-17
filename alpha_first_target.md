# Alpha — First Improvement Target

> **Status**: Verified — queue consumer working, ready for first cycle
> **Created**: 2026-05-23
> **Priority**: HIGH — Current error rate is unsustainable

## Current State (Baseline - Verified via Worker)

```json
{
  "id": "global",
  "metrics": {
    "error_rate": 0.85,
    "latency_p99": 2500,
    "total_requests": 42,
    "total_errors": 36
  },
  "assessment": "critical",
  "thresholds": {
    "error_rate": 0.05,
    "latency_p99": 2000
  },
  "actionHistory": 3
}
```

| Metric | Value | Target | Gap |
|--------|-------|--------|-----|
| Total requests | 42 | — | — |
| Errors | 36 | — | — |
| Success rate | ~15% | >95% | -80% |
| Error rate | 85% | <5% | +80% |
| Assessment | **critical** | healthy | — |

**Queue consumer**: ✅ Working (3 assessments recorded in actionHistory)
**Metrics POST**: ✅ Working (metrics accepted and stored)

---

## Root Cause

The error rate is high because the trust kernel in `packages/permissions/src/index.ts` is default-deny. The `bootstrapGrantRegistry()` function only has a few subjects registered:

```typescript
subjects: ['app:backend', 'integration:gemini', 'integration:ollama', 'integration:retroarch']
```

Missing subjects that need to be added:
- `app:frontend` - frontend app making requests
- `integration:notion` - Notion integration
- `integration:slack` - Slack integration
- `integration:sentry` - Sentry integration
- Any other integrations being called

## Root Cause Verified

**Primary cause**: Trust kernel is default-deny. `bootstrapGrantRegistry()` in `packages/permissions/src/index.ts` only has 4 subjects:

```typescript
subjects: ['app:backend', 'integration:gemini', 'integration:ollama', 'integration:retroarch']
```

**Missing subjects** (causing 85% error rate):
- `app:frontend`
- `integration:notion`
- `integration:slack`
- `integration:sentry`
- etc.

## First Cycle Tasks

### Task 1: Fix Trust Kernel (Critical - Fix this first)

The `checkTrust` function in `packages/permissions/src/index.ts` is default-deny. If subjects aren't in the registry, every request fails.

**Actions**:
1. Review `bootstrapGrantRegistry()` — add missing subjects:
   - `app:frontend`
   - `integration:notion`
   - `integration:slack`
   - `integration:sentry`
   - `integration:hubspot`
   - `integration:amplitude`
   - `integration:linear`
   - `integration:stripe`
2. Verify `integration:*` grants cover all providers

**Expected impact**: Error rate 85% → < 10%

### Task 2: Verify Metrics Endpoint (Completed ✅)

- Metrics POST endpoint working
- Queue consumer processing messages
- Action history populated (3 assessments)

### Task 3: Test Queue Processing (Completed ✅)

- Queue consumer registered and working
- Messages processed successfully
- KV writes confirmed

## Success Criteria

After the first cycle, the following must be true:

| Criterion | Measurement |
|-----------|-------------|
| Error rate < 10% | 85% -> < 10% |
| Success rate > 90% | /state shows assessment: healthy |
| Trust kernel covers all subjects | All expected subjects in registry |

## Expected First PR from OpenHands

When OpenHands runs its first cycle, it should open a PR that:

1. **Adds missing subjects** to `bootstrapGrantRegistry()` in `packages/permissions/src/index.ts`
2. **Does NOT touch**: permissions/grant-types.ts, apps/bridge/, auth/billing
3. **Is small** — under 100 lines changed
4. **Includes rollback plan** in PR description

**If PR matches -> Merge. If not -> Reject and narrow scope.**

---

## System Status (Verified)

| Component | Status | Notes |
|-----------|--------|-------|
| Worker health | OK | /health returns alive |
| Queue consumer | OK | 1 consumer, batch=10 |
| Metrics POST | OK | Accepted and processed |
| Action history | OK | 3 assessments recorded |
| Error rate | FAIL 85% | Trust kernel needs fix |
| Alpha config | OK | 5-phase pipeline ready |
