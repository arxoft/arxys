-- =============================================================================
-- Migration 0008 — add login_email to members
-- Used for OTP authentication only. Separate from venture-scoped emails
-- in venture_members which are used for Notion/Slack identity.
-- =============================================================================

ALTER TABLE members ADD COLUMN login_email TEXT;
CREATE UNIQUE INDEX idx_members_login_email ON members(login_email) WHERE login_email IS NOT NULL;
