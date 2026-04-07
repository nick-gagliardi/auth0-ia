-- Migration: Add Mintlify credentials to users table
-- Created: 2026-04-07
-- Description: Adds encrypted Mintlify API key and project ID columns for per-user analytics access

-- Add Mintlify API key column (encrypted)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mintlify_api_key_encrypted TEXT;

-- Add Mintlify project ID column (encrypted, though it's not secret, encrypted for consistency)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mintlify_project_id_encrypted TEXT;

-- Add index for faster lookups (optional, but good practice)
CREATE INDEX IF NOT EXISTS idx_users_has_mintlify
ON users(mintlify_api_key_encrypted)
WHERE mintlify_api_key_encrypted IS NOT NULL;
