-- =============================================================================
-- Migration 0010 — board_type + GitHub Project support on workspaces
--
-- board_type: 'notion' (default) | 'github'
-- github_project_id: GitHub Projects v2 node ID (PVT_...)
--
-- notion_api_key and notion_database_id become nullable so that
-- github-board workspaces don't need them.
-- =============================================================================

-- SQLite doesn't support ALTER COLUMN, so we recreate the table.

CREATE TABLE workspaces_new (
  id                 TEXT PRIMARY KEY,
  venture_id         TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  github_repo        TEXT NOT NULL,
  board_type         TEXT NOT NULL DEFAULT 'notion' CHECK (board_type IN ('notion', 'github')),
  notion_api_key     TEXT,               -- required when board_type = 'notion'
  notion_database_id TEXT,               -- required when board_type = 'notion'
  github_project_id  TEXT,               -- required when board_type = 'github' (PVT_... node ID)
  slack_channel_id   TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO workspaces_new (
  id, venture_id, display_name, github_repo,
  board_type, notion_api_key, notion_database_id,
  github_project_id, slack_channel_id, created_at
)
SELECT
  id, venture_id, display_name, github_repo,
  'notion', notion_api_key, notion_database_id,
  NULL, slack_channel_id, created_at
FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces_new RENAME TO workspaces;

-- Recreate indexes
CREATE INDEX idx_workspaces_venture ON workspaces(venture_id);
