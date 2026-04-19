import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { generateBriefing, quickRefresh } from "../briefing/index.js";
import { completeTodoistTask, deleteTodoistTask, fetchTodoistProjects, fetchTodoistLabels, createTodoistTask, updateTodoistTask } from "../briefing/todoist.js";
import { buildSnapshot } from "../briefing/tombstones.js";
import * as storedBriefingService from "../briefing/stored-briefing-service.js";
import { updateCTMEventStatus } from "../briefing/ctm.js";
import { generateEnrichedMock, generateMockHistory } from "../db/dev-fixture.js";
import { seedEmbeddings } from "../db/dev-seed-embeddings.js";
import { applyScenarios } from "../db/scenarios/index.js";

const router = Router();
router.use(requireAuth);

router.post("/generate", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    generateBriefing(userId).catch((err) =>
      console.error("[Briefing] Generation failed:", err.message),
    );

    await new Promise((r) => setTimeout(r, 100));
    const latest = await db.execute({
      sql: `SELECT id FROM ea_briefings WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      args: [userId],
    });

    res.json({ id: latest.rows[0]?.id, status: "generating" });
  } catch (err) {
    console.error("Error triggering briefing:", err);
    res.status(500).json({ message: "Failed to trigger briefing generation" });
  }
});

router.get("/in-progress", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: `SELECT id, progress FROM ea_briefings
            WHERE user_id = ? AND status = 'generating'
            ORDER BY id DESC LIMIT 1`,
      args: [userId],
    });
    if (!result.rows.length) return res.json({ generating: false });
    res.json({ generating: true, id: result.rows[0].id, progress: result.rows[0].progress });
  } catch (err) {
    console.error("[Briefing] Error checking generation status:", err.message);
    res.json({ generating: false });
  }
});

router.post("/refresh", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await quickRefresh(userId);
    result.briefingJson = await storedBriefingService.mergeAccountPrefs(result.briefingJson, userId);
    res.json(result);
  } catch (err) {
    console.error("Error refreshing briefing:", err);
    res.status(500).json({ message: "Failed to refresh briefing data" });
  }
});

router.get("/latest", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, briefing_json, generated_at, generation_time_ms
            FROM ea_briefings
            WHERE user_id = ? AND status = 'ready'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    });

    // ?mock=1 forces mock briefing in dev (useful when real briefings exist)
    // ?scenario=urgent-flags,noise-preview applies scenario overlays
    if (req.query.mock && process.env.NODE_ENV !== "production") {
      seedEmbeddings().catch(err => console.warn("[EA] Dev embedding seed failed:", err.message));
      const mock = await generateEnrichedMock(userId);
      const scenarioKeys = req.query.scenario ? req.query.scenario.split(",").map(s => s.trim()) : [];
      applyScenarios(mock, scenarioKeys);
      return res.json({ id: 0, status: "ready", briefing: mock, generated_at: new Date().toISOString(), generation_time_ms: 0 });
    }

    if (!result.rows.length) {
      // In dev, return a dynamic mock briefing so the UI is always usable
      if (process.env.NODE_ENV !== "production") {
        seedEmbeddings().catch(err => console.warn("[EA] Dev embedding seed failed:", err.message));
        const mock = await generateEnrichedMock(userId);
        const scenarioKeys = req.query.scenario ? req.query.scenario.split(",").map(s => s.trim()) : [];
        applyScenarios(mock, scenarioKeys);
        return res.json({ id: 0, status: "ready", briefing: mock, generated_at: new Date().toISOString(), generation_time_ms: 0 });
      }
      return res.json({ briefing: null });
    }

    const row = result.rows[0];
    const briefing = await storedBriefingService.mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
    res.json({
      id: row.id,
      status: row.status,
      briefing,
      generated_at: row.generated_at,
      generation_time_ms: row.generation_time_ms,
    });
  } catch (err) {
    console.error("Error fetching latest briefing:", err);
    res.status(500).json({ message: "Failed to fetch latest briefing" });
  }
});

router.get("/history", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, generated_at, generation_time_ms, error_message,
            json_extract(briefing_json, '$.skippedAI') as skipped_ai
            FROM ea_briefings WHERE user_id = ?
            ORDER BY generated_at DESC LIMIT 20`,
      args: [userId],
    });
    if (!result.rows.length && process.env.NODE_ENV !== "production") {
      return res.json(generateMockHistory());
    }
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching briefing history:", err);
    res.status(500).json({ message: "Failed to fetch briefing history" });
  }
});

