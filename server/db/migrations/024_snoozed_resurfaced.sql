-- Extend ea_snoozed_emails so rows survive past the wake moment with a
-- "resurfaced" status. The live route reads these as fresh-unread emails
-- until they're cleaned up (48h after wake). Backfills existing rows.
ALTER TABLE ea_snoozed_emails ADD COLUMN status TEXT NOT NULL DEFAULT 'snoozed';
ALTER TABLE ea_snoozed_emails ADD COLUMN resurfaced_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_snoozed_emails_user_status
  ON ea_snoozed_emails (user_id, status);
