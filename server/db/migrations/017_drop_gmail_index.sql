-- gmail_index is obsolete: Gmail web URLs now use ?authuser={email} which routes
-- to the correct account regardless of /u/N position.
ALTER TABLE ea_accounts DROP COLUMN gmail_index;
