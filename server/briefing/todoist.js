import { decrypt } from "./encryption.js";
import db from "../db/connection.js";

const BASE_URL = "https://api.todoist.com/api/v1";

// --- Project cache: 10-minute TTL ---
const PROJECT_TTL_MS = 10 * 60 * 1000;
let projectCache = { data: null, ts: 0 };

async function getToken(userId) {
  const result = await db.execute({
    sql: "SELECT todoist_api_token_encrypted FROM ea_settings WHERE user_id = ?",
    args: [userId],
  });
  const encrypted = result.rows[0]?.todoist_api_token_encrypted;
  if (!encrypted) return null;
  return decrypt(encrypted);
}

async function todoistFetch(token, path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Todoist API ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchProjects(token) {
  if (projectCache.data && Date.now() - projectCache.ts < PROJECT_TTL_MS) {
    return projectCache.data;
  }
  const map = new Map();
  let cursor = null;
  do {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    params.set("limit", "200");
    const data = await todoistFetch(token, `/projects?${params}`);
    for (const p of data.results || data) {
      map.set(p.id, { name: p.name, color: p.color });
    }
    cursor = data.next_cursor || null;
  } while (cursor);
  projectCache.data = map;
  projectCache.ts = Date.now();
  return map;
}

// Map Todoist color names to hex (subset of Todoist palette)
const TODOIST_COLORS = {
  berry_red: "#b8255f", red: "#db4035", orange: "#ff9933",
  yellow: "#fad000", olive_green: "#afb83b", lime_green: "#7ecc49",
  green: "#299438", mint_green: "#6accbc", teal: "#158fad",
  sky_blue: "#14aaf5", light_blue: "#96c3eb", blue: "#4073ff",
  grape: "#884dff", violet: "#af38eb", lavender: "#eb96eb",
  magenta: "#e05194", salmon: "#ff8d85", charcoal: "#808080",
  grey: "#b8b8b8", taupe: "#ccac93",
};

function mapColor(todoistColor) {
  return TODOIST_COLORS[todoistColor] || "#cba6da";
}

// Todoist returns due datetimes in the user's local timezone without a Z
// suffix, so parse the time directly from the string to avoid UTC reinterpretation.
function formatTime12h(dateStr) {
  if (!dateStr || !dateStr.includes("T")) return null;
  const match = dateStr.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minute} ${ampm}`;
}

function todoistTaskUrl(content, id) {
  const slug = content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://app.todoist.com/app/task/${slug}-${id}`;
}

function extractDate(due) {
  if (!due?.date) return null;
  // "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS..."
  return due.date.split("T")[0];
}

export async function fetchTodoistTasks(userId) {
  const token = await getToken(userId);
  if (!token) return [];

  const projects = await fetchProjects(token);

  // Fetch tasks due within the next 7 days using filter endpoint
  const params = new URLSearchParams({
    query: "due before: +8 days",
    limit: "200",
  });

  const allTasks = [];
  let cursor = null;
  do {
    if (cursor) params.set("cursor", cursor);
    const data = await todoistFetch(token, `/tasks/filter?${params}`);
    allTasks.push(...(data.results || data.items || []));
    cursor = data.next_cursor || null;
  } while (cursor);

  return allTasks
    .filter(t => !t.checked && !t.is_deleted && t.due)
    .map(t => {
      const proj = projects.get(t.project_id);
      return {
        id: t.id,
        title: t.content,
        due_date: extractDate(t.due),
        due_time: formatTime12h(t.due.date),
        class_name: proj?.name || "Todoist",
        class_color: proj ? mapColor(proj.color) : "#cba6da",
        points_possible: null,
        status: "incomplete",
        source: "todoist",
        description: t.description || "",
        url: todoistTaskUrl(t.content, t.id),
        priority: t.priority,
        labels: t.labels || [],
      };
    });
}

export async function completeTodoistTask(userId, taskId) {
  const token = await getToken(userId);
  if (!token) throw new Error("Todoist not configured");
  await todoistFetch(token, `/tasks/${taskId}/close`, { method: "POST" });
}

export async function testConnection(userId) {
  const token = await getToken(userId);
  if (!token) throw new Error("Todoist API token not configured");
  const data = await todoistFetch(token, "/projects?limit=1");
  return { success: true, projectCount: (data.results || data).length };
}
