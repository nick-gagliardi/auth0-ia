-- Migration: feedback_diagnoses table
-- Created: 2026-04-30
-- Description: Persists LLM-generated diagnoses for clusters of Mintlify feedback,
--              keyed by docs page path. Generated on demand from /api/feedback/diagnose
--              using the requesting user's Anthropic key.

CREATE TABLE IF NOT EXISTS feedback_diagnoses (
  path TEXT PRIMARY KEY,
  diagnosis TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  generated_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_diagnoses_generated_at
  ON feedback_diagnoses(generated_at DESC);
