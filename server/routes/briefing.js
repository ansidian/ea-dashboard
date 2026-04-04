import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { generateBriefing, quickRefresh } from "../briefing/index.js";
import { fetchEmailBody as fetchGmailBody, markAsRead as gmailMarkAsRead, trashMessage as gmailTrash, batchMarkAsRead as gmailBatchMarkAsRead } from "../briefing/gmail.js";
import { fetchEmailBody as fetchIcloudBody, markAsRead as icloudMarkAsRead, trashMessage as icloudTrash, batchMarkAsRead as icloudBatchMarkAsRead } from "../briefing/icloud.js";
import { decrypt } from "../briefing/encryption.js";
import { sendBill, getAccounts as getActualAccounts, getCategories as getActualCategories, getPayees as getActualPayees, getMetadata as getActualMetadata, testConnection as testActual } from "../briefing/actual.js";
import { completeTodoistTask } from "../briefing/todoist.js";
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
  } catch {
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
      sql: `SELECT id, status, generated_at, generation_time_ms, error_message
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
    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking email as read:", err);
    res.status(500).json({ message: "Failed to mark email as read" });
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
    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking all emails as read:", err);
    res.status(500).json({ message: "Failed to mark all emails as read" });
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
  try {
    res.json(await testActual(userId));
  } catch (err) {
    console.error("Actual Budget test failed:", err.message);
    res.status(400).json({ message: err.message || "Connection failed" });
  }
});

export default router;
