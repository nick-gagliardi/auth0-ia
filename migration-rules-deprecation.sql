-- Migration: Rules Deprecation status tracking
-- Created: 2026-04-10
-- Description: Tracks per-page status for Rules-to-Actions deprecation burndown

CREATE TABLE IF NOT EXISTS rules_deprecation_status (
  file_path TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | done | wont_fix
  pr_url TEXT,
  notes TEXT,
  updated_by TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_deprecation_status
ON rules_deprecation_status(status);
