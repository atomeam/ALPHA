# RUN Header Specification v0.1

> **Canonical source:** [RUN header spec (Slack ops log) — v0](https://www.notion.so/RUN-header-spec-Slack-ops-log-v0-9a098a7889e743d4b87a08f687ba868e)  
> **Status:** Active — adopted from Notion spec  
> **Last updated:** 2026-05-27

---

## Purpose

Standardized RUN headers provide a consistent, machine-parseable format for logging operational events (deploys, migrations, smoke tests, incidents) to Slack `#ops-runs`.

Every operational run in ALPHA must emit a RUN header. This creates a searchable, auditable ledger for all infrastructure activity.

---

## Canonical Format

```
RUN: <run_id>
TASK: <task_id_or_link>
TYPE: <deploy|migration|smoke|incident|build|other>
ENV: <staging|prod|dev|other>
OWNER: <name>
RESULT: <success|failed|aborted|unknown>
START: <YYYY-MM-DD HH:MM TZ>
END: <YYYY-MM-DD HH:MM TZ>
DURATION: <e.g. 6m12s>
COMMIT/PR: <sha or link>
ARTIFACTS: <links>
LOGS: <links>
NOTES: <1–3 bullets or short sentence>
```

### Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| `RUN` | ✅ | Unique run identifier (see ID formats below) |
| `TASK` | ⬜ | Notion task URL or D1 task ID |
| `TYPE` | ✅ | Run classification |
| `ENV` | ✅ | Target environment |
| `OWNER` | ✅ | Owner/agent name |
| `RESULT` | ✅ | Final outcome |
| `START` | ⬜ | ISO 8601 start time |
| `END` | ⬜ | ISO 8601 end time |
| `DURATION` | ⬜ | Human-readable duration |
| `COMMIT/PR` | ⬜ | Commit SHA or PR URL |
| `ARTIFACTS` | ⬜ | Links to artifacts |
| `LOGS` | ⬜ | Links to logs |
| `NOTES` | ⬜ | Short notes or bullets |

---

## ID Formats

| Source | Format | Example |
|--------|--------|---------|
| GitHub Actions | `gha:<run_id>` | `gha:1234567890` |
| GitLab CI | `gl:<pipeline_id>` | `gl:987654321` |
| Agent run | `YYYY-MM-DD-HHMM-<type>-<slug>` | `2026-05-27-1812-deploy-0002-events` |

---

## Type Values

| Type | Description |
|------|-------------|
| `deploy` | Worker/function deployment |
| `migration` | Database schema migration |
| `smoke` | Smoke test run |
| `incident` | Incident response |
| `build` | Build/CI pipeline |
| `other` | Catch-all for non-standard runs |

---

## Result Values

| Result | Description |
|--------|-------------|
| `success` | Run completed successfully |
| `failed` | Run failed |
| `aborted` | Run was manually aborted |
| `unknown` | Run status not yet determined |

---

## Posting Rules

### Threading Model

1. **CI opens the RUN thread** when available (GitHub Actions is source of truth for deploy/migration/smoke)
2. **OpenHands/Devin posts follow-ups** (artifacts, notes, links) into that same thread
3. If CI isn't involved (pure agent run), **OpenHands/Devin opens** the thread

This "CI-first, agent-enriches" pattern keeps duplication low and makes RESULT deterministic.

### Channel Routing

- **Primary:** `#ops-runs` (canonical ops channel)
- **Cross-post:** Project channels as needed
- **Threading:** Keep all follow-ups in the same thread

### Message Flow

```
1. Run starts → Post RUN header (RESULT: unknown)
2. Artifacts arrive → Reply in thread with ARTIFACTS links
3. Logs available → Reply in thread with LOGS links
4. Run completes → Reply in thread with final RESULT + DURATION
```

---

## Slack Configuration

### Required Credentials

- **Bot Token:** `xoxb-...` (preferred)
- **Scopes:** `chat:write`, `channels:read`

### Environment Variables

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL=#ops-runs
```

---

## Scripts

### CI Action

`.github/actions/slack-reporter/action.yml` — GitHub Actions composite action for CI

### Python Reporter

`scripts/slack/slack_run_reporter.py` — Standalone Python script for agents

```bash
# Post deploy start
python3 scripts/slack/slack_run_reporter.py \
  --type deploy --env staging --owner OpenHands

# Post with artifacts
python3 scripts/slack/slack_run_reporter.py \
  --type deploy --env staging --owner OpenHands \
  --thread-ts 1234567890.123456 \
  --artifacts "https://github.com/org/repo/actions/runs/123"

# Post completion
python3 scripts/slack/slack_run_reporter.py \
  --type deploy --env staging --owner OpenHands \
  --result success --start-time 2026-05-27T18:00:00Z --end-time 2026-05-27T18:06:12Z
```

---

## Example Output

```
RUN: gha:1234567890
TASK: 
TYPE: deploy
ENV: staging
OWNER: CI
RESULT: success
START: 2026-05-27 18:00:00 UTC
END: 2026-05-27 18:06:12 UTC
DURATION: 6m12s
COMMIT/PR: https://github.com/org/repo/commit/abc123
ARTIFACTS: 
LOGS: 
NOTES: alpha-orchestrator deployed to staging
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-05-27 | Initial spec from Notion |