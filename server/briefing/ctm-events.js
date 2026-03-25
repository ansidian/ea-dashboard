import ctmDb from "../db/ctm-connection.js";

export async function fetchCTMDeadlines(userId) {
  if (!ctmDb) {
    console.warn("[CTM Events] No CTM database connection — skipping deadlines");
    return [];
  }

  const result = await ctmDb.execute({
    sql: `SELECT e.id, e.title, e.due_date, e.due_time, e.points_possible,
                 e.status, e.source, e.description, e.url,
                 c.name as class_name, c.color as class_color
          FROM events e
          LEFT JOIN classes c ON e.class_id = c.id AND c.user_id = e.user_id
          WHERE e.user_id = ? AND e.status = 'pending'
            AND e.due_date BETWEEN date('now') AND date('now', '+7 days')
          ORDER BY e.due_date, e.due_time`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    due_date: row.due_date,
    due_time: row.due_time || "23:59",
    class_name: row.class_name || "Uncategorized",
    class_color: row.class_color || "#6b7280",
    points_possible: row.points_possible || null,
    status: row.status,
    source: row.source || "canvas",
    description: row.description || "",
    url: row.url || null,
  }));
}
