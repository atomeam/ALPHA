-- Migration: 0002_events_council_logs
-- Purpose: Create audit_events table for CI/agent run tracking with UPSERT support
-- Author: OpenHands (ALPHA Council)
-- Date: 2026-05-27

-- Create audit_events table for run event logging
CREATE TABLE IF NOT EXISTS audit_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL UNIQUE,           -- Unique run identifier (e.g., "gha:1234567890")
    task_id     TEXT,                           -- Notion task URL or D1 task ID
    run_type    TEXT NOT NULL,                  -- deploy|migration|smoke|incident|build|other
    env         TEXT NOT NULL,                  -- staging|prod|dev|other
    owner       TEXT NOT NULL,                  -- Owner/agent name
    result      TEXT NOT NULL DEFAULT 'unknown',-- success|failed|aborted|unknown
    start_time  TEXT,                           -- ISO 8601
    end_time    TEXT,                           -- ISO 8601
    duration    TEXT,                           -- Human-readable (e.g., "6m12s")
    commit_pr   TEXT,                           -- Commit SHA or PR URL
    artifacts   TEXT,                           -- Comma-separated links
    logs        TEXT,                           -- Comma-separated links
    notes       TEXT,                           -- Short notes or bullets
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index on run_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_run_id ON audit_events(run_id);

-- Index on result for filtering
CREATE INDEX IF NOT EXISTS idx_audit_events_result ON audit_events(result);

-- Index on run_type for categorization
CREATE INDEX IF NOT EXISTS idx_audit_events_run_type ON audit_events(run_type);

-- Index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);

-- Function to upsert audit event (for idempotent run tracking)
-- If run_id exists, updates; otherwise inserts
CREATE PROCEDURE IF NOT EXISTS upsert_audit_event(
    p_run_id    TEXT,
    p_task_id   TEXT,
    p_run_type  TEXT,
    p_env       TEXT,
    p_owner     TEXT,
    p_result    TEXT,
    p_start_time TEXT,
    p_end_time  TEXT,
    p_duration  TEXT,
    p_commit_pr TEXT,
    p_artifacts TEXT,
    p_logs      TEXT,
    p_notes     TEXT
)
BEGIN
    INSERT INTO audit_events (run_id, task_id, run_type, env, owner, result, start_time, end_time, duration, commit_pr, artifacts, logs, notes)
    VALUES (p_run_id, p_task_id, p_run_type, p_env, p_owner, p_result, p_start_time, p_end_time, p_duration, p_commit_pr, p_artifacts, p_logs, p_notes)
    ON CONFLICT(run_id) DO UPDATE SET
        task_id     = excluded.task_id,
        run_type    = excluded.run_type,
        env         = excluded.env,
        owner       = excluded.owner,
        result      = excluded.result,
        start_time  = excluded.start_time,
        end_time    = excluded.end_time,
        duration    = excluded.duration,
        commit_pr   = excluded.commit_pr,
        artifacts   = excluded.artifacts,
        logs        = excluded.logs,
        notes       = excluded.notes,
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