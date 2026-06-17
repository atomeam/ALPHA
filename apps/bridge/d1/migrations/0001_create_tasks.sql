-- Migration: 0001_create_tasks
-- Creates tasks table and audit_events table for Tasks Hub
-- Enums: lane (Human|Council), status (Not started|In progress|Done), priority (P0|P1|P2|P3)

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('Human', 'Council')),
  status TEXT NOT NULL CHECK (status IN ('Not started', 'In progress', 'Done')) DEFAULT 'Not started',
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')) DEFAULT 'P2',
  due_date TEXT NULL,
  blocking INTEGER NOT NULL DEFAULT 0,
  blocked_by TEXT NULL,
  tags_json TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for view queries
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks (status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_lane_status ON tasks (lane, status);
CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by ON tasks (blocked_by);

-- Audit events table (for compliance tracking)
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NULL,
  created_at TEXT NOT NULL
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_events_correlation ON audit_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (entity_type, entity_id);