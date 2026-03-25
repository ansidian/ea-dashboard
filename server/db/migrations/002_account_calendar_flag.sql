ALTER TABLE ea_accounts ADD COLUMN calendar_enabled INTEGER DEFAULT 0;

-- Enable calendar for existing Gmail accounts by default
UPDATE ea_accounts SET calendar_enabled = 1 WHERE type = 'gmail';
