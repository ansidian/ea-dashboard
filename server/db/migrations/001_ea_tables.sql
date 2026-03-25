-- EA (Executive Assistant) briefing tables

CREATE TABLE IF NOT EXISTS ea_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#818cf8',
  credentials_encrypted TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ea_briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'generating',
  briefing_json TEXT,
  error_message TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  generation_time_ms INTEGER
);

CREATE TABLE IF NOT EXISTS ea_settings (
  user_id TEXT PRIMARY KEY,
  schedules_json TEXT DEFAULT '[{"time":"08:00","tz":"America/Los_Angeles","enabled":true,"label":"Morning"},{"time":"20:00","tz":"America/Los_Angeles","enabled":true,"label":"Evening"}]',
  email_lookback_hours INTEGER DEFAULT 16,
  weather_lat REAL DEFAULT 34.0686,
  weather_lng REAL DEFAULT -118.0276,
  weather_location TEXT DEFAULT 'El Monte, CA',
  actual_budget_url TEXT,
  actual_budget_password_encrypted TEXT,
  actual_budget_sync_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ea_briefings_user_status
  ON ea_briefings(user_id, status, generated_at DESC);