router.get("/status/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, error_message, generation_time_ms, progress
            FROM ea_briefings WHERE id = ? AND user_id = ?`,
      args: [id, userId],
    });
    if (!result.rows.length) return res.status(404).json({ message: "Briefing not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching briefing status:", err);
    res.status(500).json({ message: "Failed to fetch briefing status" });
  }
});

// --- Complete task (Todoist, Canvas/CTM, or manual CTM) ---
router.post("/complete-task/:taskId", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { taskId } = req.params;
  try {
    // Load latest briefing to identify the task
    const latest = await db.execute({
      sql: `SELECT id, briefing_json FROM ea_briefings
            WHERE user_id = ? AND status = 'ready'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    });
    const briefing = latest.rows.length ? JSON.parse(latest.rows[0].briefing_json) : null;

    // Find the task in CTM or Todoist lists. Skip tombstone rows — they
    // share the id with their live next-occurrence for recurring tasks,
    // and letting find() return one here would close the ghost row.
    const ctmTask = briefing?.ctm?.upcoming?.find(t => String(t.id) === taskId || t.todoist_id === taskId);
    const todoistTask = briefing?.todoist?.upcoming?.find(t => !t._tombstone && t.id === taskId);

    const todoistId = ctmTask?.todoist_id || (todoistTask ? taskId : null);
    const isRecurringTodoist = !!(todoistTask && todoistTask.is_recurring && !ctmTask);
    const isTodoistOnly = !!todoistTask && !ctmTask;

    if (todoistId) {
      // Close must succeed before we persist local completion state —
      // swallowing failures silently caused the "marked complete, then
      // refresh flips back to incomplete" bug.
      try {
        await completeTodoistTask(userId, todoistId);
      } catch (err) {
        console.error("[Briefing] Todoist completion failed:", err.message);
        return res.status(502).json({
          message: `Todoist close failed: ${err.message}`,
        });
      }
      if (isRecurringTodoist) {
        // Tombstone snapshot keeps the previous occurrence visible after
        // Todoist advances the task to the next due_date.
        await db.execute({
          sql: `INSERT OR REPLACE INTO ea_completed_tasks
                (user_id, todoist_id, completed_at, due_date, snapshot_json)
                VALUES (?, ?, datetime('now'), ?, ?)`,
          args: [userId, todoistId, todoistTask.due_date, JSON.stringify(buildSnapshot(todoistTask))],
        });
      } else {
        // Legacy dedupe row (due_date NULL). Used by loadCompletedTaskIds
        // reconciliation for CTM-linked completions during propagation.
        await db.execute({
          sql: "INSERT OR IGNORE INTO ea_completed_tasks (user_id, todoist_id) VALUES (?, ?)",
          args: [userId, todoistId],
        });
      }
    }
    if (ctmTask) {
      await updateCTMEventStatus(ctmTask.id, "complete").catch(err =>
        console.error("[Briefing] CTM status update failed:", err.message)
      );
    }

    await storedBriefingService.applyTaskCompletion(userId, {
      taskId,
      isRecurringTodoist,
      isTodoistOnly,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error completing task:", err);
    res.status(500).json({ message: err.message || "Failed to complete task" });
  }
});

