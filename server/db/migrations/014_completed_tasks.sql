CREATE TABLE IF NOT EXISTS ea_completed_tasks (
  user_id TEXT NOT NULL,
  todoist_id TEXT NOT NULL,
  completed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, todoist_id)
);
