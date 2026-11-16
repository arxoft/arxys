-- Drop the unused workspace_repos table.
-- Routes that need a repo require ?repo=owner/repo explicitly.
-- The primary workspace repo (workspaces.github_repo) is the default
-- and is validated in route handlers when ?repo= is omitted.
DROP TABLE IF EXISTS workspace_repos;
