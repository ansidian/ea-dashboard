import db from "../db/connection.js";
import { decrypt } from "./encryption.js";
import { fetchEmails as fetchGmailEmails } from "./gmail.js";
import { fetchEmails as fetchIcloudEmails } from "./icloud.js";
import { fetchCalendar } from "./calendar.js";
import { fetchWeather } from "./weather.js";
import { fetchCTMDeadlines } from "./ctm-events.js";
import { callHaiku } from "./haiku.js";

// Shared: load accounts + settings, return them
async function loadUserConfig(userId) {
  const accountsResult = await db.execute({
    sql: "SELECT * FROM ea_accounts WHERE user_id = ?",
    args: [userId],
  });
  const accounts = accountsResult.rows;

  const settingsResult = await db.execute({
    sql: "SELECT * FROM ea_settings WHERE user_id = ?",
    args: [userId],
  });
  let settings = settingsResult.rows[0];

  if (!settings) {
    await db.execute({
      sql: "INSERT INTO ea_settings (user_id) VALUES (?)",
      args: [userId],
    });
    const defaultResult = await db.execute({
      sql: "SELECT * FROM ea_settings WHERE user_id = ?",
      args: [userId],
    });
    settings = defaultResult.rows[0];
  }

  return { accounts, settings };
}

// Shared: fetch all raw data sources in parallel
async function fetchAllData(userId, accounts, settings) {
  const hoursBack = settings.email_lookback_hours || 16;
  const gmailAccounts = accounts.filter((a) => a.type === "gmail");
  const icloudAccounts = accounts.filter((a) => a.type === "icloud");

  const emailPromises = [
    ...gmailAccounts.map((a) =>
      fetchGmailEmails(a, hoursBack).catch((err) => {
        console.error(`Gmail fetch failed for ${a.email}:`, err.message);
        return [];
      }),
    ),
    ...icloudAccounts.map((a) => {
      const password = decrypt(a.credentials_encrypted);
      return fetchIcloudEmails(a, password, hoursBack).catch((err) => {
        console.error(`iCloud fetch failed for ${a.email}:`, err.message);
        return [];
      });
    }),
  ];

  const [emailArrays, calendar, weather, ctmDeadlines] = await Promise.all([
    Promise.all(emailPromises),
    fetchCalendar(gmailAccounts).catch((err) => {
      console.error("Calendar fetch failed:", err.message);
      return [];
    }),
    fetchWeather(
      settings.weather_lat || 34.1442,
      settings.weather_lng || -117.9981,
    ).catch((err) => {
      console.error("Weather fetch failed:", err.message);
      return { temp: 0, high: 0, low: 0, summary: "Weather unavailable", hourly: [] };
    }),
    fetchCTMDeadlines(userId).catch((err) => {
      console.error("CTM events fetch failed:", err.message);
      return [];
    }),
  ]);

  return { emails: emailArrays.flat(), calendar, weather, ctmDeadlines };
}

function nowPacific() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Compute CTM stats from deadlines array (so quick refresh can rebuild them)
function computeCTMStats(deadlines) {
  const today = new Date().toISOString().slice(0, 10);
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  let totalPoints = 0;
  let dueToday = 0;
  let dueThisWeek = 0;

  for (const d of deadlines) {
    if (d.due_date === today) dueToday++;
    if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
    if (d.points_possible) totalPoints += d.points_possible;
  }

  return { pending: deadlines.length, dueToday, dueThisWeek, totalPoints };
}

// Full generation: fetch data + Haiku AI analysis
export async function generateBriefing(userId) {
  const insertResult = await db.execute({
    sql: `INSERT INTO ea_briefings (user_id, status) VALUES (?, 'generating')`,
    args: [userId],
  });
  const briefingId = Number(insertResult.lastInsertRowid);
  const startTime = Date.now();

  try {
    const { accounts, settings } = await loadUserConfig(userId);
    const { emails, calendar, weather, ctmDeadlines } = await fetchAllData(
      userId,
      accounts,
      settings,
    );

    const briefingJson = await callHaiku({ emails, calendar, weather, ctmDeadlines });

    briefingJson.generatedAt = nowPacific();
    briefingJson.dataUpdatedAt = new Date().toISOString();
    briefingJson.aiGeneratedAt = new Date().toISOString();
    if (briefingJson.weather) briefingJson.weather.location = settings.weather_location || "El Monte, CA";

    const elapsed = Date.now() - startTime;
    await db.execute({
      sql: `UPDATE ea_briefings SET status = 'ready', briefing_json = ?, generation_time_ms = ? WHERE id = ?`,
      args: [JSON.stringify(briefingJson), elapsed, briefingId],
    });

    return { id: briefingId, briefingJson };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    await db.execute({
      sql: `UPDATE ea_briefings SET status = 'error', error_message = ?, generation_time_ms = ? WHERE id = ?`,
      args: [error.message, elapsed, briefingId],
    });
    throw error;
  }
}

