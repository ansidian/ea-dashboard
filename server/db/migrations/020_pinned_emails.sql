CREATE TABLE IF NOT EXISTS ea_pinned_emails (
  user_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  pinned_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, email_id)
);
