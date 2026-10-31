-- =============================================================================
-- Migration 0003 — move notion_api_key from ventures to workspaces
--
-- Each workspace can belong to a different Notion workspace (different API key)
-- even within the same venture. Storing it at venture level was too coarse.
-- =============================================================================

-- 1. Add notion_api_key to workspaces, backfill from parent venture
ALTER TABLE workspaces ADD COLUMN notion_api_key TEXT NOT NULL DEFAULT '';

UPDATE workspaces
SET notion_api_key = (
  SELECT v.notion_api_key FROM ventures v WHERE v.id = workspaces.venture_id
);

-- 2. Drop notion_api_key from ventures via table rebuild
CREATE TABLE ventures_new (
  id               TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  github_org       TEXT NOT NULL,
  slack_bot_token  TEXT,
  slack_channel_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO ventures_new (id, display_name, github_org, slack_bot_token, slack_channel_id, created_at)
SELECT id, display_name, github_org, slack_bot_token, slack_channel_id, created_at
FROM ventures;

DROP TABLE ventures;
ALTER TABLE ventures_new RENAME TO ventures;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_venture  ON workspaces(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_members_ven ON venture_members(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_members_mem ON venture_members(member_id);
