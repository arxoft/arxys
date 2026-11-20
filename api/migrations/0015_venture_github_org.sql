-- Add github_org to ventures.
-- Decouples project/org operations from workspace github_repo.
-- All GitHub org-level API calls (project list, org bootstrap, issue types,
-- issue fields) will use this column instead of parsing github_repo.
ALTER TABLE ventures ADD COLUMN github_org TEXT;
