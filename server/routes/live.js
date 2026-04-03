import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { loadUserConfig } from "../briefing/index.js";
import { fetchEmails as fetchGmailEmails } from "../briefing/gmail.js";
import { fetchEmails as fetchIcloudEmails } from "../briefing/icloud.js";
import { fetchCalendar } from "../briefing/calendar.js";
import { fetchWeather } from "../briefing/weather.js";
import { getUpcomingBills } from "../briefing/actual.js";
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
router.get("/all", async (req, res) => {
  const userId = process.env.EA_USER_ID;

  try {
    const { accounts, settings } = await loadUserConfig(userId);

    // Load latest briefing for email dedup and timing
    const latestResult = await db.execute({
      sql: `SELECT briefing_json, generated_at FROM ea_briefings
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
      hoursBack = Math.max(1, Math.min(24, (Date.now() - lastTime) / 3600000));
    }

    // Build important senders list (auto + manual)
    const [autoSenders, manualSendersRaw] = await Promise.all([
      getAutoImportantSenders(userId),
      Promise.resolve(settings.important_senders_json),
    ]);

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

    const emailPromises = [
      ...gmailAccounts.map(a =>
        fetchGmailEmails(a, hoursBack).catch(err => {
          console.error(`[Live] Gmail fetch failed for ${a.email}:`, err.message);
          return [];
        }),
      ),
      ...icloudAccounts.map(a => {
        const password = decrypt(a.credentials_encrypted);
        return fetchIcloudEmails(a, password, hoursBack).catch(err => {
          console.error(`[Live] iCloud fetch failed for ${a.email}:`, err.message);
          return [];
        });
      }),
    ];

    const [emailArrays, calendar, weather, bills] = await Promise.all([
      Promise.all(emailPromises).then(arrays => arrays.flat()),
      fetchCalendar(calendarAccounts).catch(err => {
        console.error("[Live] Calendar fetch failed:", err.message);
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
    ]);

    // Capture read status for briefing emails before filtering them out
    const briefingReadStatus = {};
    for (const e of emailArrays) {
      if (knownUids.has(e.uid) && e.read) {
        briefingReadStatus[e.uid] = true;
      }
    }

    // Filter to only new emails not in the briefing
    const newEmails = emailArrays
      .filter(e => !knownUids.has(e.uid))
      .map(e => ({
        ...e,
        isImportantSender: importantSenderAddresses.has(extractEmailAddress(e.from)),
      }));

    // Add weather location
    const weatherWithLocation = {
      ...weather,
      location: settings.weather_location || "El Monte, CA",
    };

    res.json({
      emails: newEmails,
      calendar,
      weather: weatherWithLocation,
      bills,
      importantSenders: Array.from(importantSendersMap.values()),
      briefingGeneratedAt,
      briefingReadStatus,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Live] Error fetching live data:", err.message);
    res.status(500).json({ message: "Failed to fetch live data" });
  }
});

export default router;
