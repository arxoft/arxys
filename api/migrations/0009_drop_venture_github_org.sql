-- =============================================================================
-- Migration 0009 — drop github_org from ventures
-- GitHub is per-workspace (github_repo) and per-member (github_pat).
-- Ventures have no direct GitHub relationship.
-- =============================================================================

CREATE TABLE ventures_new (
  id               TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  slack_bot_token  TEXT,
  slack_channel_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO ventures_new (id, display_name, slack_bot_token, slack_channel_id, created_at)
SELECT id, display_name, slack_bot_token, slack_channel_id, created_at
FROM ventures;

DROP TABLE ventures;
ALTER TABLE ventures_new RENAME TO ventures;
