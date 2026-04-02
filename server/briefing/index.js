import db from "../db/connection.js";
import { decrypt } from "./encryption.js";
import { fetchEmails as fetchGmailEmails } from "./gmail.js";
import { fetchEmails as fetchIcloudEmails } from "./icloud.js";
import { fetchCalendar } from "./calendar.js";
import { fetchWeather } from "./weather.js";
import { fetchCTMDeadlines } from "./ctm-events.js";
import { callClaude } from "./claude.js";
import { getCategories, getUpcomingBills } from "./actual.js";
import { embedAndStore, getContextForBriefing, isEmbeddingAvailable } from "../embeddings/index.js";

// Shared: load accounts + settings, return them
export async function loadUserConfig(userId) {
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
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });
  const today = fmt.format(new Date());
  const weekFromNow = fmt.format(new Date(Date.now() + 7 * 86400000));
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
// dbAccounts (optional): all configured ea_accounts rows — seeds tabs for accounts with 0 emails.
export function fixEmailAccounts(briefingJson, inputEmails, dbAccounts) {
  if (!briefingJson.emails) briefingJson.emails = { summary: "", accounts: [] };
  if (!briefingJson.emails.accounts) briefingJson.emails.accounts = [];

  // Seed grouped map with every configured email account so 0-email accounts keep their tab
  const grouped = new Map();
  if (dbAccounts) {
    for (const a of dbAccounts) {
      if (a.type !== "gmail" && a.type !== "icloud") continue;
      const label = a.label;
      if (!label || grouped.has(label)) continue;
      grouped.set(label, {
        name: label,
        icon: a.icon || (a.type === "icloud" ? "🍎" : "📧"),
        color: a.color || "#6366f1",
        important: [],
        noise: [],
        noise_count: 0,
      });
    }
  }

  if (!inputEmails?.length) {
    // No emails fetched — keep seeded empty accounts
    briefingJson.emails.accounts = [...grouped.values()].map((acct) => ({
      ...acct,
      unread: 0,
    }));
    return;
  }

  // Build lookup: email uid/id → original account info
  const emailLookup = new Map();
  for (const e of inputEmails) {
    emailLookup.set(e.uid, {
      label: e.account_label,
      icon: e.account_icon,
      color: e.account_color,
      message_id: e.message_id,
    });
  }

  // Collect all triaged emails from Claude's response, tag with correct account
  const allTriaged = [];
  for (const acct of briefingJson.emails.accounts) {
    for (const email of acct.important || []) {
      const id = email.id || email.uid;
      const original = emailLookup.get(id);
      if (original?.message_id) email.message_id = original.message_id;
      allTriaged.push({ email, accountLabel: original?.label || acct.name });
    }
  }

  // Re-group by correct account label (into the pre-seeded map)
  for (const { email, accountLabel } of allTriaged) {
    if (!grouped.has(accountLabel)) {
      const original = inputEmails.find((e) => e.account_label === accountLabel);
      grouped.set(accountLabel, {
        name: accountLabel,
        icon: original?.account_icon || "📧",
        color: original?.account_color || "#6366f1",
        important: [],
        noise: [],
        noise_count: 0,
      });
    }
    grouped.get(accountLabel).important.push(email);
  }

  // Preserve noise emails and noise_count from Claude's response
  for (const acct of briefingJson.emails.accounts) {
    const g = grouped.get(acct.name);
    if (!g) continue;
    if (acct.noise_count) g.noise_count = acct.noise_count;
    if (acct.noise?.length) g.noise.push(...acct.noise);
  }

  // Replace accounts with corrected grouping, fix unread counts
  briefingJson.emails.accounts = [...grouped.values()].map((acct) => ({
    ...acct,
    unread: acct.important.length,
  }));

  // Invariant check: email count in should equal email count out (per D-01, D-02)
  const countIn = allTriaged.length;
  const countOut = briefingJson.emails.accounts.reduce(
    (sum, acct) => sum + acct.important.length, 0
  );
  if (countIn !== countOut) {
    console.warn(
      `[Briefing] Email count mismatch in fixEmailAccounts: ${countIn} in, ${countOut} out`
    );
  }
}

// Known payment processors whose confirmation emails duplicate the merchant's own receipt
const PAYMENT_PROCESSORS = new Set([
  "paypal", "venmo", "zelle", "cash app", "apple pay", "google pay", "square",
]);

