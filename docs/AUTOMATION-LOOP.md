# ALPHA Automation Loop — Design Spec v0.1

> **Status:** Designed  
> **Last updated:** 2026-05-27

---

## Design Decisions

### 1. Agent Control Plane: Two-Channel Model

**Channel Separation (Canonical):**

| Channel | Purpose | Content |
|---------|---------|---------|
| `#ops-control` | Work queue / instruction stream | Intake agent posts work items |
| `#ops-runs` | Evidence stream / RUN ledger | CI and agents post RUN headers |

**Why separation matters:**
- `#ops-control` is the intake queue — agents monitor for work instructions
- `#ops-runs` is the evidence log — scan for completed runs, audit trail
- Mixing them pollutes the evidence stream and makes scanning harder

**intake_agent.py** posts to `#ops-control` (never to `#ops-runs`)  
**run_updater.py** monitors `#ops-runs` for `RESULT:` patterns

### 2. Correlation Key: TASK: field with Notion URL

Every RUN header includes `TASK: <notion_url>`:
- Enables automated Notion task updates
- Human-readable in Slack
- Self-documenting audit trail

---

## The Closed Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTAKE AGENT (Cron)                         │
│                     Every 4 hours                               │
├─────────────────────────────────────────────────────────────────┤
│  Query Notion Todo List:                                        │
│    • Status != Done                                            │
│    • Priority in (P0, P1)                                      │
│    • Owner = Council                                           │
│                                                                  │
│  For each task:                                                 │
│    • Generate work instruction message                         │
│    • Post to #ops-control (NOT #ops-runs)                     │
│    • Include: task link, deliverable format, DoD               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT EXECUTES                              │
│                     OpenHands/Devin                             │
├─────────────────────────────────────────────────────────────────┤
│  For each work item (from #ops-control):                        │
│    • Implement deliverable                                     │
│    • Post RUN header to #ops-runs (RESULT: unknown)            │
│    • Post artifacts/logs in thread                             │
│    • Post RUN completion (RESULT: success|failed)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RUN UPDATER (Webhook)                      │
│                     On Slack message in #ops-runs              │
├─────────────────────────────────────────────────────────────────┤
│  Guardrails (before processing):                               │
│    1. Verify Slack signature                                   │
│    2. De-dupe by event_id (stored in D1 ~24h)                  │
│    3. Validate TASK: is Notion URL or 'none'                   │
│                                                                  │
│  On valid RUN completion:                                       │
│    • Extract run_id, TASK URL, result, artifacts               │
│    • UPSERT to D1 audit_events (idempotent)                    │
│    • Update Notion task status + evidence comment              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EVIDENCE-GATED COMPLETION                   │
│                     Task marked Done in Notion                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scripts

| Script | Purpose | Trigger |
|--------|---------|---------|
| `intake_agent.py` | Query Notion, post work to Slack | Cron (every 4h) |
| `run_updater.py` | Parse RUN, update D1 + Notion | On RUN completion |

---

## Environment Variables

### Intake Agent
```bash
NOTION_TOKEN=ntn_...                  # Notion integration token
SLACK_BOT_TOKEN=xoxb-...              # Slack bot token
SLACK_OPS_CONTROL_CHANNEL=#ops-control  # Work queue channel
SLACK_OPS_RUNS_CHANNEL=#ops-runs       # Evidence stream (config only)
```

### Run Updater
```bash
NOTION_TOKEN=ntn_...                  # Notion integration token
SLACK_BOT_TOKEN=xoxb-...             # Slack bot token
SLACK_SIGNING_SECRET=...              # Slack Events API signing secret
SLACK_OPS_RUNS_CHANNEL_ID=...        # #ops-runs channel ID (numeric)
AUDIT_DB=audit_events.db             # Local SQLite (D1 in production)
```

---

## Wiring Checklist

The following secrets/configs must be set before the loop is always-on:

| Secret/Config | Purpose |
|--------------|---------|
| `NOTION_TOKEN` | Query Todo List, update task status |
| `SLACK_BOT_TOKEN` | Post to #ops-control, monitor #ops-runs |
| `SLACK_SIGNING_SECRET` | Verify Slack Events API requests |
| `SLACK_OPS_RUNS_CHANNEL_ID` | Filter events to #ops-runs only |
| `SLACK_OPS_CONTROL_CHANNEL` | Intake agent target (default: #ops-control) |

**Slack App Requirements:**
- App installed to workspace
- Events API enabled (subscribe to `message.channels`)
- Bot scopes: `chat:write`, `channels:read`

---

## Example Message Flow

### 1. Intake Agent → #ops-control
```
📋 WORK QUEUE — From Notion Todo List

Task: P0 — Normalize webhook path
Priority: P0
Owner: Council
URL: https://www.notion.so/...

Deliverable Format:
RUN: <run_id>
TASK: https://www.notion.so/...
TYPE: build
...

Post to: #ops-runs (evidence stream)

Definition of Done:
• PR created
• RUN header posted to #ops-runs
• Notion task status updated to Done
```

### 2. Agent monitors #ops-control → executes → posts to #ops-runs (start)
```
RUN: gha:1234567890
TASK: https://www.notion.so/...
TYPE: build
ENV: staging
OWNER: OpenHands
RESULT: unknown
START: 2026-05-27 22:00 UTC
...
```

### 3. Agent → #ops-runs (completion)
```
RUN: gha:1234567890
TASK: https://www.notion.so/...
TYPE: build
ENV: staging
OWNER: OpenHands
RESULT: success
START: 2026-05-27 22:00 UTC
END: 2026-05-27 22:15 UTC
DURATION: 15m
COMMIT/PR: https://github.com/atomeam/ALPHA/pull/24
ARTIFACTS: https://github.com/atomeam/ALPHA/pull/24
LOGS:
NOTES: Webhook path normalized to /webhooks/notion
```

### 4. Run Updater (triggered by Slack Events API)
- Guardrails pass (signature valid, no dupe, TASK is Notion URL)
- D1 UPSERT: idempotent run record
- Notion: Status → Done, comment with evidence links

---

## Notion Update Behavior (v0 Canonical)

**Rule:** Run updater sets `Status` and appends evidence as a **page comment**.

No new properties required — works with existing Todo List schema.

**Why comments over property:**
- No schema change needed
- Audit trail is visible to all page viewers
- Maintains idempotency (updater doesn't need to track what it wrote)

**Update payload:**
```json
{
  "properties": {
    "Status": {"select": {"name": "Done"}}
  },
  "children": []  // Empty - comments are separate API call
}
```

**Evidence comment format:**
```
🏁 RUN Completed — Evidence

Run ID: gha:1234567890
Result: success
Duration: 15m
Commit/PR: https://github.com/atomeam/ALPHA/pull/24
Artifacts: https://github.com/atomeam/ALPHA/pull/24
Notes: Webhook path normalized to /webhooks/notion

Posted by: OpenHands (ALPHA Council)
Timestamp: 2026-05-27T22:15:00Z
```

---

## OpenHands Automation Configuration

### Intake Agent (Cron)
```bash
curl -X POST "${OPENHANDS_HOST}/api/automation/v1/preset/prompt" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Notion Task Intake",
    "prompt": "Run /workspace/project/ALPHA/scripts/automation/intake_agent.py and post results to Slack.",
    "trigger": {"type": "cron", "schedule": "0 */4 * * *", "timezone": "UTC"},
    "repos": [{"url": "atomeam/ALPHA", "provider": "github", "ref": "main"}]
  }'
```

### Run Updater (Event-triggered via Slack webhook)
```bash
curl -X POST "${OPENHANDS_HOST}/api/automation/v1/preset/prompt" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Update Notion on Run Completion",
    "prompt": "Run /workspace/project/ALPHA/scripts/automation/run_updater.py with the RUN header from the event.",
    "trigger": {"type": "event", "source": "slack", "on": "message.posted", "filter": "contains(text, \"RESULT:\")"},
    "repos": [{"url": "atomeam/ALPHA", "provider": "github", "ref": "main"}]
  }'
```

---

## Acceptance Test (End-to-End Proof)

Once secrets are set, run this sequence to validate the full loop:

### 1. Intake posts to #ops-control
```bash
python3 scripts/automation/intake_agent.py --dry-run
```

### 2. Agent posts RUN header to #ops-runs
```bash
python3 scripts/slack/slack_run_reporter.py \
  --type build --env staging --owner OpenHands \
  --task-id "https://www.notion.so/..." \
  --result unknown --start-time 2026-05-27T22:00:00Z
```

### 3. Agent posts RESULT in same thread
```bash
python3 scripts/slack/slack_run_reporter.py \
  --type build --env staging --owner OpenHands \
  --task-id "https://www.notion.so/..." \
  --result success --start-time 2026-05-27T22:00:00Z \
  --end-time 2026-05-27T22:15:00Z \
  --artifacts "https://github.com/atomeam/ALPHA/pull/24" \
  --notes "Webhook path normalized" \
  --thread-ts <from_step_2_ts>
```

### 4. Verify D1 row exists (UPSERT)
```sql
SELECT run_id, result, duration, artifacts
FROM audit_events
WHERE run_id = 'gha:<run_number>';
```

Expected: Single row (idempotent — no duplicates on retry)

### 5. Verify Notion task updated
- Status → Done
- Comment added with evidence block

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-05-27 | Initial design |
| 0.2 | 2026-05-27 | Channel separation + dedup guardrails |
| 0.3 | 2026-05-27 | Notion behavior: comments over properties (Option A) |