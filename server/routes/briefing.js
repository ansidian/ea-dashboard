import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { generateBriefing, quickRefresh, loadUserConfig, fetchAllEmails } from "../briefing/index.js";
import { indexEmails } from "../briefing/email-index.js";
import {
  fetchEmailBody as fetchGmailBody,
  markAsRead as gmailMarkAsRead,
  markAsUnread as gmailMarkAsUnread,
  trashMessage as gmailTrash,
  batchMarkAsRead as gmailBatchMarkAsRead,
  archiveMessage as gmailArchive,
  unarchiveMessage as gmailUnarchive,
} from "../briefing/gmail.js";
import { fetchEmailBody as fetchIcloudBody, markAsRead as icloudMarkAsRead, markAsUnread as icloudMarkAsUnread, trashMessage as icloudTrash, batchMarkAsRead as icloudBatchMarkAsRead } from "../briefing/icloud.js";
import { decrypt } from "../briefing/encryption.js";
import { sendBill, markBillPaid, getAccounts as getActualAccounts, getCategories as getActualCategories, getPayees as getActualPayees, getMetadata as getActualMetadata, testConnection as testActual, createQuickTxn } from "../briefing/actual.js";
import { trimBillBody } from "../briefing/bill-extract.js";
import { completeTodoistTask, fetchTodoistProjects, fetchTodoistLabels, createTodoistTask, updateTodoistTask } from "../briefing/todoist.js";
import { updateCTMEventStatus } from "../briefing/ctm.js";
import { generateEnrichedMock, generateMockHistory } from "../db/dev-fixture.js";
import { seedEmbeddings } from "../db/dev-seed-embeddings.js";
import { applyScenarios, listScenarios } from "../db/scenarios/index.js";

const router = Router();
router.use(requireAuth);

// List available dev scenarios (dev only)
router.get("/scenarios", (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).json({ message: "Not found" });
  res.json(listScenarios());
});

// Reindex emails without generating a briefing (dev only — no Claude call)
router.post("/dev-reindex-emails", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).json({ message: "Not found" });
  const userId = process.env.EA_USER_ID;
  const hoursBack = Math.min(parseInt(req.query.hours) || 720, 2160);
  try {
    const { accounts, settings } = await loadUserConfig(userId);
    const emails = await fetchAllEmails(accounts, settings, hoursBack);
    await indexEmails(userId, emails);
    res.json({ indexed: emails.length, hoursBack });
  } catch (err) {
    console.error("[EA] Dev reindex failed:", err);
    res.status(500).json({ message: err.message });
  }
});

// Merge current account display preferences (label, color, icon) into a briefing object.
// This ensures user changes are reflected immediately without regenerating.
async function mergeAccountPrefs(briefing, userId) {
  if (!briefing?.emails?.accounts?.length) return briefing;
  const result = await db.execute({
    sql: "SELECT id, email, label, color, icon FROM ea_accounts WHERE user_id = ?",
    args: [userId],
  });
  const byEmail = new Map(result.rows.map(a => [a.email, a]));
  const byLabel = new Map(result.rows.map(a => [a.label, a]));
  for (const acc of briefing.emails.accounts) {
    const dbAcc = byLabel.get(acc.name) || byEmail.get(acc.name);
    if (dbAcc) {
      acc.name = dbAcc.label;
      acc.color = dbAcc.color || acc.color;
      acc.icon = dbAcc.icon || acc.icon;
    }
  }
  return briefing;
}

// Persist read status into the stored briefing so reloads reflect it
async function markEmailsReadInIndex(userId, uids) {
  const list = Array.isArray(uids) ? uids : [uids];
  if (!list.length) return;
  const placeholders = list.map(() => "?").join(",");
  await db.execute({
    sql: `UPDATE ea_email_index SET read = 1 WHERE user_id = ? AND uid IN (${placeholders})`,
    args: [userId, ...list],
  });
}

