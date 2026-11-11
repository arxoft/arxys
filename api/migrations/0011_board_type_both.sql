-- =============================================================================
-- Migration 0011 — allow board_type = 'both' on workspaces
--
-- Relaxes the CHECK constraint from IN ('notion','github') to also allow 'both',
-- enabling a workspace to use Notion and GitHub Projects simultaneously.
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.
-- =============================================================================

CREATE TABLE workspaces_new (
  id                 TEXT PRIMARY KEY,
  venture_id         TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  github_repo        TEXT NOT NULL,
  board_type         TEXT NOT NULL DEFAULT 'notion'
                     CHECK (board_type IN ('notion', 'github', 'both')),
  notion_api_key     TEXT,               -- required when board_type IN ('notion', 'both')
  notion_database_id TEXT,               -- required when board_type IN ('notion', 'both')
  github_project_id  TEXT,               -- required when board_type IN ('github', 'both')
  slack_channel_id   TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO workspaces_new
SELECT * FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces_new RENAME TO workspaces;

CREATE INDEX idx_workspaces_venture ON workspaces(venture_id);
