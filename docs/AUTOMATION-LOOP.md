# ALPHA Automation Loop — Design Spec v0.1

> **Status:** Designed  
> **Last updated:** 2026-05-27

---

## Design Decisions

### 1. Agent Control Plane: Slack (#ops-runs)

Slack is the event stream and work intake channel:
- RUN headers posted here by CI and agents
- Work instructions posted here by intake agent
- All follow-ups in threads

**Why Slack over Notion:**
- CI can post directly without Notion API overhead
- Real-time visibility for all operators
- Thread-based conversations work well for work tracking
- Faster velocity for operational messages

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
│    • Post to #ops-runs                                         │
│    • Include: task link, deliverable format, DoD               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT EXECUTES                              │
│                     OpenHands/Devin                             │
├─────────────────────────────────────────────────────────────────┤
│  For each work item:                                            │
│    • Implement deliverable                                     │
│    • Post RUN header to #ops-runs (RESULT: unknown)            │
│    • Post artifacts/logs in thread                             │
│    • Post RUN completion (RESULT: success|failed)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RUN UPDATER (Trigger)                       │
│                     On RUN completion                           │
├─────────────────────────────────────────────────────────────────┤
│  Parse RUN header:                                             │
│    • Extract run_id, TASK URL, result, artifacts               │
│                                                                  │
│  Update D1 audit_events:                                       │
│    • UPSERT run record (idempotent)                             │
│                                                                  │
│  Update Notion task:                                           │
│    • Set Status = Done (if success)                            │
│    • Add evidence comment with links                           │
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
NOTION_TOKEN=ntn_...       # Notion integration token
SLACK_BOT_TOKEN=xoxb-...  # Slack bot token
SLACK_CHANNEL=#ops-runs    # Control channel
```

### Run Updater
```bash
NOTION_TOKEN=ntn_...       # Notion integration token
AUDIT_DB=audit_events.db  # Local SQLite for testing (D1 in production)
```

---

## Example Message Flow

### 1. Intake Agent → #ops-runs
```
📋 WORK INTAKE

Task: P0 — Normalize webhook path
Priority: P0
Owner: Council
URL: https://www.notion.so/...

Deliverable Format:
RUN: <run_id>
TASK: https://www.notion.so/...
TYPE: build
ENV: dev
...

Definition of Done:
• PR created
• RUN header posted
• Notion task status updated
```

### 2. Agent → #ops-runs (start)
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

### 4. Run Updater → Notion
- Status updated to "Done"
- Comment added with evidence links

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

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-05-27 | Initial design |