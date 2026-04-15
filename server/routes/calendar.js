import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { fetchCTMDeadlinesAll } from "../briefing/ctm.js";
import { fetchTodoistTasksAll } from "../briefing/todoist.js";
import {
  separateDeadlines,
  computeDeadlineStats,
  loadCompletedTaskIds,
} from "../briefing/index.js";

const router = Router();
router.use(requireAuth);

router.get("/deadlines", async (req, res) => {
  try {
    const userId = process.env.EA_USER_ID;

    const [ctmDeadlines, todoistTasks] = await Promise.all([
      fetchCTMDeadlinesAll().catch((err) => {
        console.error("[Calendar] CTM fetch failed:", err.message);
        return [];
      }),
      fetchTodoistTasksAll(userId).catch((err) => {
        console.error("[Calendar] Todoist fetch failed:", err.message);
        return [];
      }),
    ]);

    const completedIds = await loadCompletedTaskIds(userId, todoistTasks);
    const separated = separateDeadlines(ctmDeadlines, todoistTasks, completedIds);

    res.json({
      ctm: {
        upcoming: separated.ctm,
        stats: computeDeadlineStats(separated.ctm),
      },
      todoist: {
        upcoming: separated.todoist,
        stats: computeDeadlineStats(separated.todoist),
      },
    });
  } catch (err) {
    console.error("[Calendar] deadlines fetch failed:", err);
    res.status(500).json({ message: "Failed to fetch calendar deadlines" });
  }
});

export default router;