// Dismiss a tombstone (local-only ghost row for a recurring Todoist completion).
// Guarded by due_date IS NOT NULL so a legacy dedupe row can never be removed here.
router.delete("/tombstone/:todoistId", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { todoistId } = req.params;
  try {
    await db.execute({
      sql: "DELETE FROM ea_completed_tasks WHERE user_id = ? AND todoist_id = ? AND due_date IS NOT NULL",
      args: [userId, todoistId],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error dismissing tombstone:", err);
    res.status(500).json({ message: "Failed to dismiss tombstone" });
  }
});

// --- Update CTM task status ---
router.patch("/task-status/:taskId", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { taskId } = req.params;
  const { status } = req.body;

  if (!["incomplete", "in_progress", "complete"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    // Update CTM
    await updateCTMEventStatus(Number(taskId), status);

    // If completing, also close in Todoist if linked
    if (status === "complete") {
      const latest = await db.execute({
        sql: `SELECT id, briefing_json FROM ea_briefings
              WHERE user_id = ? AND status = 'ready'
              ORDER BY generated_at DESC LIMIT 1`,
        args: [userId],
      });
      if (latest.rows.length) {
        const briefing = JSON.parse(latest.rows[0].briefing_json);
        const ctmTask = briefing.ctm?.upcoming?.find(t => String(t.id) === taskId);
        if (ctmTask?.todoist_id) {
          await completeTodoistTask(userId, ctmTask.todoist_id).catch(err =>
            console.error("[Briefing] Todoist completion failed:", err.message)
          );
          await db.execute({
            sql: "INSERT OR IGNORE INTO ea_completed_tasks (user_id, todoist_id) VALUES (?, ?)",
            args: [userId, ctmTask.todoist_id],
          });
        }
      }
      await storedBriefingService.applyCTMCompletionAfterTodoistClose(userId, taskId);
    } else {
      await storedBriefingService.applyCTMStatusChange(userId, taskId, status);
    }

    res.json({ ok: true, status });
  } catch (err) {
    console.error("Error updating task status:", err);
    res.status(500).json({ message: err.message || "Failed to update task status" });
  }
});

router.delete("/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: "DELETE FROM ea_briefings WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (!result.rowsAffected) return res.status(404).json({ message: "Briefing not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting briefing:", err);
    res.status(500).json({ message: "Failed to delete briefing" });
  }
});

router.get("/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, briefing_json, generated_at, generation_time_ms
            FROM ea_briefings WHERE id = ? AND user_id = ? AND status = 'ready'`,
      args: [id, userId],
    });
    if (!result.rows.length) {
      if (process.env.NODE_ENV !== "production") {
        const mockHistory = generateMockHistory();
        const match = mockHistory.find(h => h.id === Number(id));
        if (match) {
          const mock = await generateEnrichedMock(userId);
          return res.json({ id: match.id, status: "ready", briefing: mock, generated_at: match.generated_at, generation_time_ms: match.generation_time_ms });
        }
      }
      return res.status(404).json({ message: "Briefing not found" });
    }
    const row = result.rows[0];
    const briefing = await storedBriefingService.mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
    res.json({
      id: row.id, status: row.status, briefing,
      generated_at: row.generated_at, generation_time_ms: row.generation_time_ms,
    });
  } catch (err) {
    console.error("Error fetching briefing by ID:", err);
    res.status(500).json({ message: "Failed to fetch briefing" });
  }
});

// Todoist
router.get("/todoist/projects", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await fetchTodoistProjects(userId));
  } catch (err) {
    console.error("Error fetching Todoist projects:", err.message);
    res.status(400).json({ message: err.message });
  }
});

router.get("/todoist/labels", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await fetchTodoistLabels(userId));
  } catch (err) {
    console.error("Error fetching Todoist labels:", err.message);
    res.status(400).json({ message: err.message });
  }
});

router.post("/todoist/tasks", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const task = await createTodoistTask(userId, req.body);
    await storedBriefingService.upsertTodoistTask(userId, task, { replace: false });
    res.json(task);
  } catch (err) {
    console.error("Error creating Todoist task:", err.message);
    res.status(400).json({ message: err.message });
  }
});

router.post("/todoist/tasks/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const task = await updateTodoistTask(userId, req.params.id, req.body);
    await storedBriefingService.upsertTodoistTask(userId, task, { replace: true });
    res.json(task);
  } catch (err) {
    console.error("Error updating Todoist task:", err.message);
    res.status(400).json({ message: err.message });
  }
});

router.delete("/todoist/tasks/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    await deleteTodoistTask(userId, req.params.id);
    await storedBriefingService.removeTodoistTask(userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting Todoist task:", err.message);
    res.status(400).json({ message: err.message });
  }
});

export default router;
