import { decrypt } from "./encryption.js";
import db from "../db/connection.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

async function getValidToken(account) {
  const credentials = JSON.parse(decrypt(account.credentials_encrypted));

  if (credentials.expires_at < Date.now() + 5 * 60 * 1000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: credentials.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) throw new Error(`Calendar token refresh failed: ${res.status}`);
    const data = await res.json();
    credentials.access_token = data.access_token;
    credentials.expires_at = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) credentials.refresh_token = data.refresh_token;

    await db.execute({
      sql: `UPDATE ea_accounts SET credentials_encrypted = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [
        (await import("./encryption.js")).encrypt(JSON.stringify(credentials)),
        account.id,
      ],
    });
  }

  return credentials.access_token;
}

export async function fetchCalendar(gmailAccounts) {
  const allEvents = [];

  for (const account of gmailAccounts) {
    try {
      const token = await getValidToken(account);

      // Today's boundaries in Pacific time
      const now = new Date();
      const todayStart = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
      );
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      // Fetch all calendars for this account (with colors)
      const calListRes = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const calendars = calListRes.ok
        ? (await calListRes.json()).items || []
        : [{ id: "primary" }];
      const calColorMap = new Map(calendars.map((c) => [c.id, c.backgroundColor]));
      const calendarIds = calendars.map((c) => c.id);

      for (const calId of calendarIds) {
        const url = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
        );
        url.searchParams.set("timeMin", todayStart.toISOString());
        url.searchParams.set("timeMax", todayEnd.toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;

        const data = await res.json();
        for (const event of data.items || []) {
          const start = event.start?.dateTime || event.start?.date;
          const end = event.end?.dateTime || event.end?.date;

          allEvents.push({
            time: formatTime(start),
            duration: formatDuration(start, end),
            title: event.summary || "(No title)",
            source: account.label,
            color: calColorMap.get(calId) || account.color || "#4285f4",
            flag: null,
            _start: new Date(start).getTime(),
            _end: new Date(end).getTime(),
          });
        }
      }
    } catch (err) {
      console.error(`Calendar error for ${account.email}:`, err.message);
    }
  }

  // Detect conflicts
  for (let i = 0; i < allEvents.length; i++) {
    for (let j = i + 1; j < allEvents.length; j++) {
      const a = allEvents[i];
      const b = allEvents[j];
      if (a._start < b._end && b._start < a._end) {
        a.flag = "Conflict";
        b.flag = "Conflict";
      }
    }
  }

  // Sort by start time, mark passed events, and strip internal fields
  const nowMs = Date.now();
  allEvents.sort((a, b) => a._start - b._start);
  return allEvents.map(({ _start, _end, ...event }) => ({
    ...event,
    passed: _end <= nowMs,
  }));
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return "";
  const ms = new Date(endStr) - new Date(startStr);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
