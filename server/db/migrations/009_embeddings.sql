CREATE TABLE IF NOT EXISTS ea_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  briefing_id INTEGER NOT NULL,
  section_type TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding F32_BLOB(1536),
  source_date TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (briefing_id) REFERENCES ea_briefings(id)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_user ON ea_embeddings(user_id, section_type, source_date);
