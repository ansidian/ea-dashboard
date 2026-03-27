import getCtmDb from "../db/ctm-connection.js";

function formatTime12h(timeStr) {
  if (!timeStr) return "11:59 PM";
  if (timeStr.includes("T")) {
    // ISO string — convert to Pacific time
    const d = new Date(timeStr);
    return d.toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  // "HH:MM" format
  let [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

export async function fetchCTMDeadlines(userId) {
  const ctmDb = getCtmDb();
  if (!ctmDb) {
    console.warn("[CTM Events] No CTM database connection — skipping deadlines");
    return [];
  }

  // Compute date boundaries in Pacific time (SQLite date('now') uses UTC)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const weekOut = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  const result = await ctmDb.execute({
    sql: `SELECT e.id, e.title, e.due_date, e.due_time, e.points_possible,
                 e.status, e.event_type, e.description, e.url,
                 e.canvas_id, e.todoist_id,
                 c.name as class_name, c.color as class_color
          FROM events e
          LEFT JOIN classes c ON e.class_id = c.id AND c.user_id = e.user_id
          WHERE e.user_id = ? AND e.status IN ('incomplete', 'in_progress')
            AND e.due_date BETWEEN ? AND ?
          ORDER BY e.due_date, e.due_time`,
    args: [userId, today, weekOut],
  });

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    due_date: row.due_date?.includes("T")
      ? new Date(row.due_date).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
      : row.due_date,
    due_time: formatTime12h(row.due_time ? row.due_time : row.due_date),
    class_name: row.class_name || "Uncategorized",
    class_color: row.class_color || "#6b7280",
    points_possible: row.points_possible || null,
    status: row.status,
    source: row.canvas_id ? "canvas" : row.todoist_id ? "todoist" : "manual",
    description: row.description || "",
    url: row.url || null,
  }));
}
