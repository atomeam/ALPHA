-- Migration: 0002_events_council_logs
-- Purpose: Create audit_events table for CI/agent run tracking with UPSERT support
-- Author: OpenHands (ALPHA Council)
-- Date: 2026-05-27

-- Create audit_events table for run event logging
CREATE TABLE IF NOT EXISTS audit_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL UNIQUE,           -- Unique run identifier (e.g., "gha:1234567890")
    task        TEXT,                           -- Notion task URL or D1 task ID
    type        TEXT NOT NULL,                  -- deploy|migration|smoke|incident|build|other
    env         TEXT NOT NULL,                  -- staging|prod|dev|other
    owner       TEXT NOT NULL,                  -- Owner/agent name
    result      TEXT NOT NULL DEFAULT 'unknown',-- success|failed|aborted|unknown
    started_at  TEXT,                           -- ISO 8601
    ended_at    TEXT,                           -- ISO 8601
    duration    TEXT,                           -- Human-readable (e.g., "6m12s")
    commit_pr   TEXT,                           -- Commit SHA or PR URL
    artifacts   TEXT,                           -- Comma-separated links
    logs        TEXT,                           -- Comma-separated links
    notes       TEXT,                           -- Short notes or bullets
    slack_ts    TEXT,                           -- Slack thread timestamp
    slack_channel TEXT,                         -- Slack channel ID
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index on run_id for fast lookups (UNIQUE for UPSERT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_run_id ON audit_events(run_id);

-- Index on result for filtering
CREATE INDEX IF NOT EXISTS idx_audit_events_result ON audit_events(result);

-- Index on type for categorization
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(type);

-- Index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);

-- Function to upsert audit event (for idempotent run tracking)
-- If run_id exists, updates; otherwise inserts
CREATE PROCEDURE IF NOT EXISTS upsert_audit_event(
    p_run_id     TEXT,
    p_task       TEXT,
    p_type       TEXT,
    p_env        TEXT,
    p_owner      TEXT,
    p_result     TEXT,
    p_started_at TEXT,
    p_ended_at   TEXT,
    p_duration   TEXT,
    p_commit_pr  TEXT,
    p_artifacts  TEXT,
    p_logs       TEXT,
    p_notes      TEXT
)
BEGIN
    INSERT INTO audit_events (run_id, task, type, env, owner, result, started_at, ended_at, duration, commit_pr, artifacts, logs, notes)
    VALUES (p_run_id, p_task, p_type, p_env, p_owner, p_result, p_started_at, p_ended_at, p_duration, p_commit_pr, p_artifacts, p_logs, p_notes)
    ON CONFLICT(run_id) DO UPDATE SET
        task        = excluded.task,
        type        = excluded.type,
        env         = excluded.env,
        owner       = excluded.owner,
        result      = excluded.result,
        started_at  = COALESCE(excluded.started_at, audit_events.started_at),
        ended_at    = COALESCE(excluded.ended_at, audit_events.ended_at),
        duration    = COALESCE(excluded.duration, audit_events.duration),
        commit_pr   = COALESCE(excluded.commit_pr, audit_events.commit_pr),
        artifacts   = COALESCE(excluded.artifacts, audit_events.artifacts),
        logs        = COALESCE(excluded.logs, audit_events.logs),
        notes       = COALESCE(excluded.notes, audit_events.notes),
        updated_at  = datetime('now');
END;

-- View for recent runs (last 7 days)
CREATE VIEW IF NOT EXISTS recent_runs AS
SELECT * FROM audit_events
WHERE created_at >= datetime('now', '-7 days')
ORDER BY created_at DESC;

-- View for failed runs
CREATE VIEW IF NOT EXISTS failed_runs AS
SELECT * FROM audit_events
WHERE result = 'failed'
ORDER BY created_at DESC;