-- =============================================================================
-- Migration 0012 — drop board_type from workspaces
--
-- board_type is no longer needed. A workspace can have Notion credentials,
-- GitHub Project credentials, both, or neither. API endpoints check for the
-- presence of credentials directly rather than relying on this field.
-- SQLite doesn't support DROP COLUMN with CHECK constraints, so we recreate.
-- =============================================================================

CREATE TABLE workspaces_new (
  id                 TEXT PRIMARY KEY,
  venture_id         TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  github_repo        TEXT NOT NULL,
  notion_api_key     TEXT,
  notion_database_id TEXT,
  github_project_id  TEXT,
  slack_channel_id   TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO workspaces_new
  SELECT id, venture_id, display_name, github_repo,
         notion_api_key, notion_database_id, github_project_id,
         slack_channel_id, created_at
  FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces_new RENAME TO workspaces;

CREATE INDEX idx_workspaces_venture ON workspaces(venture_id);
