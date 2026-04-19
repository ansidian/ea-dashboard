import cron from "node-cron";
import db from "../db/connection.js";
import { generateBriefing, loadUserConfig, fetchAllEmails } from "./index.js";
import { indexEmails } from "./email-index.js";

const activeJobs = [];
// Background indexer state lives outside activeJobs so initScheduler's re-runs
// (triggered on account changes) don't tear down the passive email sweep.
let indexerJob = null;
let sweepInFlight = false;
// 2h lookback gives the 10-minute cadence generous overlap — nothing falls
// through the cracks if one sweep runs long or a briefing pauses the pipeline.
const INDEXER_LOOKBACK_HOURS = 2;
const INDEXER_CRON = "*/10 * * * *";

export async function initScheduler() {
  // Clear any existing jobs (in case of re-init)
  for (const job of activeJobs) job.stop();
  activeJobs.length = 0;

  try {
    const result = await db.execute(
      "SELECT user_id, schedules_json FROM ea_settings WHERE schedules_json IS NOT NULL",
    );

    for (const row of result.rows) {
      const schedules = JSON.parse(row.schedules_json || "[]");

      for (const schedule of schedules) {
        if (!schedule.enabled) continue;

        const [hour, minute] = schedule.time.split(":");
        const cronExpr = `${parseInt(minute)} ${parseInt(hour)} * * *`;

        const job = cron.schedule(
          cronExpr,
          async () => {
            // Check if this schedule is skipped (re-read from DB for freshness)
            try {
              const fresh = await db.execute({
                sql: "SELECT schedules_json FROM ea_settings WHERE user_id = ?",
                args: [row.user_id],
              });
              const freshSchedules = JSON.parse(fresh.rows[0]?.schedules_json || "[]");
              const match = freshSchedules.find(s => s.time === schedule.time && s.label === schedule.label);
              if (match?.skipped_until && new Date(match.skipped_until) > new Date()) {
                console.log(
                  `[EA Scheduler] Skipping ${schedule.label} briefing — skipped until ${match.skipped_until}`,
                );
                return;
              }
            } catch (err) {
              console.error("[EA Scheduler] Error checking skip status:", err.message);
            }

            console.log(
              `[EA Scheduler] Generating ${schedule.label} briefing for user ${row.user_id}`,
            );
            try {
              await generateBriefing(row.user_id, { scheduleLabel: schedule.label });
              console.log(
                `[EA Scheduler] ${schedule.label} briefing generated successfully`,
              );
            } catch (err) {
              console.error(
                `[EA Scheduler] ${schedule.label} briefing failed:`,
                err.message,
              );
            }
          },
          { timezone: schedule.tz || "America/Los_Angeles" },
        );

        activeJobs.push(job);
        console.log(
          `[EA Scheduler] Scheduled ${schedule.label} briefing at ${schedule.time} ${schedule.tz || "America/Los_Angeles"} for user ${row.user_id}`,
        );
      }
    }

    if (activeJobs.length === 0) {
      console.log("[EA Scheduler] No enabled schedules found");
    }
  } catch {
    // ea_settings table may not exist yet on first run before migration
    console.log("[EA Scheduler] Skipping — ea_settings not yet available");
  }
}

// Passive email indexer: sweeps every account's inbox every 10 minutes and
// upserts recent messages into the FTS index so search finds mail that
// arrived between briefing runs. No Claude, no briefing — cheap enough to
// run continuously.
async function sweepIndex() {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    const result = await db.execute(
      "SELECT DISTINCT user_id FROM ea_accounts",
    );
    for (const row of result.rows) {
      try {
        const { accounts } = await loadUserConfig(row.user_id);
        const hasEmail = accounts.some(
          (a) => a.type === "gmail" || a.type === "icloud",
        );
        if (!hasEmail) continue;
        const emails = await fetchAllEmails(
          accounts,
          INDEXER_LOOKBACK_HOURS,
        );
        if (emails.length) await indexEmails(row.user_id, emails);
      } catch (err) {
        console.error(
          `[EA Indexer] Sweep failed for user ${row.user_id}:`,
          err.message,
        );
      }
    }
  } catch (err) {
    console.error("[EA Indexer] Sweep iteration failed:", err.message);
  } finally {
    sweepInFlight = false;
  }
}

export function startBackgroundIndexer() {
  if (indexerJob) {
    indexerJob.stop();
    indexerJob = null;
  }
  indexerJob = cron.schedule(INDEXER_CRON, sweepIndex);
  console.log(
    `[EA Indexer] Background indexer scheduled (${INDEXER_CRON}, ${INDEXER_LOOKBACK_HOURS}h lookback)`,
  );
  // Run once shortly after startup so a freshly booted server catches up
  // without waiting for the first cron tick.
  setTimeout(() => {
    sweepIndex().catch((err) =>
      console.error("[EA Indexer] Initial sweep failed:", err.message),
    );
  }, 5000);
}
