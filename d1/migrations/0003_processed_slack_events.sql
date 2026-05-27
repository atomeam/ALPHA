-- Migration: 0003_processed_slack_events
-- Purpose: Dedupe table for Slack event idempotency
-- Author: OpenHands (ALPHA Council)
-- Date: 2026-05-27

-- Store processed Slack event IDs to prevent duplicate processing
-- TTL: events older than 24 hours are cleaned up
CREATE TABLE IF NOT EXISTS processed_slack_events (
    event_id   TEXT NOT NULL PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for cleanup queries (delete events older than 24h)
CREATE INDEX IF NOT EXISTS idx_processed_slack_events_age ON processed_slack_events(processed_at);

-- Note: Cleanup query (run periodically or in handler)
-- DELETE FROM processed_slack_events WHERE processed_at < datetime('now', '-24 hours');