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

export async function fetchCalendar(gmailAccounts, { startDate, endDate } = {}) {
  const allEvents = [];

  for (const account of gmailAccounts) {
    try {
      const token = await getValidToken(account);

      // Date boundaries — defaults to today in Pacific time
      let rangeStart, rangeEnd;
      if (startDate && endDate) {
        rangeStart = startDate;
        rangeEnd = endDate;
      } else {
        const now = new Date();
        const todayStart = new Date(
          now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
        );
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setHours(23, 59, 59, 999);
        rangeStart = todayStart;
        rangeEnd = todayEnd;
      }

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
        url.searchParams.set("timeMin", rangeStart.toISOString());
        url.searchParams.set("timeMax", rangeEnd.toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;

        const data = await res.json();
        for (const event of data.items || []) {
          const isAllDay = !event.start?.dateTime && !!event.start?.date;
          const start = event.start?.dateTime || event.start?.date;
          const end = event.end?.dateTime || event.end?.date;
          const isMultiDay = startDate && endDate;

          allEvents.push({
            time: isAllDay ? "All day" : formatTime(start),
            duration: isAllDay ? formatAllDayDuration(start, end) : formatDuration(start, end),
            title: event.summary || "(No title)",
            source: account.label,
            color: calColorMap.get(calId) || account.color || "#4285f4",
            flag: null,
            allDay: isAllDay,
            _start: new Date(start).getTime(),
            _end: new Date(end).getTime(),
            ...(isMultiDay && {
              dayLabel: new Date(start).toLocaleDateString("en-US", {
                timeZone: "America/Los_Angeles",
                weekday: "short",
                month: "short",
                day: "numeric",
              }),
            }),
          });
        }
      }
    } catch (err) {
      console.error(`Calendar error for ${account.email}:`, err.message);
    }
  }

  // Detect conflicts (skip all-day events — they don't conflict with timed events)
  for (let i = 0; i < allEvents.length; i++) {
    if (allEvents[i].allDay) continue;
    for (let j = i + 1; j < allEvents.length; j++) {
      if (allEvents[j].allDay) continue;
      const a = allEvents[i];
      const b = allEvents[j];
      if (a._start < b._end && b._start < a._end) {
        a.flag = "Conflict";
        b.flag = "Conflict";
      }
    }
  }

  // Sort: all-day events first, then by start time. Mark passed events.
  const nowMs = Date.now();
  const isFutureRange = startDate && startDate.getTime() > nowMs;
  allEvents.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a._start - b._start;
  });
  return allEvents.map(({ _start, _end, ...event }) => ({
    ...event,
    startMs: _start,
    passed: isFutureRange ? false : (event.allDay ? false : _end <= nowMs),
  }));
}

export function getNextWeekRange() {
  const now = new Date();
  const pacific = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const dayOfWeek = pacific.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days until next Sunday: if today is Sun (0), next Sun is 7 days away
  // If today is Mon (1), next Sun is 6 days away, etc.
  const daysUntilNextSunday = (7 - dayOfWeek) % 7 || 7;
  const nextSunday = new Date(pacific);
  nextSunday.setDate(pacific.getDate() + daysUntilNextSunday);
  nextSunday.setHours(0, 0, 0, 0);
  const nextSaturday = new Date(nextSunday);
  nextSaturday.setDate(nextSunday.getDate() + 6);
  nextSaturday.setHours(23, 59, 59, 999);
  return { startDate: nextSunday, endDate: nextSaturday };
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

function formatAllDayDuration(startStr, endStr) {
  if (!startStr || !endStr) return "";
  const days = Math.round((new Date(endStr) - new Date(startStr)) / 86400000);
  if (days <= 1) return "";
  return `${days} days`;
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