async function markEmailsReadInBriefing(userId, uids) {
  const uidSet = new Set(Array.isArray(uids) ? uids : [uids]);
  const latest = await db.execute({
    sql: `SELECT id, briefing_json FROM ea_briefings
          WHERE user_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT 1`,
    args: [userId],
  });
  if (!latest.rows.length) return;
  const briefing = JSON.parse(latest.rows[0].briefing_json);
  let changed = false;
  for (const acct of briefing.emails?.accounts || []) {
    for (const email of acct.important) {
      if ((uidSet.has(email.id) || uidSet.has(email.uid)) && !email.read) {
        email.read = true;
        changed = true;
      }
    }
  }
  if (changed) {
    await db.execute({
      sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
      args: [JSON.stringify(briefing), latest.rows[0].id],
    });
  }
}

async function markEmailsUnreadInIndex(userId, uids) {
  const list = Array.isArray(uids) ? uids : [uids];
  if (!list.length) return;
  const placeholders = list.map(() => "?").join(",");
  await db.execute({
    sql: `UPDATE ea_email_index SET read = 0 WHERE user_id = ? AND uid IN (${placeholders})`,
    args: [userId, ...list],
  });
}

async function markEmailsUnreadInBriefing(userId, uids) {
  const uidSet = new Set(Array.isArray(uids) ? uids : [uids]);
  const latest = await db.execute({
    sql: `SELECT id, briefing_json FROM ea_briefings
          WHERE user_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT 1`,
    args: [userId],
  });
  if (!latest.rows.length) return;
  const briefing = JSON.parse(latest.rows[0].briefing_json);
  let changed = false;
  for (const acct of briefing.emails?.accounts || []) {
    for (const email of acct.important) {
      if ((uidSet.has(email.id) || uidSet.has(email.uid)) && email.read) {
        email.read = false;
        changed = true;
      }
    }
  }
  if (changed) {
    await db.execute({
      sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
      args: [JSON.stringify(briefing), latest.rows[0].id],
    });
  }
}

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
    result.briefingJson = await mergeAccountPrefs(result.briefingJson, userId);
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
    const briefing = await mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
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

router.get("/email/:uid", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  try {
    if (uid.startsWith("icloud-")) {
      const accounts = await db.execute({
        sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND type = 'icloud'",
        args: [userId],
      });
      if (!accounts.rows.length) return res.status(404).json({ message: "No iCloud account found" });
      const account = accounts.rows[0];
      const password = decrypt(account.credentials_encrypted);
      return res.json(await fetchIcloudBody(account.email, password, uid));
    } else if (uid.startsWith("gmail-")) {
      // UID format: gmail-{accountId}-{messageId} where accountId is "gmail-{email}"
      // Account ID contains dashes/@ so we can't split naively — match by prefix instead
      const accounts = await db.execute({
        sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND type = 'gmail'",
        args: [userId],
      });
      const account = accounts.rows.find(a => uid.startsWith(`gmail-${a.id}-`));
      if (!account) return res.status(404).json({ message: "Gmail account not found" });
      return res.json(await fetchGmailBody(account, uid));
    } else {
      return res.status(400).json({ message: "Unknown email uid format" });
    }
  } catch (err) {
    console.error("Error fetching email body:", err);
    res.status(500).json({ message: "Failed to fetch email body" });
  }
});

