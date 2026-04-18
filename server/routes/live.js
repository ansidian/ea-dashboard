import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { loadUserConfig } from "../briefing/index.js";
import { fetchEmails as fetchGmailEmails, isMessageRead as isGmailMessageRead } from "../briefing/gmail.js";
import { fetchEmails as fetchIcloudEmails } from "../briefing/icloud.js";
import { fetchCalendar, getNextWeekRange, getTomorrowRange } from "../briefing/calendar.js";
import { fetchWeather } from "../briefing/weather.js";
import { getUpcomingBills, getRecentTransactions, getMetadata as getActualMetadata, isSchedulePaid } from "../briefing/actual.js";
import { decrypt } from "../briefing/encryption.js";

const router = Router();
router.use(requireAuth);

// Extract all email UIDs from a briefing's email accounts
function getBriefingEmailUids(briefing) {
  const uids = new Set();
  if (!briefing?.emails?.accounts) return uids;
  for (const account of briefing.emails.accounts) {
    for (const email of account.important || []) {
      if (email.uid) uids.add(email.uid);
      if (email.id) uids.add(email.id);
    }
    for (const email of account.noise || []) {
      if (email.uid) uids.add(email.uid);
      if (email.id) uids.add(email.id);
    }
  }
  return uids;
}

// Extract high-urgency senders from recent briefings
async function getAutoImportantSenders(userId) {
  const result = await db.execute({
    sql: `SELECT briefing_json FROM ea_briefings
          WHERE user_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT 7`,
    args: [userId],
  });

  const senders = new Map();
  for (const row of result.rows) {
    try {
      const briefing = JSON.parse(row.briefing_json);
      if (!briefing?.emails?.accounts) continue;
      for (const account of briefing.emails.accounts) {
        for (const email of account.important || []) {
          if (email.urgency === "high" && email.from) {
            const addr = extractEmailAddress(email.from);
            if (addr && !senders.has(addr)) {
              senders.set(addr, { address: addr, name: extractDisplayName(email.from), source: "auto" });
            }
          }
        }
      }
    } catch {
      // skip malformed briefing
    }
  }
  return senders;
}

function extractEmailAddress(from) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : from.toLowerCase().trim();
}

function extractDisplayName(from) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0];
}

