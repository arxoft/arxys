-- =============================================================================
-- Migration 0004 — drop notion_title_property from workspaces
-- Title column is always named 'Title'. Not configurable.
-- =============================================================================

CREATE TABLE workspaces_new (
  id                 TEXT PRIMARY KEY,
  venture_id         TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  github_repo        TEXT NOT NULL,
  notion_api_key     TEXT NOT NULL,
  notion_database_id TEXT NOT NULL,
  slack_channel_id   TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO workspaces_new (id, venture_id, display_name, github_repo, notion_api_key, notion_database_id, slack_channel_id, created_at)
SELECT id, venture_id, display_name, github_repo, notion_api_key, notion_database_id, slack_channel_id, created_at
FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces_new RENAME TO workspaces;

CREATE INDEX IF NOT EXISTS idx_workspaces_venture ON workspaces(venture_id);
