-- =============================================================================
-- Migration 0002 — move email from members to venture_members
--
-- A member can have a different email per venture (different GitHub orgs,
-- different Notion workspaces, different Slack workspaces).
-- email is used for Notion --mine filtering and Slack @mention lookup,
-- both of which are venture-scoped, so it belongs in venture_members.
-- =============================================================================

ALTER TABLE venture_members ADD COLUMN email TEXT;

-- members.email is no longer needed — drop it
-- SQLite doesn't support DROP COLUMN directly before 3.35, but
-- Cloudflare D1 supports it via the standard approach:
CREATE TABLE members_new (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  api_key      TEXT UNIQUE NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO members_new (id, display_name, api_key, created_at)
SELECT id, display_name, api_key, created_at FROM members;

DROP TABLE members;
ALTER TABLE members_new RENAME TO members;

-- Recreate index dropped with the old table
CREATE INDEX idx_members_api_key ON members(api_key);

-- Backfill ako's email into venture_members
UPDATE venture_members SET email = 'asif@arxoft.com'
WHERE member_id = 'ako' AND venture_id = 'arxoft';
