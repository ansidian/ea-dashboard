-- ea_email_fts (FTS5) had no UNIQUE constraint, and the indexer used
-- INSERT OR IGNORE which is a no-op on virtual tables. Re-indexing the same
-- email appended duplicate FTS rows, causing the search JOIN to return
-- duplicates. Wipe FTS and rebuild from ea_email_index.
DELETE FROM ea_email_fts;

INSERT INTO ea_email_fts (uid, from_name, from_address, subject, body_snippet)
SELECT uid, from_name, from_address, subject, body_snippet FROM ea_email_index;
