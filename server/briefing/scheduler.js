import cron from "node-cron";
import db from "../db/connection.js";
import { generateBriefing } from "./index.js";

const activeJobs = [];

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
