-- D1 Migration: Create bridge-specific tables
-- Run: wrangler d1 migrations apply aether-bridge-db --remote

-- Audit trail for all API calls
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_body TEXT,
  response_status INTEGER,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Idempotency keys for side-effect endpoints
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  response_body TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Proposal artifacts
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content TEXT,
  correlation_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_proposal ON artifacts(proposal_id);