-- Session persistence (SEC-04) and CSRF token storage (SEC-03)
CREATE TABLE IF NOT EXISTS ea_sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ea_sessions_expires
  ON ea_sessions(expires_at);

CREATE TABLE IF NOT EXISTS ea_csrf_tokens (
  token TEXT PRIMARY KEY,
  account_label TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
