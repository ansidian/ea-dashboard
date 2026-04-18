import db from "../db/connection.js";

// Today's date in Pacific time (ISO format YYYY-MM-DD)
function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

// Capture the fields needed to re-render a completed Todoist occurrence
// after the live API has advanced the task to its next due_date.
// Explicitly whitelists known fields — drops transient runtime props
// like _completing and status that don't belong in the persisted snapshot.
export function buildSnapshot(task) {
  return {
    id: task.id,
    title: task.title,
    due_date: task.due_date,
    due_time: task.due_time ?? null,
    class_name: task.class_name,
    class_color: task.class_color,
    url: task.url,
    priority: task.priority ?? null,
    labels: task.labels ?? [],
    description: task.description ?? "",
    source: "todoist",
    is_recurring: !!task.is_recurring,
  };
}

// Partition DB rows into live (due_date >= today) and expired (due_date < today).
// Rows with null due_date are defensively treated as expired.
export function partitionByExpiry(rows, today) {
  const live = [];
  const expired = [];
  for (const r of rows) {
    if (r.due_date && r.due_date >= today) live.push(r);
    else expired.push(r);
  }
  return { live, expired };
}

// Read all tombstone rows for a user (those with a non-null due_date),
// delete expired ones in a single statement, and return the live rows
// hydrated as synthetic complete Todoist entries ready to concat onto
// briefing.todoist.upcoming.
export async function hydrateRecurringTombstones(userId) {
  const result = await db.execute({
    sql: "SELECT todoist_id, due_date, snapshot_json FROM ea_completed_tasks WHERE user_id = ? AND due_date IS NOT NULL",
    args: [userId],
  });
  if (!result.rows.length) return [];

  const today = todayPacific();
  const { live, expired } = partitionByExpiry(result.rows, today);

  if (expired.length) {
    const placeholders = expired.map(() => "?").join(",");
    await db.execute({
      sql: `DELETE FROM ea_completed_tasks WHERE user_id = ? AND todoist_id IN (${placeholders})`,
      args: [userId, ...expired.map((r) => r.todoist_id)],
    });
  }

  const hydrated = [];
  for (const row of live) {
    let snapshot;
    try {
      snapshot = JSON.parse(row.snapshot_json);
    } catch (err) {
      console.warn(`[Tombstones] Skipping malformed snapshot for ${row.todoist_id}: ${err.message}`);
      continue;
    }
    hydrated.push({ ...snapshot, status: "complete", _tombstone: true });
  }
  return hydrated;
}