// GET /api/live/all — combined live data endpoint
router.get("/all", async (_req, res) => {
  const userId = process.env.EA_USER_ID;

  try {
    const { accounts, settings } = await loadUserConfig(userId);

    // Load latest briefing for email dedup and timing
    const latestResult = await db.execute({
      sql: `SELECT id, briefing_json, generated_at FROM ea_briefings
            WHERE user_id = ? AND status = 'ready'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    });

    let briefingGeneratedAt = null;
    let knownUids = new Set();

    if (latestResult.rows.length) {
      const row = latestResult.rows[0];
      briefingGeneratedAt = row.generated_at;
      try {
        knownUids = getBriefingEmailUids(JSON.parse(row.briefing_json));
      } catch {
        // malformed briefing, treat as no known emails
      }
    }

    // Compute hours since briefing (min 1h, max 24h)
    let hoursBack = 12;
    if (briefingGeneratedAt) {
      const lastTime = new Date(briefingGeneratedAt + "Z").getTime();
      hoursBack = Math.max(1, Math.min(24, Math.ceil((Date.now() - lastTime) / 3600000)));
    }

    // Build important senders list (auto + manual) + load pinned + active snoozes.
    // Snapshots travel with pins/snoozes so the inbox can render pinned emails
    // that have aged out of the current briefing window, and expose "waking"
    // snoozes without waiting for the next briefing.
    const nowTs = Date.now();
    const [autoSenders, manualSendersRaw, pinnedResult, snoozedResult, resurfacedResult] = await Promise.all([
      getAutoImportantSenders(userId),
      Promise.resolve(settings.important_senders_json),
      db.execute({
        sql: "SELECT email_id, email_snapshot FROM ea_pinned_emails WHERE user_id = ?",
        args: [userId],
      }),
      db.execute({
        sql: "SELECT email_id, until_ts, email_snapshot FROM ea_snoozed_emails WHERE user_id = ? AND status = 'snoozed' AND until_ts > ?",
        args: [userId, nowTs],
      }),
      // Resurfaced = snooze woke up and the email is supposed to reappear as a
      // fresh live/untriaged email. These rows live 48h (see snooze-waker TTL)
      // before being cleaned up, which is why we pull all of them here — the
      // cleanup cron bounds the set size, not a time filter in this query.
      db.execute({
        sql: "SELECT email_id, resurfaced_at, email_snapshot FROM ea_snoozed_emails WHERE user_id = ? AND status = 'resurfaced'",
        args: [userId],
      }),
    ]);
    const parseSnapshot = (raw) => {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    };
    const pinnedIds = pinnedResult.rows.map(r => r.email_id);
    const pinnedSnapshots = pinnedResult.rows
      .map(r => parseSnapshot(r.email_snapshot))
      .filter(Boolean);
    const snoozedEntries = snoozedResult.rows.map(r => ({
      uid: r.email_id,
      until_ts: Number(r.until_ts),
      snapshot: parseSnapshot(r.email_snapshot),
    }));
    const resurfacedEntries = resurfacedResult.rows
      .map(r => ({
        uid: r.email_id,
        resurfaced_at: Number(r.resurfaced_at),
        snapshot: parseSnapshot(r.email_snapshot),
      }))
      .filter(r => r.snapshot); // drop rows missing a snapshot — nothing to render

    let manualSenders = [];
    try {
      manualSenders = JSON.parse(manualSendersRaw || "[]");
    } catch {
      manualSenders = [];
    }

    // Merge: manual entries override auto
    const importantSendersMap = new Map(autoSenders);
    for (const sender of manualSenders) {
      importantSendersMap.set(sender.address.toLowerCase(), { ...sender, source: "manual" });
    }
    const importantSenderAddresses = new Set(importantSendersMap.keys());

    // Fetch all data in parallel
    const gmailAccounts = accounts.filter(a => a.type === "gmail");
    const icloudAccounts = accounts.filter(a => a.type === "icloud");
    const calendarAccounts = gmailAccounts.filter(a => a.calendar_enabled);

    // Re-query Gmail for each resurfaced row's UNREAD label so rows reflect
    // the user's current Gmail state even if they triaged the email outside
    // the dashboard. Runs in parallel with emailPromises below — `isMessageRead`
    // returns null on any error, which we treat as "leave snapshot `read` alone".
    const resurfacedReadStatePromise = Promise.all(
      resurfacedEntries.map(async (entry) => {
        const snap = entry.snapshot;
        const acct = gmailAccounts.find(
          a => a.id === snap?.account_id || a.email === snap?.account_email,
        );
        if (!acct) return null;
        return isGmailMessageRead(acct, entry.uid);
      }),
    );

    const emailPromises = [
      ...gmailAccounts.map(a =>
        fetchGmailEmails(a, hoursBack).catch(err => {
          console.error(`[Live] Gmail fetch failed for ${a.email}:`, err.message);
          return [];
        }),
      ),
      ...icloudAccounts.map(async a => {
        const password = decrypt(a.credentials_encrypted);
        try {
          return await fetchIcloudEmails(a, password, hoursBack);
        } catch (err) {
          console.error(`[Live] iCloud fetch failed for ${a.email}:`, err.message);
          return [];
        }
      }),
    ];

    const [emailArrays, calendar, nextWeekCalendar, tomorrowCalendar, weather, bills, recentTransactions, actualMeta, resurfacedReadStates] = await Promise.all([
      Promise.all(emailPromises).then(arrays => arrays.flat()),
      fetchCalendar(calendarAccounts).catch(err => {
        console.error("[Live] Calendar fetch failed:", err.message);
        return [];
      }),
      fetchCalendar(calendarAccounts, getNextWeekRange()).catch(err => {
        console.error("[Live] Next week calendar fetch failed:", err.message);
        return [];
      }),
      fetchCalendar(calendarAccounts, getTomorrowRange()).catch(err => {
        console.error("[Live] Tomorrow calendar fetch failed:", err.message);
        return [];
      }),
      fetchWeather(
        settings.weather_lat || 34.1442,
        settings.weather_lng || -117.9981,
      ).catch(err => {
        console.error("[Live] Weather fetch failed:", err.message);
        return { temp: 0, high: 0, low: 0, summary: "Weather unavailable", hourly: [] };
      }),
      settings.actual_budget_url
        ? getUpcomingBills(userId).catch(err => {
            console.error("[Live] Actual Budget fetch failed:", err.message);
            return [];
          })
        : Promise.resolve([]),
      settings.actual_budget_url
        ? getRecentTransactions(userId).catch(err => {
            console.error("[Live] Actual Budget recent transactions fetch failed:", err.message);
            return [];
          })
        : Promise.resolve([]),
      settings.actual_budget_url
        ? getActualMetadata(userId).then(m => ({
            schedules: m.schedules.map(s => ({ ...s, paid: isSchedulePaid(s, m.recentTransactions) })),
            payeeMap: m.payeeMap,
          })).catch(err => {
            console.error("[Live] Actual Budget metadata fetch failed:", err.message);
            return { schedules: [], payeeMap: {} };
          })
        : Promise.resolve({ schedules: [], payeeMap: {} }),
      resurfacedReadStatePromise,
    ]);

    // Apply Gmail's current read state to resurfaced entries. `null` means the
    // probe failed (auth/network/etc.) — fall through to the snapshot's own
    // `read` field so the row still renders sensibly.
    for (let i = 0; i < resurfacedEntries.length; i++) {
      const probed = resurfacedReadStates[i];
      const snapshotRead = !!resurfacedEntries[i].snapshot?.read;
      resurfacedEntries[i].read = probed === null ? snapshotRead : probed;
    }

    // Capture read status for briefing emails before filtering them out
    const briefingReadStatus = {};
    for (const e of emailArrays) {
      if (knownUids.has(e.uid) && e.read) {
        briefingReadStatus[e.uid] = true;
      }
    }

    // Filter to emails not in the briefing (read state preserved on the email object;
    // dashboard dims read rows but keeps them visible until next briefing generation)
    const newEmails = emailArrays
      .filter(e => !knownUids.has(e.uid))
      .map(e => ({
        ...e,
        isImportantSender: importantSenderAddresses.has(extractEmailAddress(e.from)),
      }));

    // Strip email bills that match actioned items in Actual Budget (schedules + recent transactions)
    if (latestResult.rows.length && (bills.length || actualMeta.schedules.length || recentTransactions.length)) {
      const scheduleItems = (actualMeta.schedules || []).map(s => {
        const payeeCond = s.conditions?.find(c => c.field === "payee");
        const amtCond = s.conditions?.find(c => c.field === "amount");
        const rawAmt = amtCond?.value;
        const amountCents = typeof rawAmt === "object" && rawAmt !== null ? (rawAmt.num1 ?? 0) : (rawAmt ?? 0);
        return {
          payee: payeeCond ? actualMeta.payeeMap[payeeCond.value] || "" : s.name || "",
          amount: Math.abs(amountCents) / 100,
          date: s.next_date,
        };
      });
      const actionedItems = [
        ...bills.map(b => ({ payee: b.payee, amount: b.amount, date: b.next_date })),
        ...scheduleItems,
        ...recentTransactions.map(t => ({ payee: t.payee, amount: t.amount, date: t.date })),
      ];
      try {
        const briefing = JSON.parse(latestResult.rows[0].briefing_json);
        let stripped = 0;
        for (const acct of briefing.emails?.accounts || []) {
          for (const email of acct.important || []) {
            if (!email.hasBill || !email.extractedBill) continue;
            const eb = email.extractedBill;
            const matched = actionedItems.some((item) => {
              if (!item.payee || !eb.payee) return false;
              const a = item.payee.toLowerCase();
              const b = eb.payee.toLowerCase();
              if (a !== b && !a.includes(b) && !b.includes(a)) return false;
              if (eb.amount > 0 && item.amount > 0 && Math.abs(item.amount - eb.amount) / item.amount > 0.05) return false;
              if (eb.due_date && item.date) {
                const diff = Math.abs(new Date(eb.due_date) - new Date(item.date));
                if (diff > 30 * 86400000) return false;
              }
              return true;
            });
            if (matched) {
              email.hasBill = false;
              email.extractedBill = null;
              stripped++;
            }
          }
        }
        if (stripped > 0) {
          console.log(`[Live] Stripped ${stripped} actioned bill(s) from briefing`);
          db.execute({
            sql: "UPDATE ea_briefings SET briefing_json = ? WHERE id = ?",
            args: [JSON.stringify(briefing), latestResult.rows[0].id],
          }).catch(err => console.error("[Live] Failed to persist bill strip:", err.message));
        }
      } catch {
        // malformed briefing, skip stripping
      }
    }

    // Add weather location
    const weatherWithLocation = {
      ...weather,
      location: settings.weather_location || "El Monte, CA",
    };

    res.json({
      emails: newEmails,
      calendar,
      nextWeekCalendar,
      tomorrowCalendar,
      weather: weatherWithLocation,
      bills,
      recentTransactions,
      allSchedules: actualMeta.schedules,
      payeeMap: actualMeta.payeeMap,
      actualConfigured: !!settings.actual_budget_url,
      actualBudgetUrl: settings.actual_budget_url || null,
      importantSenders: Array.from(importantSendersMap.values()),
      briefingGeneratedAt,
      briefingReadStatus,
      pinnedIds,
      pinnedSnapshots,
      snoozedEntries,
      resurfacedEntries,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Live] Error fetching live data:", err.message);
    res.status(500).json({ message: "Failed to fetch live data" });
  }
});

export default router;
