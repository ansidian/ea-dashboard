CREATE TABLE IF NOT EXISTS ea_snoozed_emails (
  user_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  until_ts INTEGER NOT NULL,
  snoozed_at TEXT DEFAULT (datetime('now')),
  email_snapshot TEXT,
  PRIMARY KEY (user_id, email_id)
);

CREATE INDEX IF NOT EXISTS idx_snoozed_emails_user_until
  ON ea_snoozed_emails (user_id, until_ts);