// Quick refresh: fetch raw data only, patch into the latest existing briefing
// Preserves AI insights, email triage, and summaries from the last Haiku call
export async function quickRefresh(userId) {
  const { accounts, settings } = await loadUserConfig(userId);
  const { emails, calendar, weather, ctmDeadlines } = await fetchAllData(
    userId,
    accounts,
    settings,
  );

  // Load the latest ready briefing to preserve AI fields
  const latestResult = await db.execute({
    sql: `SELECT id, briefing_json FROM ea_briefings
          WHERE user_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT 1`,
    args: [userId],
  });

  let briefing;
  if (latestResult.rows.length) {
    briefing = JSON.parse(latestResult.rows[0].briefing_json);
  } else {
    // No existing briefing — create a shell (AI fields will be empty)
    briefing = {
      aiInsights: [],
      emails: { summary: "", accounts: [] },
      deadlines: [],
    };
  }

  // Overwrite raw data fields, keep AI-generated fields intact
  briefing.weather = { ...weather, location: settings.weather_location || "El Monte, CA" };
  briefing.calendar = calendar;
  briefing.ctm = {
    upcoming: ctmDeadlines,
    stats: computeCTMStats(ctmDeadlines),
  };
  briefing.dataUpdatedAt = new Date().toISOString();
  // aiGeneratedAt stays unchanged — it's from the last full generation

  // Build a lightweight raw emails list for the frontend
  // (account grouping without Haiku's triage/bill detection)
  const accountMap = new Map();
  for (const email of emails) {
    const key = email.account_id;
    if (!accountMap.has(key)) {
      accountMap.set(key, {
        name: email.account_label,
        icon: email.account_id.startsWith("icloud") ? "🍎" : "📧",
        color: email.account_color || "#818cf8",
        unread: 0,
        important: [],
        noise_count: 0,
      });
    }
    const acc = accountMap.get(key);
    acc.unread++;
    acc.important.push({
      id: email.uid,
      from: email.from,
      fromEmail: email.from_email || email.from,
      subject: email.subject,
      preview: email.body_preview,
      action: "",
      urgency: "medium",
      date: email.date,
      hasBill: false,
      extractedBill: null,
    });
  }

  // Merge: keep existing AI-triaged emails if present, but update raw counts
  // If the existing briefing has AI-triaged accounts, preserve those and just update counts
  if (briefing.emails?.accounts?.length) {
    for (const existingAcc of briefing.emails.accounts) {
      const freshData = accountMap.get(
        // Match by name since AI output uses account name
        [...accountMap.entries()].find(
          ([, v]) => v.name === existingAcc.name,
        )?.[0],
      );
      if (freshData) {
        existingAcc.unread = freshData.unread;
        accountMap.delete(
          [...accountMap.entries()].find(
            ([, v]) => v.name === existingAcc.name,
          )?.[0],
        );
      }
    }
    // Append any new accounts that weren't in the AI briefing
    for (const [, acc] of accountMap) {
      briefing.emails.accounts.push(acc);
    }
  } else {
    briefing.emails = {
      summary: `${emails.length} emails across ${accountMap.size} accounts.`,
      accounts: [...accountMap.values()],
    };
  }

  // Update the existing briefing row in-place
  if (latestResult.rows.length) {
    await db.execute({
      sql: `UPDATE ea_briefings SET briefing_json = ? WHERE id = ?`,
      args: [JSON.stringify(briefing), latestResult.rows[0].id],
    });
    return { id: latestResult.rows[0].id, briefingJson: briefing, refreshType: "quick" };
  } else {
    // No existing briefing — insert as new
    const insertResult = await db.execute({
      sql: `INSERT INTO ea_briefings (user_id, status, briefing_json) VALUES (?, 'ready', ?)`,
      args: [userId, JSON.stringify(briefing)],
    });
    return {
      id: Number(insertResult.lastInsertRowid),
      briefingJson: briefing,
      refreshType: "quick",
    };
  }
}
