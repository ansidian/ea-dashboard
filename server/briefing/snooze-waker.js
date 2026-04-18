import cron from "node-cron";
import db from "../db/connection.js";
import { loadUserConfig } from "./index.js";
import { unarchiveMessage as gmailUnarchive } from "./gmail.js";

const CRON_EXPR = "*/5 * * * *"; // every 5 minutes

async function wakeDueSnoozes() {
  const userId = process.env.EA_USER_ID;
  if (!userId) return;

  const now = Date.now();
  const result = await db.execute({
    sql: "SELECT email_id, email_snapshot FROM ea_snoozed_emails WHERE user_id = ? AND until_ts <= ?",
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
        await gmailUnarchive(acc, uid);
      }
    } catch (err) {
      console.error(`[EA Snooze] Unarchive failed for uid=${uid}:`, err.message);
      // Continue to DELETE so we don't retry forever on a bad row; the email
      // is still in Gmail's "All Mail" and the user can find it manually.
    }
    try {
      await db.execute({
        sql: "DELETE FROM ea_snoozed_emails WHERE user_id = ? AND email_id = ?",
        args: [userId, uid],
      });
    } catch (err) {
      console.error(`[EA Snooze] Delete failed for uid=${uid}:`, err.message);
    }
  }
}

export function startSnoozeWaker() {
  cron.schedule(CRON_EXPR, () => {
    wakeDueSnoozes().catch((err) => {
      console.error("[EA Snooze] Worker tick failed:", err.message);
    });
  });
  console.log("[EA Snooze] Waker started (every 5 minutes)");
}
