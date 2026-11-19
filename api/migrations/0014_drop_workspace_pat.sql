-- Revert: drop workspace_pat column added in the previous 0014 migration.
-- Feature was reconsidered — GHP projects should live on the client org
-- alongside work repos, so a single member PAT covers everything.
ALTER TABLE workspaces DROP COLUMN workspace_pat;
