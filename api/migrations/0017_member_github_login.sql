-- Add github_login to venture_members.
-- Used for ?mine=1 filtering when an App token is in use
-- (App tokens have no /user identity — login must be stored explicitly).
ALTER TABLE venture_members ADD COLUMN github_login TEXT;
