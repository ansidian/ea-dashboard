import db from "../db/connection.js";
import { decrypt } from "./encryption.js";
import { fetchEmails as fetchGmailEmails } from "./gmail.js";
import { fetchEmails as fetchIcloudEmails } from "./icloud.js";
import { fetchCalendar } from "./calendar.js";
import { fetchWeather } from "./weather.js";
import { fetchCTMDeadlines } from "./ctm-events.js";
import { callClaude } from "./claude.js";

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

// Compute hours since the last ready briefing (for dynamic email lookback)
async function hoursSinceLastBriefing(userId) {
  const result = await db.execute({
    sql: `SELECT generated_at FROM ea_briefings
          WHERE user_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT 1`,
    args: [userId],
  });
  if (!result.rows.length) return null;
  const lastTime = new Date(result.rows[0].generated_at + "Z").getTime();
  return (Date.now() - lastTime) / 3600000;
}

// Fetch non-email data sources (calendar, weather, CTM)
async function fetchLiveData(userId, accounts, settings) {
  const gmailAccounts = accounts.filter((a) => a.type === "gmail");
  const calendarAccounts = gmailAccounts.filter((a) => a.calendar_enabled);

  const [calendar, weather, ctmDeadlines] = await Promise.all([
    fetchCalendar(calendarAccounts).catch((err) => {
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

  return { calendar, weather, ctmDeadlines };
}

// Fetch emails from all accounts
async function fetchAllEmails(accounts, settings, hoursBack) {
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

  const emailArrays = await Promise.all(emailPromises);
  return emailArrays.flat();
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

  return { incomplete: deadlines.length, dueToday, dueThisWeek, totalPoints };
}

// Fix email accounts: re-group triaged emails by their original account_label,
// correct unread counts, and ensure no emails land in the wrong account.
function fixEmailAccounts(briefingJson, inputEmails) {
  if (!briefingJson.emails?.accounts?.length || !inputEmails?.length) return;

  // Build lookup: email uid/id → original account info
  const emailLookup = new Map();
  for (const e of inputEmails) {
    emailLookup.set(e.uid, {
      label: e.account_label,
      icon: e.account_icon,
      color: e.account_color,
    });
  }

  // Collect all triaged emails from Claude's response, tag with correct account
  const allTriaged = [];
  for (const acct of briefingJson.emails.accounts) {
    for (const email of acct.important || []) {
      const id = email.id || email.uid;
      const original = emailLookup.get(id);
      allTriaged.push({ email, accountLabel: original?.label || acct.name });
    }
  }

  // Re-group by correct account label
  const grouped = new Map();
  for (const { email, accountLabel } of allTriaged) {
    if (!grouped.has(accountLabel)) {
      const original = inputEmails.find((e) => e.account_label === accountLabel);
      grouped.set(accountLabel, {
        name: accountLabel,
        icon: original?.account_icon || "📧",
        color: original?.account_color || "#6366f1",
        important: [],
        noise_count: 0,
      });
    }
    grouped.get(accountLabel).important.push(email);
  }

  // Preserve noise_count from Claude's response
  for (const acct of briefingJson.emails.accounts) {
    const g = grouped.get(acct.name);
    if (g && acct.noise_count) g.noise_count = acct.noise_count;
  }

  // Replace accounts with corrected grouping, fix unread counts
  briefingJson.emails.accounts = [...grouped.values()].map((acct) => ({
    ...acct,
    unread: acct.important.length,
  }));
}

// Load previously triaged email IDs from the last ready briefing
async function loadPreviousTriage(userId) {
  const result = await db.execute({
    sql: `SELECT briefing_json FROM ea_briefings
          WHERE user_id = ? AND status = 'ready' AND briefing_json LIKE '%aiGeneratedAt%'
          ORDER BY generated_at DESC LIMIT 1`,
    args: [userId],
  });
  if (!result.rows.length) return { triagedIds: new Set(), prevBriefing: null };

  const prev = JSON.parse(result.rows[0].briefing_json);
  const triagedIds = new Set();
  for (const acct of prev.emails?.accounts || []) {
    for (const email of acct.important || []) {
      if (email.id) triagedIds.add(email.id);
    }
  }
  return { triagedIds, prevBriefing: prev };
}

// Check if calendar data has meaningfully changed (CTM doesn't go to Haiku)
function hasCalendarChanged(prev, currentCalendar) {
  return JSON.stringify(prev.calendar || []) !== JSON.stringify(currentCalendar || []);
}

// Full generation: fetch data + Haiku AI analysis (with delta optimization)
async function updateProgress(briefingId, progress) {
  await db.execute({
    sql: `UPDATE ea_briefings SET progress = ? WHERE id = ?`,
    args: [progress, briefingId],
  });
}

export async function generateBriefing(userId) {
  const insertResult = await db.execute({
    sql: `INSERT INTO ea_briefings (user_id, status, progress) VALUES (?, 'generating', 'Loading settings...')`,
    args: [userId],
  });
  const briefingId = Number(insertResult.lastInsertRowid);
  const startTime = Date.now();

  try {
    const { accounts, settings } = await loadUserConfig(userId);

    // Dynamic lookback: cover time since last briefing, minimum 16h floor
    const sinceLastHours = await hoursSinceLastBriefing(userId);
    const minLookback = settings.email_lookback_hours || 16;
    const hoursBack = sinceLastHours != null
      ? Math.max(Math.ceil(sinceLastHours) + 1, minLookback)
      : minLookback;

    const emailCount = accounts.filter(a => a.type === "gmail" || a.type === "icloud").length;
    await updateProgress(briefingId, `Fetching emails from ${emailCount} account${emailCount !== 1 ? "s" : ""}...`);

    const [{ calendar, weather, ctmDeadlines }, emails, { triagedIds, prevBriefing }] = await Promise.all([
      fetchLiveData(userId, accounts, settings),
      fetchAllEmails(accounts, settings, hoursBack),
      loadPreviousTriage(userId),
    ]);

    // Optimization #2: Skip if nothing new
    const newEmails = emails.filter(e => !triagedIds.has(e.id));
    const calendarChanged = prevBriefing ? hasCalendarChanged(prevBriefing, calendar) : true;

    await updateProgress(briefingId, `Fetched ${emails.length} email${emails.length !== 1 ? "s" : ""}, ${newEmails.length} new · Analyzing...`);

    if (newEmails.length === 0 && !calendarChanged && prevBriefing) {
      await updateProgress(briefingId, "No new data — refreshing weather and deadlines...");
      console.log("[EA] No new emails or data changes — cloning previous briefing with fresh weather");
      const cloned = { ...prevBriefing };
      cloned.weather = { ...weather, location: settings.weather_location || "El Monte, CA" };
      cloned.ctm = { upcoming: ctmDeadlines, stats: computeCTMStats(ctmDeadlines) };
      fixEmailAccounts(cloned, emails);
      cloned.dataUpdatedAt = new Date().toISOString();
      cloned.generatedAt = nowPacific();
      // Keep previous aiGeneratedAt to indicate AI didn't re-run
      cloned.skippedAI = true;

      const elapsed = Date.now() - startTime;
      await db.execute({
        sql: `UPDATE ea_briefings SET status = 'ready', briefing_json = ?, generation_time_ms = ? WHERE id = ?`,
        args: [JSON.stringify(cloned), elapsed, briefingId],
      });
      return { id: briefingId, briefingJson: cloned, skippedAI: true };
    }

    // Optimization #1: Delta-only generation — only send new emails to Claude,
    // merge results with previous triage
    const model = settings.claude_model || undefined;
    const emailInterests = settings.email_interests_json ? JSON.parse(settings.email_interests_json) : [];
    let briefingJson;
    if (newEmails.length > 0 && newEmails.length < emails.length && prevBriefing) {
      await updateProgress(briefingId, `Sending ${newEmails.length} new email${newEmails.length !== 1 ? "s" : ""} to ${model || "Claude"}...`);
      console.log(`[EA] Delta generation: ${newEmails.length} new emails (${emails.length - newEmails.length} previously triaged)`);
      const ctmStats = computeCTMStats(ctmDeadlines);
      briefingJson = await callClaude({ emails: newEmails, calendar, ctmDeadlines, model, emailInterests });

      // Merge: keep previous triage for old emails, add new triage
      const newTriagedByAccount = {};
      for (const acct of briefingJson.emails?.accounts || []) {
        newTriagedByAccount[acct.name] = acct;
      }

      // Rebuild accounts: previous important emails + newly triaged
      for (const prevAcct of prevBriefing.emails?.accounts || []) {
        const newAcct = newTriagedByAccount[prevAcct.name];
        if (newAcct) {
          // Merge: old emails that still exist + new ones
          const existingEmailIds = new Set(newAcct.important.map(e => e.id));
          const keptOld = prevAcct.important.filter(e => !existingEmailIds.has(e.id) && emails.some(fe => fe.id === e.id));
          newAcct.important = [...keptOld, ...newAcct.important];
          newAcct.unread = newAcct.important.length;
          newAcct.noise_count = (prevAcct.noise_count || 0) + (newAcct.noise_count || 0);
        } else {
          // Account had no new emails — carry forward previous triage
          const stillRelevant = prevAcct.important.filter(e => emails.some(fe => fe.id === e.id));
          if (stillRelevant.length > 0 || prevAcct.noise_count > 0) {
            briefingJson.emails.accounts.push({
              ...prevAcct,
              important: stillRelevant,
              unread: stillRelevant.length,
            });
          }
        }
      }
    } else {
      // Full generation: all emails are new or no previous triage
      await updateProgress(briefingId, `Sending ${emails.length} email${emails.length !== 1 ? "s" : ""} to ${model || "Claude"}...`);
      console.log(`[EA] Full generation: ${emails.length} emails`);
      const ctmStats = computeCTMStats(ctmDeadlines);
      briefingJson = await callClaude({ emails, calendar, ctmDeadlines, model, emailInterests });
    }

    await updateProgress(briefingId, "Finalizing briefing...");

    // Always overwrite CTM stats with server-computed values (Claude may hallucinate these)
    briefingJson.ctm = {
      upcoming: ctmDeadlines,
      stats: computeCTMStats(ctmDeadlines),
    };

    // Overwrite calendar with server-fetched data (has accurate `passed` flags)
    briefingJson.calendar = calendar;

    // Fix email account grouping: re-assign emails to correct accounts based on
    // the original account_label from the fetched data (Claude sometimes misgroups)
    fixEmailAccounts(briefingJson, emails);

    // Set server-fetched weather (Claude no longer returns this)
    briefingJson.weather = { ...weather, location: settings.weather_location || "El Monte, CA" };

    briefingJson.generatedAt = nowPacific();
    briefingJson.dataUpdatedAt = new Date().toISOString();
    briefingJson.aiGeneratedAt = new Date().toISOString();

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

// Quick refresh: update calendar, weather, CTM only — emails left to full generation
export async function quickRefresh(userId) {
  const { accounts, settings } = await loadUserConfig(userId);
  const { calendar, weather, ctmDeadlines } = await fetchLiveData(userId, accounts, settings);

  // Load the latest ready briefing to patch into
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
    briefing = {
      aiInsights: [],
      emails: { summary: "", accounts: [] },
      deadlines: [],
    };
  }

  // Overwrite live data fields, keep emails and AI fields untouched
  briefing.weather = { ...weather, location: settings.weather_location || "El Monte, CA" };
  briefing.calendar = calendar;
  briefing.ctm = {
    upcoming: ctmDeadlines,
    stats: computeCTMStats(ctmDeadlines),
  };
  briefing.dataUpdatedAt = new Date().toISOString();

  // Update the existing briefing row in-place
  if (latestResult.rows.length) {
    await db.execute({
      sql: `UPDATE ea_briefings SET briefing_json = ? WHERE id = ?`,
      args: [JSON.stringify(briefing), latestResult.rows[0].id],
    });
    return { id: latestResult.rows[0].id, briefingJson: briefing, refreshType: "quick" };
  } else {
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
