CREATE TABLE IF NOT EXISTS ea_dismissed_emails (
  user_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  dismissed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, email_id)
);
