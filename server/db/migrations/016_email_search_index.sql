-- email metadata index for cross-account keyword search
CREATE TABLE IF NOT EXISTS ea_email_index (
  uid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  account_email TEXT NOT NULL,
  account_color TEXT DEFAULT '#818cf8',
  account_icon TEXT DEFAULT '📧',
  from_name TEXT NOT NULL DEFAULT '',
  from_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_snippet TEXT NOT NULL DEFAULT '',
  email_date TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  indexed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_index_user ON ea_email_index(user_id, email_date DESC);

CREATE INDEX IF NOT EXISTS idx_email_index_account ON ea_email_index(account_id);

-- FTS5 virtual table (standalone for Turso compatibility)
CREATE VIRTUAL TABLE IF NOT EXISTS ea_email_fts USING fts5(
  uid UNINDEXED,
  from_name,
  from_address,
  subject,
  body_snippet
);
