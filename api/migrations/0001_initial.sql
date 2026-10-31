-- =============================================================================
-- arxys API — initial schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VENTURES
-- One GitHub org + one Notion workspace + one Slack workspace.
-- -----------------------------------------------------------------------------
CREATE TABLE ventures (
  id               TEXT PRIMARY KEY,   -- slug: "arxoft", "client-acme"
  display_name     TEXT NOT NULL,
  github_org       TEXT NOT NULL,      -- GitHub org or user handle
  slack_bot_token  TEXT,               -- xoxb-xxx — shared across workspaces; nullable if not set
  slack_channel_id TEXT,               -- default channel; workspaces can override
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- WORKSPACES
-- Anchor git repo for a project. Inherits venture credentials.
-- Can override Notion database and Slack channel.
-- -----------------------------------------------------------------------------
CREATE TABLE workspaces (
  id                 TEXT PRIMARY KEY,  -- slug: "arxoft-platform", "arxoft-mobile"
  venture_id         TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  github_repo        TEXT NOT NULL,     -- "org/repo" of the root anchor repo
  notion_api_key     TEXT NOT NULL,     -- Notion integration secret for this workspace
  notion_database_id TEXT NOT NULL,     -- primary task board
  slack_channel_id   TEXT,              -- overrides venture default when set
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- WORKSPACE REPOS
-- Sub-repos under a workspace (frontend, backend, api, mobile…).
-- GitHub PR/issue ops target these by alias or full name.
-- -----------------------------------------------------------------------------
CREATE TABLE workspace_repos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo          TEXT NOT NULL,  -- "org/repo"
  alias         TEXT,           -- short name: "frontend", "api"
  UNIQUE (workspace_id, repo),
  UNIQUE (workspace_id, alias)
);

-- -----------------------------------------------------------------------------
-- VENTURE BOARDS
-- Extra Notion boards beyond the workspace default (e.g. ventures, clients).
-- Referenced via alias in requests: X-Board: ventures
-- -----------------------------------------------------------------------------
CREATE TABLE venture_boards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  venture_id   TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  database_id  TEXT NOT NULL,  -- Notion UUID
  alias        TEXT NOT NULL,  -- "ventures", "clients", "sprints"
  UNIQUE (venture_id, alias)
);

-- -----------------------------------------------------------------------------
-- MEMBERS
-- A person who can authenticate to the API.
-- Has one arxys API key; belongs to ventures via venture_members.
-- Note: email is NOT here — it is per-venture in venture_members because
-- a member can have a different email in each venture's Notion/Slack.
-- -----------------------------------------------------------------------------
CREATE TABLE members (
  id           TEXT PRIMARY KEY,     -- slug: "ako", "john"
  display_name TEXT NOT NULL,
  api_key      TEXT UNIQUE NOT NULL, -- "axk_" + random — never stored in client env
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- VENTURE MEMBERS
-- Identity per venture: GitHub PAT, email, venture-level role.
-- PAT and email are org-scoped — a person has different identities per venture.
-- -----------------------------------------------------------------------------
CREATE TABLE venture_members (
  venture_id   TEXT NOT NULL REFERENCES ventures(id)  ON DELETE CASCADE,
  member_id    TEXT NOT NULL REFERENCES members(id)   ON DELETE CASCADE,
  venture_role TEXT NOT NULL DEFAULT 'member' CHECK (venture_role IN ('admin', 'member')),
  github_pat   TEXT NOT NULL,  -- PAT scoped to this venture's GitHub org
  notion_user  TEXT,           -- short handle prepended to Notion comments: "(ako)"
  email        TEXT,           -- venture-specific email for Notion --mine + Slack @mention
  PRIMARY KEY (venture_id, member_id)
);

-- -----------------------------------------------------------------------------
-- WORKSPACE MEMBERS
-- Access control per workspace.
-- venture admin   → implicit access to all workspaces (no row needed here)
-- venture member  → must have an explicit row here to access a workspace
-- -----------------------------------------------------------------------------
CREATE TABLE workspace_members (
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id      TEXT NOT NULL REFERENCES members(id)    ON DELETE CASCADE,
  workspace_role TEXT NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('admin', 'member')),
  PRIMARY KEY (workspace_id, member_id)
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX idx_workspaces_venture    ON workspaces(venture_id);
CREATE INDEX idx_workspace_repos_ws    ON workspace_repos(workspace_id);
CREATE INDEX idx_venture_boards_ven    ON venture_boards(venture_id);
CREATE INDEX idx_venture_members_ven   ON venture_members(venture_id);
CREATE INDEX idx_venture_members_mem   ON venture_members(member_id);
CREATE INDEX idx_workspace_members_ws  ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_mem ON workspace_members(member_id);
CREATE INDEX idx_members_api_key       ON members(api_key);