// Deduplicate extracted bills across all email accounts.
// When a payment processor (PayPal, Venmo, etc.) and a merchant both report the same
// transaction (same amount + date within 1 day), clear the bill from the processor email.
export function deduplicateBills(briefingJson) {
  const accounts = briefingJson?.emails?.accounts;
  if (!accounts?.length) return;

  // Collect all emails with bills into a flat list with back-references
  const billEmails = [];
  for (const acct of accounts) {
    for (const email of acct.important || []) {
      if (email.hasBill && email.extractedBill && email.extractedBill.amount > 0) {
        billEmails.push(email);
      }
    }
  }

  if (billEmails.length < 2) return;

  // Find duplicates: same amount, dates within 1 day, one is a payment processor
  const dominated = new Set();
  for (let i = 0; i < billEmails.length; i++) {
    if (dominated.has(i)) continue;
    for (let j = i + 1; j < billEmails.length; j++) {
      if (dominated.has(j)) continue;
      const a = billEmails[i];
      const b = billEmails[j];
      if (a.extractedBill.amount !== b.extractedBill.amount) continue;

      // Check dates are within 1 day of each other
      const dateA = new Date(a.extractedBill.due_date);
      const dateB = new Date(b.extractedBill.due_date);
      if (Math.abs(dateA - dateB) > 86400000) continue;

      // Determine which is the payment processor
      const aFrom = (a.from || "").toLowerCase();
      const bFrom = (b.from || "").toLowerCase();
      const aIsProcessor = [...PAYMENT_PROCESSORS].some(p => aFrom.includes(p));
      const bIsProcessor = [...PAYMENT_PROCESSORS].some(p => bFrom.includes(p));

      if (aIsProcessor && !bIsProcessor) dominated.add(i);
      else if (bIsProcessor && !aIsProcessor) dominated.add(j);
    }
  }

  // Clear bills from dominated (processor) emails
  for (const idx of dominated) {
    billEmails[idx].hasBill = false;
    billEmails[idx].extractedBill = null;
  }

  if (dominated.size > 0) {
    console.log(`[Briefing] Deduplicated ${dominated.size} duplicate bill(s) from payment processor emails`);
  }
}

// Load dismissed email IDs for this user
async function loadDismissedIds(userId) {
  const result = await db.execute({
    sql: "SELECT email_id FROM ea_dismissed_emails WHERE user_id = ?",
    args: [userId],
  });
  return new Set(result.rows.map(r => r.email_id));
}

