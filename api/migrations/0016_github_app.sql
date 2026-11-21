-- Add GitHub App installation ID to ventures.
-- When set, the API uses a short-lived installation token instead of a member PAT.
-- github_pat on venture_members becomes nullable (kept for transition / personal repos).
ALTER TABLE ventures ADD COLUMN github_app_installation_id TEXT;

-- Make github_pat nullable — SQLite doesn't support ALTER COLUMN, recreate the table.
CREATE TABLE venture_members_new (
  venture_id   TEXT NOT NULL REFERENCES ventures(id)  ON DELETE CASCADE,
  member_id    TEXT NOT NULL REFERENCES members(id)   ON DELETE CASCADE,
  venture_role TEXT NOT NULL DEFAULT 'member' CHECK (venture_role IN ('admin', 'member')),
  github_pat   TEXT,           -- nullable: PAT fallback or personal repos; replaced by App token
  notion_user  TEXT,
  email        TEXT,
  PRIMARY KEY (venture_id, member_id)
);
INSERT INTO venture_members_new SELECT * FROM venture_members;
DROP TABLE venture_members;
ALTER TABLE venture_members_new RENAME TO venture_members;
CREATE INDEX idx_venture_members_ven ON venture_members(venture_id);
CREATE INDEX idx_venture_members_mem ON venture_members(member_id);
