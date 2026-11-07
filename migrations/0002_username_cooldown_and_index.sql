-- Migration: 0002_username_cooldown_and_index.sql
-- Purpose:
--   1. Add username_changed_at timestamp (unix ms) for 30-day username change cooldown.
--   2. Add case-insensitive unique index on user(username COLLATE NOCASE) to prevent handle spoofing.
--   3. Create username_history table for 301 profile redirects from previous handles.
--
-- PRE-MIGRATION SAFETY CHECK:
-- To check for existing case-insensitive duplicate usernames before running this migration,
-- run the following query against your D1 database:
--
--   SELECT LOWER(username) AS duplicate_handle, COUNT(*) AS count, GROUP_CONCAT(id) AS user_ids
--   FROM user
--   GROUP BY LOWER(username)
--   HAVING count > 1;
--
-- If duplicates exist, reach out to the affected users manually. DO NOT SILENTLY RENAME ANYONE.

-- Step 1: Add username_changed_at column (nullable INTEGER unix timestamp in milliseconds)
ALTER TABLE user ADD COLUMN username_changed_at INTEGER DEFAULT NULL;

-- Step 2: Create username_history table to support seamless /u/[old_handle] -> /u/[new_handle] redirects
CREATE TABLE IF NOT EXISTS username_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    old_username TEXT NOT NULL,
    changed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_username_history_old ON username_history(old_username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id);

-- Step 3: Create case-insensitive unique index on user table
-- This enforces that handles like 'RedoSan' and 'redosan' cannot coexist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username_nocase ON user(username COLLATE NOCASE);

