-- =============================================================================
-- Migration 0007 — add sessions table for OTP auth
-- =============================================================================

-- OTP codes — short-lived, single-use
CREATE TABLE otp_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  code       TEXT    NOT NULL,  -- 6-digit code
  expires_at TEXT    NOT NULL,  -- ISO datetime
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Sessions — created after OTP verified
CREATE TABLE sessions (
  token      TEXT    PRIMARY KEY,  -- random 32-byte hex
  member_id  TEXT    NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_otp_email      ON otp_codes(email);
CREATE INDEX idx_sessions_token ON sessions(token);