router.post("/dismiss/:emailId", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const emailId = req.params.emailId;
  try {
    // Persist dismiss for future generations
    await db.execute({
      sql: "INSERT OR IGNORE INTO ea_dismissed_emails (user_id, email_id) VALUES (?, ?)",
      args: [userId, emailId],
    });

    // Also remove from the latest stored briefing so refreshes don't bring it back
    const latest = await db.execute({
      sql: `SELECT id, briefing_json FROM ea_briefings
            WHERE user_id = ? AND status = 'ready'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    });
    if (latest.rows.length) {
      const briefing = JSON.parse(latest.rows[0].briefing_json);
      let changed = false;
      for (const acct of briefing.emails?.accounts || []) {
        const before = acct.important.length;
        acct.important = acct.important.filter(e => e.id !== emailId);
        if (acct.important.length !== before) {
          acct.unread = acct.important.length;
          changed = true;
        }
      }
      if (changed) {
        await db.execute({
          sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
          args: [JSON.stringify(briefing), latest.rows[0].id],
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error dismissing email:", err);
    res.status(500).json({ message: "Failed to dismiss email" });
  }
});

// --- Pin email (sticky: keeps email visible across briefings + biases next triage) ---
router.post("/pin/:emailId", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const emailId = req.params.emailId;
  const snapshot = req.body?.snapshot ? JSON.stringify(req.body.snapshot) : null;
  try {
    await db.execute({
      sql: `INSERT INTO ea_pinned_emails (user_id, email_id, email_snapshot)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, email_id) DO UPDATE SET email_snapshot = excluded.email_snapshot`,
      args: [userId, emailId, snapshot],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error pinning email:", err);
    res.status(500).json({ message: "Failed to pin email" });
  }
});

router.delete("/pin/:emailId", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const emailId = req.params.emailId;
  try {
    await db.execute({
      sql: "DELETE FROM ea_pinned_emails WHERE user_id = ? AND email_id = ?",
      args: [userId, emailId],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error unpinning email:", err);
    res.status(500).json({ message: "Failed to unpin email" });
  }
});

// --- Snooze email until a specific timestamp ---
router.post("/email/:uid/snooze", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  const untilTs = Number(req.body?.until_ts);
  if (!Number.isFinite(untilTs) || untilTs <= Date.now()) {
    return res.status(400).json({ message: "until_ts must be a future epoch millisecond value" });
  }
  const snapshot = req.body?.snapshot ? JSON.stringify(req.body.snapshot) : null;
  try {
    await db.execute({
      sql: `INSERT INTO ea_snoozed_emails (user_id, email_id, until_ts, email_snapshot)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, email_id) DO UPDATE
              SET until_ts = excluded.until_ts, email_snapshot = excluded.email_snapshot`,
      args: [userId, uid, untilTs, snapshot],
    });

    // Best-effort: if this is a Gmail account, archive at the source so the
    // email disappears from Gmail's inbox too (not just the client). iCloud
    // accounts keep client-only snooze for now.
    const parsedSnap = req.body?.snapshot;
    const accountId = parsedSnap?.account_id;
    if (accountId) {
      try {
        const { accounts } = await loadUserConfig(userId);
        const acc = accounts.find((a) => a.id === accountId || a.email === parsedSnap?.account_email);
        if (acc?.type === "gmail") {
          await gmailArchive(acc, uid);
        }
      } catch (archiveErr) {
        console.error("[EA Snooze] Gmail archive failed, rolling back DB row:", archiveErr.message);
        try {
          await db.execute({
            sql: "DELETE FROM ea_snoozed_emails WHERE user_id = ? AND email_id = ?",
            args: [userId, uid],
          });
        } catch (rollbackErr) {
          console.error("[EA Snooze] Rollback DELETE failed:", rollbackErr.message);
        }
        return res.status(502).json({ message: "Failed to archive on Gmail" });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error snoozing email:", err);
    res.status(500).json({ message: "Failed to snooze email" });
  }
});

router.delete("/email/:uid/snooze", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  try {
    // Look up the account before deleting, so we still have the snapshot.
    const existing = await db.execute({
      sql: "SELECT email_snapshot FROM ea_snoozed_emails WHERE user_id = ? AND email_id = ?",
      args: [userId, uid],
    });
    let snap = null;
    if (existing.rows[0]?.email_snapshot) {
      try { snap = JSON.parse(existing.rows[0].email_snapshot); } catch { /* ignore */ }
    }

    await db.execute({
      sql: "DELETE FROM ea_snoozed_emails WHERE user_id = ? AND email_id = ?",
      args: [userId, uid],
    });

    if (snap?.account_id) {
      try {
        const { accounts } = await loadUserConfig(userId);
        const acc = accounts.find((a) => a.id === snap.account_id || a.email === snap.account_email);
        if (acc?.type === "gmail") await gmailUnarchive(acc, uid);
      } catch (unarchiveErr) {
        console.error("[EA Snooze] Gmail unarchive failed:", unarchiveErr.message);
        // Don't fail the request — the DB state is correct; user can manually
        // locate the email in Gmail's "All Mail".
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error unsnoozing email:", err);
    res.status(500).json({ message: "Failed to unsnooze email" });
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

    // Find the task in CTM or Todoist lists
    const ctmTask = briefing?.ctm?.upcoming?.find(t => String(t.id) === taskId || t.todoist_id === taskId);
    const todoistTask = briefing?.todoist?.upcoming?.find(t => t.id === taskId);

    // Sync completions to external services
    const todoistId = ctmTask?.todoist_id || (todoistTask ? taskId : null);
    if (todoistId) {
      await completeTodoistTask(userId, todoistId).catch(err =>
        console.error("[Briefing] Todoist completion failed:", err.message)
      );
      await db.execute({
        sql: "INSERT OR IGNORE INTO ea_completed_tasks (user_id, todoist_id) VALUES (?, ?)",
        args: [userId, todoistId],
      });
    }
    if (ctmTask) {
      await updateCTMEventStatus(ctmTask.id, "complete").catch(err =>
        console.error("[Briefing] CTM status update failed:", err.message)
      );
    }

    // Remove from stored briefing
    if (briefing) {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });
      const today = fmt.format(new Date());
      const weekFromNow = fmt.format(new Date(Date.now() + 7 * 86400000));
      let changed = false;

      for (const section of ["ctm", "todoist"]) {
        if (!briefing[section]?.upcoming) continue;
        const before = briefing[section].upcoming.length;
        briefing[section].upcoming = briefing[section].upcoming.filter(
          t => String(t.id) !== taskId && t.todoist_id !== taskId
        );
        if (briefing[section].upcoming.length !== before) {
          let totalPoints = 0, dueToday = 0, dueThisWeek = 0;
          for (const d of briefing[section].upcoming) {
            if (d.due_date === today) dueToday++;
            if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
            if (d.points_possible) totalPoints += d.points_possible;
          }
          briefing[section].stats = { incomplete: briefing[section].upcoming.length, dueToday, dueThisWeek, totalPoints };
          changed = true;
        }
      }

      if (changed) {
        await db.execute({
          sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
          args: [JSON.stringify(briefing), latest.rows[0].id],
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error completing task:", err);
    res.status(500).json({ message: err.message || "Failed to complete task" });
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

        // Remove completed task from briefing
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });
        const today = fmt.format(new Date());
        const weekFromNow = fmt.format(new Date(Date.now() + 7 * 86400000));
        briefing.ctm.upcoming = briefing.ctm.upcoming.filter(t => String(t.id) !== taskId);
        let totalPoints = 0, dueToday = 0, dueThisWeek = 0;
        for (const d of briefing.ctm.upcoming) {
          if (d.due_date === today) dueToday++;
          if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
          if (d.points_possible) totalPoints += d.points_possible;
        }
        briefing.ctm.stats = { incomplete: briefing.ctm.upcoming.length, dueToday, dueThisWeek, totalPoints };
        await db.execute({
          sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
          args: [JSON.stringify(briefing), latest.rows[0].id],
        });
      }
    } else {
      // Status change (not complete) — update in-place in briefing
      const latest = await db.execute({
        sql: `SELECT id, briefing_json FROM ea_briefings
              WHERE user_id = ? AND status = 'ready'
              ORDER BY generated_at DESC LIMIT 1`,
        args: [userId],
      });
      if (latest.rows.length) {
        const briefing = JSON.parse(latest.rows[0].briefing_json);
        const task = briefing.ctm?.upcoming?.find(t => String(t.id) === taskId);
        if (task) {
          task.status = status;
          await db.execute({
            sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
            args: [JSON.stringify(briefing), latest.rows[0].id],
          });
        }
      }
    }

    res.json({ ok: true, status });
  } catch (err) {
    console.error("Error updating task status:", err);
    res.status(500).json({ message: err.message || "Failed to update task status" });
  }
});

// Look up email account by UID prefix
async function findAccountByUid(userId, uid) {
  if (uid.startsWith("icloud-")) {
    const result = await db.execute({
      sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND type = 'icloud'",
      args: [userId],
    });
    if (!result.rows.length) return null;
    return { type: "icloud", account: result.rows[0] };
  }
  if (uid.startsWith("gmail-")) {
    const result = await db.execute({
      sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND type = 'gmail'",
      args: [userId],
    });
    const account = result.rows.find(a => uid.startsWith(`gmail-${a.id}-`));
    if (!account) return null;
    return { type: "gmail", account };
  }
  return null;
}

router.post("/email/:uid/mark-read", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  try {
    const found = await findAccountByUid(userId, uid);
    if (!found) return res.status(404).json({ message: "Account not found" });

    if (found.type === "icloud") {
      const password = decrypt(found.account.credentials_encrypted);
      await icloudMarkAsRead(found.account.email, password, uid);
    } else {
      await gmailMarkAsRead(found.account, uid);
    }
    await markEmailsReadInBriefing(userId, uid);
    await markEmailsReadInIndex(userId, uid);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking email as read:", err);
    res.status(500).json({ message: "Failed to mark email as read" });
  }
});

router.post("/email/:uid/mark-unread", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  try {
    const found = await findAccountByUid(userId, uid);
    if (!found) return res.status(404).json({ message: "Account not found" });

    if (found.type === "icloud") {
      const password = decrypt(found.account.credentials_encrypted);
      await icloudMarkAsUnread(found.account.email, password, uid);
    } else {
      await gmailMarkAsUnread(found.account, uid);
    }
    await markEmailsUnreadInBriefing(userId, uid);
    await markEmailsUnreadInIndex(userId, uid);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking email as unread:", err);
    res.status(500).json({ message: "Failed to mark email as unread" });
  }
});

router.post("/email/:uid/trash", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  try {
    const found = await findAccountByUid(userId, uid);
    if (!found) return res.status(404).json({ message: "Account not found" });

    if (found.type === "icloud") {
      const password = decrypt(found.account.credentials_encrypted);
      await icloudTrash(found.account.email, password, uid);
    } else {
      await gmailTrash(found.account, uid);
    }
    // Trash supersedes pin/snooze — clear any stale state so zombie rows don't
    // reappear after a briefing roll or snooze wake.
    await Promise.all([
      db.execute({
        sql: "DELETE FROM ea_pinned_emails WHERE user_id = ? AND email_id = ?",
        args: [userId, uid],
      }),
      db.execute({
        sql: "DELETE FROM ea_snoozed_emails WHERE user_id = ? AND email_id = ?",
        args: [userId, uid],
      }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error trashing email:", err);
    res.status(500).json({ message: "Failed to trash email" });
  }
});

router.post("/email/mark-all-read", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uids } = req.body;
  if (!Array.isArray(uids) || !uids.length) return res.status(400).json({ message: "uids array required" });
  try {
    // Group UIDs by account type
    const gmailUids = new Map(); // accountId → [uids]
    const icloudUids = [];

    const accounts = await db.execute({
      sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND (type = 'gmail' OR type = 'icloud')",
      args: [userId],
    });

    for (const uid of uids) {
      if (uid.startsWith("icloud-")) {
        icloudUids.push(uid);
      } else if (uid.startsWith("gmail-")) {
        const account = accounts.rows.find(a => a.type === "gmail" && uid.startsWith(`gmail-${a.id}-`));
        if (account) {
          if (!gmailUids.has(account.id)) gmailUids.set(account.id, { account, uids: [] });
          gmailUids.get(account.id).uids.push(uid);
        }
      }
    }

    const ops = [];

    for (const { account, uids: accUids } of gmailUids.values()) {
      ops.push(gmailBatchMarkAsRead(account, accUids));
    }

    if (icloudUids.length) {
      const icloudAccount = accounts.rows.find(a => a.type === "icloud");
      if (icloudAccount) {
        const password = decrypt(icloudAccount.credentials_encrypted);
        ops.push(icloudBatchMarkAsRead(icloudAccount.email, password, icloudUids));
      }
    }

    await Promise.all(ops);
    await markEmailsReadInBriefing(userId, uids);
    await markEmailsReadInIndex(userId, uids);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking all emails as read:", err);
    res.status(500).json({ message: "Failed to mark all emails as read" });
  }
});

// --- Email search (FTS5) ---

// Build a Gmail web URL from our uid format `gmail-{accountId}-{messageId}`
// where accountId is `gmail-{email}`. Returns null for non-Gmail.
function buildEmailWebUrl(uid, accountId, accountEmail) {
  if (!uid?.startsWith("gmail-")) return null;
  const prefix = `gmail-${accountId}-`;
  if (!uid.startsWith(prefix)) return null;
  const messageId = uid.slice(prefix.length);
  if (!messageId) return null;
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${messageId}`;
}

function sanitizeFtsQuery(raw) {
  const terms = raw
    .replace(/[\u201C\u201D]/g, '"')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t.replace(/"/g, '""')}"`)
  // prefix-match on last term for type-ahead
  if (terms.length > 0) {
    const last = terms[terms.length - 1];
    terms[terms.length - 1] = last.slice(0, -1) + '"*';
  }
  return terms.join(" ") || `"${raw}"`;
}

router.get("/email-search", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { q, limit } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ message: "Query parameter 'q' is required" });
  }
  const maxResults = Math.min(parseInt(limit) || 30, 100);
  try {
    // Pull a wider window than maxResults so we can re-rank in JS using a
    // hybrid score that combines BM25 rank with a recency penalty. We can't
    // do this purely in SQL because email_date is stored as an RFC 2822
    // string, which SQLite's julianday() can't parse.
    const fetchLimit = Math.max(maxResults * 3, 90);
    const result = await db.execute({
      sql: `SELECT
              idx.uid, idx.account_id, idx.account_label, idx.account_email,
              idx.account_color, idx.account_icon,
              idx.from_name, idx.from_address, idx.subject, idx.body_snippet,
              idx.email_date, idx.read,
              snippet(ea_email_fts, 3, '<mark>', '</mark>', '...', 32) AS subject_highlight,
              snippet(ea_email_fts, 5, '<mark>', '</mark>', '...', 48) AS body_highlight,
              rank
            FROM ea_email_fts
            JOIN ea_email_index idx ON idx.uid = ea_email_fts.uid
            WHERE ea_email_fts MATCH ? AND idx.user_id = ?
            ORDER BY rank
            LIMIT ?`,
      args: [sanitizeFtsQuery(q.trim()), userId, fetchLimit],
    });

    // Hybrid re-rank: rank / (1 + age_days / 30). Rank is negative, so
    // dividing by a value > 1 makes it less negative (worse). Recent matches
    // keep their raw strength; old matches sink. If the date is unparseable,
    // we treat the email as "now" so it isn't penalized.
    const nowMs = Date.now();
    const RECENCY_HALF_LIFE_DAYS = 30;
    const scored = result.rows.map((row) => {
      const t = row.email_date ? Date.parse(row.email_date) : NaN;
      const ageDays = Number.isFinite(t) ? Math.max(0, (nowMs - t) / 86400000) : 0;
      const hybrid = row.rank / (1 + ageDays / RECENCY_HALF_LIFE_DAYS);
      return { row, hybrid };
    });
    scored.sort((a, b) => a.hybrid - b.hybrid); // ascending: more negative first
    const ranked = scored.slice(0, maxResults).map((s) => s.row);
    result.rows = ranked;

    const byAccount = {};
    for (const row of result.rows) {
      const key = row.account_id;
      if (!byAccount[key]) {
        byAccount[key] = {
          account_id: row.account_id,
          account_label: row.account_label,
          account_email: row.account_email,
          account_color: row.account_color,
          account_icon: row.account_icon,
          results: [],
        };
      }
      byAccount[key].results.push({
        uid: row.uid,
        from_name: row.from_name,
        from_address: row.from_address,
        subject: row.subject,
        body_snippet: row.body_snippet,
        subject_highlight: row.subject_highlight,
        body_highlight: row.body_highlight,
        email_date: row.email_date,
        read: !!row.read,
        web_url: buildEmailWebUrl(row.uid, row.account_id, row.account_email),
      });
    }

    res.json({
      accounts: Object.values(byAccount),
      total: result.rows.length,
      query: q,
    });
  } catch (err) {
    console.error("[EA] Email search error:", err.message);
    res.status(500).json({ message: "Email search failed" });
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
    const briefing = await mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
    res.json({
      id: row.id, status: row.status, briefing,
      generated_at: row.generated_at, generation_time_ms: row.generation_time_ms,
    });
  } catch (err) {
    console.error("Error fetching briefing by ID:", err);
    res.status(500).json({ message: "Failed to fetch briefing" });
  }
});

router.post("/actual/send", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const billData = req.body;
  if (!billData?.payee || !billData?.amount || !billData?.type) {
    return res.status(400).json({ message: "payee, amount, and type are required" });
  }
  try {
    res.json(await sendBill(billData, userId));
  } catch (err) {
    console.error("Error sending to Actual Budget:", err);
    res.status(500).json({ message: err.message });
  }
});

// One-shot transaction endpoint for mobile shortcuts (Tap-to-Pay).
// Designed to mirror ActualTap's payload shape so shortcut templates translate 1:1.
router.post("/actual/quick-txn", async (req, res) => {
  if (req.apiToken && !req.apiToken.scopes.includes("actual:write")) {
    return res.status(403).json({ message: "Token lacks actual:write scope" });
  }
  const userId = process.env.EA_USER_ID;
  const { account, amount, payee, type, date, notes, category } = req.body || {};
  if (!account || amount == null || !payee) {
    return res.status(400).json({ message: "account, amount, and payee are required" });
  }
  try {
    const result = await createQuickTxn(userId, {
      accountName: account,
      amount: Number(amount),
      payee: String(payee),
      type: type === "deposit" ? "deposit" : "payment",
      date,
      notes,
      categoryName: category || null,
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[EA] quick-txn error:", err);
    res.status(status).json({ message: err.message });
  }
});

router.post("/bills/extract", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { subject, from, body } = req.body || {};
  if (!body || typeof body !== "string") {
    return res.status(400).json({ message: "body is required" });
  }
  try {
    const [categories, accounts] = await Promise.all([
      getActualCategories(userId).catch(() => []),
      getActualAccounts(userId).catch(() => []),
    ]);

    // Build ephemeral code → real id maps. Haiku sees short codes (c1, a1) instead
    // of full UUIDs to slash prompt tokens; server translates codes back before reply.
    const catCodeToId = new Map();
    const catList = [];
    if (Array.isArray(categories)) {
      let i = 1;
      for (const group of categories) {
        for (const c of group.categories || []) {
          const code = `c${i++}`;
          catCodeToId.set(code, c.id);
          catList.push(`${code}:${c.name}`);
        }
      }
    }
    const acctCodeToId = new Map();
    const acctList = [];
    if (Array.isArray(accounts)) {
      let i = 1;
      for (const a of accounts) {
        const code = `a${i++}`;
        acctCodeToId.set(code, a.id);
        acctList.push(`${code}:${a.name}`);
      }
    }

    const trimmed = trimBillBody({ subject, from, body });
    const systemPrompt = `Extract bill fields from an email. Return submit_bill with:
- payee, amount (0 if missing), due_date (YYYY-MM-DD)
- type: "transfer" (credit card payment), "bill" (recurring), "expense" (one-off), "income"
- category_code: closest category's code (c1, c2, ...) if confident, else null
- category_name: the category's display name (copied from the list)
- to_account_code: ONLY for type=transfer, code (a1, a2, ...) of the credit card being paid. Match on Visa/MC/Amex or last-4 digits. Null if unsure.${catList.length ? `\n\nCategories: ${catList.join(", ")}` : ""}${acctList.length ? `\n\nAccounts: ${acctList.join(", ")}` : ""}`;

    const tool = {
      name: "submit_bill",
      description: "Submit extracted bill fields.",
      input_schema: {
        type: "object",
        properties: {
          payee: { type: "string" },
          amount: { type: "number" },
          due_date: { type: "string" },
          type: { type: "string", enum: ["transfer", "bill", "expense", "income"] },
          category_code: { type: ["string", "null"] },
          category_name: { type: ["string", "null"] },
          to_account_code: { type: ["string", "null"] },
        },
        required: ["payee", "amount", "due_date", "type"],
      },
    };

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        system: systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "submit_bill" },
        messages: [{ role: "user", content: trimmed }],
      }),
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      console.error(`[EA] Bill extract Haiku error (${apiRes.status}):`, text);
      return res.status(502).json({ message: `Haiku API error (${apiRes.status})` });
    }

    const data = await apiRes.json();
    const toolBlock = (data.content || []).find(c => c.type === "tool_use" && c.name === "submit_bill");
    if (!toolBlock?.input) {
      console.error("[EA] Bill extract: no tool_use in Haiku response", data);
      return res.status(502).json({ message: "Extraction failed" });
    }

    const usage = data.usage || {};
    console.log(`[EA] Bill extract: in=${usage.input_tokens} out=${usage.output_tokens} trimmed_chars=${trimmed.length}`);

    const input = toolBlock.input;
    const resolved = {
      payee: input.payee,
      amount: input.amount,
      due_date: input.due_date,
      type: input.type,
      category_id: input.category_code ? catCodeToId.get(input.category_code) || null : null,
      category_name: input.category_name || null,
      to_account_id: input.to_account_code ? acctCodeToId.get(input.to_account_code) || null : null,
    };
    res.json(resolved);
  } catch (err) {
    console.error("Error extracting bill:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/actual/bills/:id/mark-paid", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await markBillPaid(req.params.id, userId));
  } catch (err) {
    console.error("Error marking bill paid:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/actual/metadata", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await getActualMetadata(userId));
  } catch (err) {
    console.error("Error fetching Actual Budget metadata:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/actual/accounts", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await getActualAccounts(userId));
  } catch (err) {
    console.error("Error fetching Actual Budget accounts:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/actual/payees", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await getActualPayees(userId));
  } catch (err) {
    console.error("Error fetching Actual Budget payees:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/actual/categories", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await getActualCategories(userId));
  } catch (err) {
    console.error("Error fetching Actual Budget categories:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/actual/test", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { serverURL, password, syncId } = req.body || {};
  const overrides = serverURL && syncId ? { serverURL, password, syncId } : null;
  try {
    res.json(await testActual(userId, overrides));
  } catch (err) {
    console.error("Actual Budget test failed:", err.message);
    res.status(400).json({ message: err.message || "Connection failed", success: false });
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
    res.json(task);
  } catch (err) {
    console.error("Error updating Todoist task:", err.message);
    res.status(400).json({ message: err.message });
  }
});

export default router;
