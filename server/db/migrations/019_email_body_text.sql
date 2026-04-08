-- Add full body text column for substring-across-body FTS matching.
-- body_snippet stays as the short preview shown in UI payloads; body_text
-- holds the full plain-text body and is what FTS highlights matches from.
ALTER TABLE ea_email_index ADD COLUMN body_text TEXT NOT NULL DEFAULT '';

-- FTS5 does not support ALTER TABLE ADD COLUMN on virtual tables.
-- Drop and recreate with the new column, then repopulate from the index.
DROP TABLE ea_email_fts;

CREATE VIRTUAL TABLE ea_email_fts USING fts5(
  uid UNINDEXED,
  from_name,
  from_address,
  subject,
  body_snippet,
  body_text
);

INSERT INTO ea_email_fts (uid, from_name, from_address, subject, body_snippet, body_text)
SELECT uid, from_name, from_address, subject, body_snippet, body_text FROM ea_email_index;
