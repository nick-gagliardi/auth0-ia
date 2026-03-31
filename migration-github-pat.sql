-- Migration: Add github_pat_encrypted column to users table
-- This allows users to store a GitHub Personal Access Token to bypass OAuth app restrictions

ALTER TABLE users
ADD COLUMN IF NOT EXISTS github_pat_encrypted TEXT;

-- No index needed since this column won't be used for queries, only retrieved with the user record
