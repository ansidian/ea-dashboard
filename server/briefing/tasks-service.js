import db from "../db/connection.js";
import {
  completeTodoistTask,
  deleteTodoistTask,
  fetchTodoistProjects,
  fetchTodoistLabels,
  createTodoistTask,
  updateTodoistTask,
} from "./todoist.js";
import { updateCTMEventStatus } from "./ctm.js";
import { buildSnapshot } from "./tombstones.js";
import * as storedBriefingService from "./stored-briefing-service.js";

export async function completeTask(userId, taskId) {
  const latest = await db.execute({
    sql: `SELECT id, briefing_json FROM ea_briefings
          WHERE user_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT 1`,
    args: [userId],
  });
  const briefing = latest.rows.length ? JSON.parse(latest.rows[0].briefing_json) : null;

  const ctmTask = briefing?.ctm?.upcoming?.find(
    (t) => String(t.id) === taskId || t.todoist_id === taskId,
  );
  const todoistTask = briefing?.todoist?.upcoming?.find(
    (t) => !t._tombstone && t.id === taskId,
  );

  const todoistId = ctmTask?.todoist_id || (todoistTask ? taskId : null);
  const isRecurringTodoist = !!(todoistTask && todoistTask.is_recurring && !ctmTask);
  const isTodoistOnly = !!todoistTask && !ctmTask;

  if (todoistId) {
    try {
      await completeTodoistTask(userId, todoistId);
    } catch (err) {
      const wrapped = new Error(`Todoist close failed: ${err.message}`);
      wrapped.status = 502;
      throw wrapped;
    }
    if (isRecurringTodoist) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO ea_completed_tasks
              (user_id, todoist_id, completed_at, due_date, snapshot_json)
              VALUES (?, ?, datetime('now'), ?, ?)`,
        args: [userId, todoistId, todoistTask.due_date, JSON.stringify(buildSnapshot(todoistTask))],
      });
    } else {
      await db.execute({
        sql: "INSERT OR IGNORE INTO ea_completed_tasks (user_id, todoist_id) VALUES (?, ?)",
        args: [userId, todoistId],
      });
    }
  }

  if (ctmTask) {
    await Promise.resolve(updateCTMEventStatus(ctmTask.id, "complete")).catch((err) =>
      console.error("[Briefing] CTM status update failed:", err.message),
    );
  }

  await storedBriefingService.applyTaskCompletion(userId, {
    taskId,
    isRecurringTodoist,
    isTodoistOnly,
  });
}

export async function updateCTMStatus(userId, taskId, status) {
  if (!["incomplete", "in_progress", "complete"].includes(status)) {
    const err = new Error("Invalid status");
    err.status = 400;
    throw err;
  }

  await updateCTMEventStatus(Number(taskId), status);

  if (status === "complete") {
    const latest = await db.execute({
      sql: `SELECT id, briefing_json FROM ea_briefings
            WHERE user_id = ? AND status = 'ready'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    });
    if (latest.rows.length) {
      const briefing = JSON.parse(latest.rows[0].briefing_json);
      const ctmTask = briefing.ctm?.upcoming?.find((t) => String(t.id) === taskId);
      if (ctmTask?.todoist_id) {
        await completeTodoistTask(userId, ctmTask.todoist_id).catch((err) =>
          console.error("[Briefing] Todoist completion failed:", err.message),
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
}

export async function dismissTombstone(userId, todoistId) {
  await db.execute({
    sql: "DELETE FROM ea_completed_tasks WHERE user_id = ? AND todoist_id = ? AND due_date IS NOT NULL",
    args: [userId, todoistId],
  });
}

export async function listProjects(userId) {
  return fetchTodoistProjects(userId);
}

export async function listLabels(userId) {
  return fetchTodoistLabels(userId);
}

export async function createTask(userId, body) {
  const task = await createTodoistTask(userId, body);
  await storedBriefingService.upsertTodoistTask(userId, task, { replace: false });
  return task;
}

export async function updateTask(userId, id, body) {
  const task = await updateTodoistTask(userId, id, body);
  await storedBriefingService.upsertTodoistTask(userId, task, { replace: true });
  return task;
}

export async function deleteTask(userId, id) {
  await deleteTodoistTask(userId, id);
  await storedBriefingService.removeTodoistTask(userId, id);
}
