import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchCTMDeadlinesAll } from "../briefing/ctm.js";
import { fetchTodoistTasksAll } from "../briefing/todoist.js";
import {
  loadUserConfig,
  separateDeadlines,
  computeDeadlineStats,
  loadCompletedTaskIds,
  carryForwardCompletedTodoist,
} from "../briefing/index.js";
import { fetchCalendar, pacificDayBoundaries } from "../briefing/calendar.js";
import { hydrateRecurringTombstones, addDaysIso } from "../briefing/tombstones.js";

const router = Router();
router.use(requireAuth);

router.get("/deadlines", async (req, res) => {
  try {
    const userId = process.env.EA_USER_ID;

    const [ctmDeadlines, todoistTasks, latestBriefingRow] = await Promise.all([
      fetchCTMDeadlinesAll().catch((err) => {
        console.error("[Calendar] CTM fetch failed:", err.message);
        return [];
      }),
      fetchTodoistTasksAll(userId).catch((err) => {
        console.error("[Calendar] Todoist fetch failed:", err.message);
        return [];
      }),
      // Pull the stored briefing's completed Todoist rows so the calendar
      // can carry them forward with its own (yesterday) date gate.
      db.execute({
        sql: `SELECT briefing_json FROM ea_briefings
              WHERE user_id = ? AND status = 'ready'
              ORDER BY generated_at DESC LIMIT 1`,
        args: [userId],
      }).then((r) => r.rows[0] || null).catch(() => null),
    ]);

    const completedIds = await loadCompletedTaskIds(userId, todoistTasks);
    const separated = separateDeadlines(ctmDeadlines, todoistTasks, completedIds);
    // Derive id set from the already-fetched full-horizon list — no extra API call.
    const liveTodoistIds = new Set(todoistTasks.map((t) => String(t.id)));
    // Calendar's render gate is lenient by one day — a task completed
    // yesterday should still read as "done yesterday" in the calendar view,
    // whereas the deadlines section drops it at midnight.
    const tombstones = await hydrateRecurringTombstones(userId, liveTodoistIds, {
      viewBoundary: "yesterday",
    });

    // Carry forward completed non-recurring Todoist rows from the stored
    // briefing, gated by yesterday so tasks completed yesterday still show.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
    const yesterday = addDaysIso(today, -1);
    let prevTodoist = null;
    if (latestBriefingRow) {
      try {
        prevTodoist = JSON.parse(latestBriefingRow.briefing_json)?.todoist?.upcoming;
      } catch { /* ignore malformed prev briefing */ }
    }
    const todoistWithCarried = carryForwardCompletedTodoist(
      [...separated.todoist, ...tombstones],
      prevTodoist,
      yesterday,
    );

    res.json({
      ctm: {
        upcoming: separated.ctm,
        stats: computeDeadlineStats(separated.ctm),
      },
      todoist: {
        upcoming: todoistWithCarried,
        stats: computeDeadlineStats(todoistWithCarried),
      },
    });
  } catch (err) {
    console.error("[Calendar] deadlines fetch failed:", err);
    res.status(500).json({ message: "Failed to fetch calendar deadlines" });
  }
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 62;

router.get("/range", async (req, res) => {
  const { start, end } = req.query;

  if (!start) return res.status(400).json({ message: "start param required (YYYY-MM-DD)" });
  if (!end) return res.status(400).json({ message: "end param required (YYYY-MM-DD)" });
  if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) {
    return res.status(400).json({ message: "start/end must be YYYY-MM-DD" });
  }

  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ message: "invalid date value" });
  }
  if (endDate < startDate) {
    return res.status(400).json({ message: "end must be >= start" });
  }
  const spanDays = Math.round((endDate - startDate) / 86400000);
  if (spanDays > MAX_SPAN_DAYS) {
    return res.status(400).json({ message: `span must be <= ${MAX_SPAN_DAYS} days` });
  }

  try {
    const userId = process.env.EA_USER_ID;
    const { accounts } = await loadUserConfig(userId);
    const calendarAccounts = accounts.filter(
      (a) => a.type === "gmail" && a.calendar_enabled,
    );

    const { dayStart } = pacificDayBoundaries(startDate);
    const { dayEnd } = pacificDayBoundaries(endDate);

    const events = await fetchCalendar(calendarAccounts, {
      startDate: dayStart,
      endDate: dayEnd,
    });

    res.json({ events, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[Calendar] range fetch failed:", err.message);
    res.status(500).json({ message: "Failed to fetch calendar range" });
  }
});

export default router;
