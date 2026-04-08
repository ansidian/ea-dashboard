import { decrypt } from "./encryption.js";
import db from "../db/connection.js";

/**
 * Returns midnight (start) and 23:59:59.999 (end) for the Pacific-time date
 * that `date` falls on, as proper UTC-anchored Date objects regardless of the
 * server's local timezone.
 */
function pacificDayBoundaries(date) {
  // Resolve the current Pacific UTC offset (handles DST automatically)
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-7" or "GMT-8"
  const offsetMatch = offsetPart?.match(/GMT([+-]\d+(?::\d+)?)/);
  const [offsetHours, offsetMins] = offsetMatch
    ? offsetMatch[1].split(":").map(Number)
    : [-8, 0];
  const totalOffsetMs = (offsetHours * 60 + (offsetMins || 0) * Math.sign(offsetHours)) * 60000;

  // Get the Pacific date components
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  const yyyy = parts.year;
  const mm = parts.month;
  const dd = parts.day;

  // Midnight Pacific = midnight in Pacific ISO string converted to UTC
  const dayStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  dayStart.setTime(dayStart.getTime() - totalOffsetMs);

  const dayEnd = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999Z`);
  dayEnd.setTime(dayEnd.getTime() - totalOffsetMs);

  return { dayStart, dayEnd };
}

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
        const { dayStart, dayEnd } = pacificDayBoundaries(new Date());
        rangeStart = dayStart;
        rangeEnd = dayEnd;
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
              // All-day events arrive as bare YYYY-MM-DD strings which JS
              // parses as UTC midnight. Formatting in Pacific time then shifts
              // them back a day. Format in UTC for all-day events so the label
              // matches the date Google actually returned.
              dayLabel: new Date(start).toLocaleDateString("en-US", {
                timeZone: isAllDay ? "UTC" : "America/Los_Angeles",
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
    endMs: _end,
    passed: isFutureRange ? false : (event.allDay ? false : _end <= nowMs),
  }));
}

export function getNextWeekRange() {
  const now = new Date();
  // Determine the current day-of-week in Pacific time
  const dayOfWeekStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  }).format(now);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeekStr);

  // Days until next Sunday: if today is Sun (0), next Sun is 7 days away
  const daysUntilNextSunday = (7 - dayOfWeek) % 7 || 7;

  // Advance `now` by the right number of days, then get Pacific boundaries
  const nextSundayMs = now.getTime() + daysUntilNextSunday * 86400000;
  const { dayStart: startDate } = pacificDayBoundaries(new Date(nextSundayMs));

  const nextSaturdayMs = nextSundayMs + 6 * 86400000;
  const { dayEnd: endDate } = pacificDayBoundaries(new Date(nextSaturdayMs));

  return { startDate, endDate };
}

export function getTomorrowRange() {
  const tomorrow = new Date(Date.now() + 86400000);
  const { dayStart, dayEnd } = pacificDayBoundaries(tomorrow);
  return { startDate: dayStart, endDate: dayEnd };
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