// Load previously triaged email IDs from the last ready briefing
async function loadPreviousTriage(userId) {
  const [result, dismissedIds] = await Promise.all([
    db.execute({
      sql: `SELECT briefing_json FROM ea_briefings
            WHERE user_id = ? AND status = 'ready' AND briefing_json LIKE '%aiGeneratedAt%'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    }),
    loadDismissedIds(userId),
  ]);
  if (!result.rows.length) return { triagedIds: new Set(), prevBriefing: null, dismissedIds };

  const prev = JSON.parse(result.rows[0].briefing_json);
  const triagedIds = new Set();
  for (const acct of prev.emails?.accounts || []) {
    for (const email of acct.important || []) {
      if (email.id) triagedIds.add(email.id);
    }
  }
  return { triagedIds, prevBriefing: prev, dismissedIds };
}

// Check if calendar data has meaningfully changed (CTM doesn't go to Haiku)
function hasCalendarChanged(prev, currentCalendar) {
  return JSON.stringify(prev.calendar || []) !== JSON.stringify(currentCalendar || []);
}

// Pure function: merge delta triage results with previous briefing triage.
// Takes (prevBriefing, newBriefing, dismissedIds, allEmailIds) and returns merged accounts array.
// The DB call (loadDismissedIds) stays in generateBriefing.
export function mergeDeltaBriefing(prevBriefing, newBriefing, dismissedIds, allEmailIds) {
  // Clone new accounts to avoid mutating input; tag all new emails with seenCount 1
  const mergedAccounts = (newBriefing?.emails?.accounts || []).map(acct => ({
    ...acct,
    important: acct.important.map(e => ({ ...e, seenCount: 1 })),
  }));

  const newByAccount = new Map();
  for (const acct of mergedAccounts) {
    newByAccount.set(acct.name, acct);
  }

  for (const prevAcct of prevBriefing?.emails?.accounts || []) {
    const newAcct = newByAccount.get(prevAcct.name);
    if (newAcct) {
      // Merge: old emails that still exist in inbox, not dismissed, not expired
      const existingIds = new Set(newAcct.important.map(e => e.id));
      const keptOld = prevAcct.important
        .filter(e => !existingIds.has(e.id) && allEmailIds.has(e.id) && !dismissedIds.has(e.id) && (e.seenCount || 1) < 3)
        .map(e => ({ ...e, seenCount: (e.seenCount || 1) + 1 }));
      newAcct.important = [...keptOld, ...newAcct.important];
      newAcct.unread = newAcct.important.length;
      newAcct.noise_count = (prevAcct.noise_count || 0) + (newAcct.noise_count || 0);
    } else {
      // Account had no new emails — carry forward previous triage
      const stillRelevant = prevAcct.important
        .filter(e => allEmailIds.has(e.id) && !dismissedIds.has(e.id) && (e.seenCount || 1) < 3)
        .map(e => ({ ...e, seenCount: (e.seenCount || 1) + 1 }));
      if (stillRelevant.length > 0 || prevAcct.noise_count > 0) {
        mergedAccounts.push({
          ...prevAcct,
          important: stillRelevant,
          unread: stillRelevant.length,
        });
      }
    }
  }

  // Ensure unread equals important.length on every account
  for (const acct of mergedAccounts) {
    acct.unread = acct.important.length;
  }

  // Invariant check: total emails out should not exceed total emails in
  const totalIn = (newBriefing?.emails?.accounts || []).reduce((s, a) => s + a.important.length, 0)
    + (prevBriefing?.emails?.accounts || []).reduce((s, a) => s + a.important.length, 0);
  const totalOut = mergedAccounts.reduce((s, a) => s + a.important.length, 0);
  if (totalOut > totalIn) {
    console.warn(
      `[Briefing] Delta merge email count anomaly: ${totalIn} in, ${totalOut} out`
    );
  }

  return mergedAccounts;
}

// Full generation: fetch data + Haiku AI analysis (with delta optimization)
async function updateProgress(briefingId, progress) {
  await db.execute({
    sql: `UPDATE ea_briefings SET progress = ? WHERE id = ?`,
    args: [progress, briefingId],
  });
}

export async function generateBriefing(userId, { scheduleLabel } = {}) {
  const insertResult = await db.execute({
    sql: `INSERT INTO ea_briefings (user_id, status, progress) VALUES (?, 'generating', 'Loading settings...')`,
    args: [userId],
  });
  const briefingId = Number(insertResult.lastInsertRowid);
  const startTime = Date.now();

  try {
    const { accounts, settings } = await loadUserConfig(userId);

    // Dynamic lookback: cover time since last briefing, minimum 16h floor, hard cap at 24h
    const sinceLastHours = await hoursSinceLastBriefing(userId);
    const minLookback = settings.email_lookback_hours || 16;
    const maxLookback = 24;
    const hoursBack = sinceLastHours != null
      ? Math.min(Math.max(Math.ceil(sinceLastHours) + 1, minLookback), maxLookback)
      : minLookback;

    const emailCount = accounts.filter(a => a.type === "gmail" || a.type === "icloud").length;
    await updateProgress(briefingId, `Fetching emails from ${emailCount} account${emailCount !== 1 ? "s" : ""}...`);

    const [{ calendar, weather, ctmDeadlines }, emails, { triagedIds, prevBriefing, dismissedIds }, categories, upcomingBills] = await Promise.all([
      fetchLiveData(userId, accounts, settings),
      fetchAllEmails(accounts, settings, hoursBack),
      loadPreviousTriage(userId),
      getCategories(userId).catch((err) => {
        console.error("Actual Budget categories fetch failed:", err.message);
        return [];
      }),
      getUpcomingBills(userId).catch((err) => {
        console.error("Actual Budget upcoming bills fetch failed:", err.message);
        return [];
      }),
    ]);

    // Optimization #2: Skip if nothing new (also exclude dismissed emails)
    const newEmails = emails.filter(e => !triagedIds.has(e.id || e.uid) && !dismissedIds.has(e.id || e.uid));
    const unreadNew = newEmails.filter(e => !e.read);
    const readNew = newEmails.filter(e => e.read);
    const calendarChanged = prevBriefing ? hasCalendarChanged(prevBriefing, calendar) : true;

    await updateProgress(briefingId, `Fetched ${emails.length} email${emails.length !== 1 ? "s" : ""}, ${unreadNew.length} unread new, ${readNew.length} read · Analyzing...`);

    if (unreadNew.length === 0 && !calendarChanged && prevBriefing) {
      await updateProgress(briefingId, "No new data — refreshing weather and deadlines...");
      console.log("[EA] No new emails or data changes — cloning previous briefing with fresh weather");
      const cloned = { ...prevBriefing };
      cloned.weather = { ...weather, location: settings.weather_location || "El Monte, CA" };
      cloned.ctm = { upcoming: ctmDeadlines, stats: computeCTMStats(ctmDeadlines) };
      // Increment seenCount and filter dismissed/expired emails on clone
      for (const acct of cloned.emails?.accounts || []) {
        acct.important = acct.important
          .filter(e => !dismissedIds.has(e.id) && (e.seenCount || 1) < 3)
          .map(e => ({ ...e, seenCount: (e.seenCount || 1) + 1 }));
        acct.unread = acct.important.length;
      }
      // inject read-but-untriaged emails as carried-over
      for (const e of readNew) {
        const label = e.account_label;
        let acct = (cloned.emails?.accounts || []).find(a => a.name === label);
        if (!acct) {
          acct = { name: label, icon: e.account_icon, color: e.account_color, important: [], noise: [], noise_count: 0, unread: 0 };
          cloned.emails.accounts.push(acct);
        }
        if (!acct.important.some(ex => (ex.id || ex.uid) === (e.id || e.uid))) {
          acct.important.push({ id: e.id || e.uid, uid: e.uid, from: e.from, subject: e.subject, body_preview: e.body_preview, date: e.date, read: true, seenCount: 1, account_label: e.account_label, account_icon: e.account_icon, account_color: e.account_color });
        }
      }
      fixEmailAccounts(cloned, emails, accounts);
      deduplicateBills(cloned);
      cloned.dataUpdatedAt = new Date().toISOString();
      cloned.generatedAt = nowPacific();
      if (scheduleLabel) cloned.scheduleLabel = scheduleLabel;
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

    // RAG: retrieve historical context from past briefing embeddings
    let historicalContext = null;
    if (isEmbeddingAvailable()) {
      try {
        historicalContext = await getContextForBriefing(userId);
        if (historicalContext) console.log(`[EA] Injecting historical context (${historicalContext.length} chars)`);
      } catch (err) {
        console.warn("[EA] Historical context retrieval failed:", err.message);
      }
    } else {
      console.warn("[EA] OPENAI_API_KEY not set — briefing will lack historical context");
    }

    let briefingJson;
    if (unreadNew.length > 0 && unreadNew.length < emails.length && prevBriefing) {
      await updateProgress(briefingId, `Sending ${unreadNew.length} new email${unreadNew.length !== 1 ? "s" : ""} to ${model || "Claude"}...`);
      console.log(`[EA] Delta generation: ${unreadNew.length} new unread emails (${readNew.length} read, ${emails.length - newEmails.length} previously triaged)`);
      briefingJson = await callClaude({ emails: unreadNew, calendar, ctmDeadlines, model, emailInterests, categories, historicalContext, upcomingBills });

      // Merge previous triage with new triage using pure function
      const allEmailIds = new Set(emails.map(e => e.id || e.uid));
      const mergedAccounts = mergeDeltaBriefing(prevBriefing, briefingJson, dismissedIds, allEmailIds);
      briefingJson.emails.accounts = mergedAccounts;
      // inject read-but-untriaged emails as carried-over
      for (const e of readNew) {
        const label = e.account_label;
        let acct = briefingJson.emails.accounts.find(a => a.name === label);
        if (!acct) {
          acct = { name: label, icon: e.account_icon, color: e.account_color, important: [], noise: [], noise_count: 0, unread: 0 };
          briefingJson.emails.accounts.push(acct);
        }
        if (!acct.important.some(ex => (ex.id || ex.uid) === (e.id || e.uid))) {
          acct.important.push({ id: e.id || e.uid, uid: e.uid, from: e.from, subject: e.subject, body_preview: e.body_preview, date: e.date, read: true, seenCount: 1, account_label: e.account_label, account_icon: e.account_icon, account_color: e.account_color });
        }
      }
    } else {
      // Full generation: all emails are new or no previous triage
      const emailsForClaude = unreadNew.length > 0 ? unreadNew : emails;
      await updateProgress(briefingId, `Sending ${emailsForClaude.length} email${emailsForClaude.length !== 1 ? "s" : ""} to ${model || "Claude"}...`);
      console.log(`[EA] Full generation: ${emailsForClaude.length} emails (${readNew.length} read skipped)`);
      briefingJson = await callClaude({ emails: emailsForClaude, calendar, ctmDeadlines, model, emailInterests, categories, historicalContext, upcomingBills });
      // Tag all emails with seenCount 1
      for (const acct of briefingJson.emails?.accounts || []) {
        acct.important = acct.important.map(e => ({ ...e, seenCount: 1 }));
      }
      // inject read-but-untriaged emails as carried-over
      for (const e of readNew) {
        const label = e.account_label;
        let acct = briefingJson.emails.accounts.find(a => a.name === label);
        if (!acct) {
          acct = { name: label, icon: e.account_icon, color: e.account_color, important: [], noise: [], noise_count: 0, unread: 0 };
          briefingJson.emails.accounts.push(acct);
        }
        if (!acct.important.some(ex => (ex.id || ex.uid) === (e.id || e.uid))) {
          acct.important.push({ id: e.id || e.uid, uid: e.uid, from: e.from, subject: e.subject, body_preview: e.body_preview, date: e.date, read: true, seenCount: 1, account_label: e.account_label, account_icon: e.account_icon, account_color: e.account_color });
        }
      }
    }

    // Reattach uid from original emails — Claude only sees/returns `id`, but the
    // frontend needs the prefixed `uid` (e.g. "gmail-1-abc123") to fetch email bodies.
    const uidById = new Map(emails.map(e => [e.id || e.uid, e.uid]));
    for (const acct of briefingJson.emails?.accounts || []) {
      for (const e of acct.important) {
        if (!e.uid && uidById.has(e.id)) e.uid = uidById.get(e.id);
      }
      for (const e of acct.noise || []) {
        if (!e.uid && uidById.has(e.id)) e.uid = uidById.get(e.id);
      }
    }

    await updateProgress(briefingId, "Finalizing briefing...");

    // Always overwrite CTM stats with server-computed values (Claude may hallucinate these)
    briefingJson.ctm = {
      upcoming: ctmDeadlines,
      stats: computeCTMStats(ctmDeadlines),
    };

    // Server owns all deadline data (CTM, Todoist) — discard any Claude output
    delete briefingJson.deadlines;

    // Overwrite calendar with server-fetched data (has accurate `passed` flags)
    briefingJson.calendar = calendar;

    // Fix email account grouping: re-assign emails to correct accounts based on
    // the original account_label from the fetched data (Claude sometimes misgroups)
    fixEmailAccounts(briefingJson, emails, accounts);
    deduplicateBills(briefingJson);

    // Set server-fetched weather (Claude no longer returns this)
    briefingJson.weather = { ...weather, location: settings.weather_location || "El Monte, CA" };

    briefingJson.generatedAt = nowPacific();
    briefingJson.dataUpdatedAt = new Date().toISOString();
    briefingJson.aiGeneratedAt = new Date().toISOString();
    if (scheduleLabel) briefingJson.scheduleLabel = scheduleLabel;
    if (!isEmbeddingAvailable()) briefingJson.ragUnavailable = true;

    const elapsed = Date.now() - startTime;
    await db.execute({
      sql: `UPDATE ea_briefings SET status = 'ready', briefing_json = ?, generation_time_ms = ? WHERE id = ?`,
      args: [JSON.stringify(briefingJson), elapsed, briefingId],
    });

    // Async: embed this briefing's chunks for future RAG (fire-and-forget)
    const sourceDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    embedAndStore({ userId, briefingId, briefingJson, sourceDate }).catch(err => {
      console.warn(`[EA] Embedding failed for briefing ${briefingId}:`, err.message);
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
