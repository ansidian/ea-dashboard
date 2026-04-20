ALTER TABLE ea_settings ADD COLUMN bill_extract_provider TEXT DEFAULT 'anthropic';
ALTER TABLE ea_settings ADD COLUMN bill_extract_model TEXT DEFAULT 'claude-haiku-4-5';
