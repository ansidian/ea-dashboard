import cron from "node-cron";
import db from "../db/connection.js";
import { loadUserConfig } from "./index.js";
import { wakeAtGmail } from "./gmail.js";

const CRON_EXPR = "*/5 * * * *"; // every 5 minutes
// Resurfaced rows live this long after wake before cleanup. Gives the client a
// window to surface them in the live/untriaged lane; after this they're gone
// and the email is just a normal unread in Gmail.
const RESURFACED_TTL_MS = 48 * 60 * 60 * 1000;

async function wakeDueSnoozes() {
  const userId = process.env.EA_USER_ID;
  if (!userId) return;

  const now = Date.now();
  const result = await db.execute({
    sql: "SELECT email_id, email_snapshot FROM ea_snoozed_emails WHERE user_id = ? AND status = 'snoozed' AND until_ts <= ?",
    args: [userId, now],
  });

  if (result.rows.length === 0) return;

  console.log(`[EA Snooze] Waking ${result.rows.length} snooze(s)`);
  const { accounts } = await loadUserConfig(userId);

  for (const row of result.rows) {
    const uid = row.email_id;
    let snap = null;
    if (row.email_snapshot) {
      try { snap = JSON.parse(row.email_snapshot); } catch { /* ignore */ }
    }
    try {
      const acc = accounts.find((a) => a.id === snap?.account_id || a.email === snap?.account_email);
      if (acc?.type === "gmail") {
        await wakeAtGmail(acc, uid);
      }
    } catch (err) {
      console.error(`[EA Snooze] Gmail wake-modify failed for uid=${uid}:`, err.message);
      // Continue to the status flip so we don't retry forever on a bad row.
      // The email is still in Gmail under the EA/Snoozed label — user can
      // clear it manually if it got stuck.
    }
    try {
      await db.execute({
        sql: "UPDATE ea_snoozed_emails SET status = 'resurfaced', resurfaced_at = ? WHERE user_id = ? AND email_id = ?",
        args: [now, userId, uid],
      });
    } catch (err) {
      console.error(`[EA Snooze] Status update failed for uid=${uid}:`, err.message);
    }
  }
}

async function cleanupResurfaced() {
  const userId = process.env.EA_USER_ID;
  if (!userId) return;
  const cutoff = Date.now() - RESURFACED_TTL_MS;
  try {
    const result = await db.execute({
      sql: "DELETE FROM ea_snoozed_emails WHERE user_id = ? AND status = 'resurfaced' AND resurfaced_at < ?",
      args: [userId, cutoff],
    });
    if (result.rowsAffected > 0) {
      console.log(`[EA Snooze] Cleaned up ${result.rowsAffected} resurfaced row(s)`);
    }
  } catch (err) {
    console.error("[EA Snooze] Resurfaced cleanup failed:", err.message);
  }
}

export function startSnoozeWaker() {
  cron.schedule(CRON_EXPR, () => {
    wakeDueSnoozes()
      .catch((err) => console.error("[EA Snooze] Worker tick failed:", err.message))
      .finally(() => { cleanupResurfaced(); });
  });
  console.log("[EA Snooze] Waker started (every 5 minutes)");
}
