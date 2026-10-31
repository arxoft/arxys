-- =============================================================================
-- Migration 0006 — split venture_members into venture_members + workspace_members
--
-- venture_members  — identity per venture (PAT, email, venture-level role)
-- workspace_members — access control per workspace (explicit opt-in)
--
-- Access rule:
--   venture admin  → implicit access to ALL workspaces in the venture
--   venture member → must have an explicit workspace_members row
-- =============================================================================

-- 1. Drop role from venture_members (role moves to both tables separately)
--    Rebuild venture_members without role column, add venture_role instead
--    for clarity.
CREATE TABLE venture_members_new (
  venture_id   TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  member_id    TEXT NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  venture_role TEXT NOT NULL DEFAULT 'member' CHECK (venture_role IN ('admin', 'member')),
  github_pat   TEXT NOT NULL,
  notion_user  TEXT,
  email        TEXT,
  PRIMARY KEY (venture_id, member_id)
);

INSERT INTO venture_members_new (venture_id, member_id, venture_role, github_pat, notion_user, email)
SELECT venture_id, member_id, role, github_pat, notion_user, email
FROM venture_members;

DROP TABLE venture_members;
ALTER TABLE venture_members_new RENAME TO venture_members;

-- 2. Create workspace_members
CREATE TABLE workspace_members (
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id        TEXT NOT NULL REFERENCES members(id)    ON DELETE CASCADE,
  workspace_role   TEXT NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('admin', 'member')),
  PRIMARY KEY (workspace_id, member_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_venture_members_ven  ON venture_members(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_members_mem  ON venture_members(member_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_mem ON workspace_members(member_id);
