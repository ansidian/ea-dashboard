CREATE TABLE IF NOT EXISTS ea_api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ea_api_tokens_hash
  ON ea_api_tokens(token_hash);
