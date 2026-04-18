-- Capture the Todoist task's due_date and a JSON snapshot of the metadata
-- we need to render the completed row after the task is gone from the live
-- Todoist API (recurring advance drops the prior occurrence). Snapshot is
-- what lets the dashboard keep showing the completed instance with
-- strikethrough until the due_date falls out of the visibility window.
ALTER TABLE ea_completed_tasks ADD COLUMN due_date TEXT;
ALTER TABLE ea_completed_tasks ADD COLUMN snapshot_json TEXT;
