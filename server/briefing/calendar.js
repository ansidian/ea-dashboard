import db from "../db/connection.js";
import { decrypt, encrypt } from "./encryption.js";

export const DASHBOARD_CALENDAR_TZ = "America/Los_Angeles";
export const CALENDAR_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_FULL_SCOPE = "https://www.googleapis.com/auth/calendar";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

class CalendarServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "CalendarServiceError";
    this.status = status;
    this.code = code;
  }
}

function throwCalendarError(status, code, message) {
  throw new CalendarServiceError(status, code, message);
}

/**
 * Returns midnight (start) and 23:59:59.999 (end) for the Pacific-time date
 * that `date` falls on, as proper UTC-anchored Date objects regardless of the
 * server's local timezone.
 */
export function pacificDayBoundaries(date) {
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_CALENDAR_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const offsetMatch = offsetPart?.match(/GMT([+-]\d+(?::\d+)?)/);
  const [offsetHours, offsetMins] = offsetMatch
    ? offsetMatch[1].split(":").map(Number)
    : [-8, 0];
  const totalOffsetMs = (offsetHours * 60 + (offsetMins || 0) * Math.sign(offsetHours)) * 60000;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_CALENDAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  const yyyy = parts.year;
  const mm = parts.month;
  const dd = parts.day;

  const dayStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  dayStart.setTime(dayStart.getTime() - totalOffsetMs);

  const dayEnd = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999Z`);
  dayEnd.setTime(dayEnd.getTime() - totalOffsetMs);

  return { dayStart, dayEnd };
}

function getStoredScopes(credentials) {
  if (!Array.isArray(credentials?.scopes)) return [];
  return credentials.scopes.filter(Boolean);
}

function hasCalendarWriteScope(credentials) {
  const scopes = getStoredScopes(credentials);
  return scopes.includes(CALENDAR_WRITE_SCOPE) || scopes.includes(CALENDAR_FULL_SCOPE);
}

async function getAccountCredentials(account) {
  if (!account?.credentials_encrypted) {
    throwCalendarError(400, "calendar_auth_missing", "Calendar credentials are missing for this account");
  }
  try {
    return JSON.parse(decrypt(account.credentials_encrypted));
  } catch {
    throwCalendarError(500, "calendar_auth_invalid", "Calendar credentials could not be read");
  }
}

async function persistCredentials(accountId, credentials) {
  await db.execute({
    sql: `UPDATE ea_accounts
          SET credentials_encrypted = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [encrypt(JSON.stringify(credentials)), accountId],
  });
}

async function getAuthorizedAccount(account) {
  const credentials = await getAccountCredentials(account);

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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throwCalendarError(401, "calendar_token_refresh_failed", `Calendar token refresh failed: ${text || res.status}`);
    }

    const data = await res.json();
    credentials.access_token = data.access_token;
    credentials.expires_at = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) credentials.refresh_token = data.refresh_token;
    if (data.scope) credentials.scopes = data.scope.split(" ").filter(Boolean);

    await persistCredentials(account.id, credentials);
  }

  return {
    account,
    accessToken: credentials.access_token,
    credentials,
    hasWriteScope: hasCalendarWriteScope(credentials),
  };
}

async function googleCalendarFetch(auth, path, { method = "GET", query, body, headers = {} } = {}) {
  const url = new URL(path, "https://www.googleapis.com/calendar/v3/");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 412) {
    throwCalendarError(409, "calendar_event_conflict", "This event changed elsewhere. Reload and try again.");
  }
  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "");
    throwCalendarError(403, "calendar_google_forbidden", text || "Google Calendar rejected this request");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throwCalendarError(502, "calendar_google_error", text || `Google Calendar request failed: ${res.status}`);
  }

  return res;
}

function buildSyntheticPrimaryCalendar(account, writable) {
  return {
    id: "primary",
    summary: "Primary",
    backgroundColor: account.color || "#4285f4",
    accessRole: writable ? "writer" : "reader",
    primary: true,
    writable,
  };
}

function normalizeCalendarEntry(account, raw, hasWriteScope) {
  const accessRole = raw.accessRole || "reader";
  const writable = hasWriteScope && (accessRole === "owner" || accessRole === "writer");
  return {
    id: raw.id,
    summary: raw.summary || raw.summaryOverride || raw.id || "Untitled calendar",
    backgroundColor: raw.backgroundColor || account.color || "#4285f4",
    accessRole,
    primary: !!raw.primary,
    writable,
  };
}

export async function listCalendarsForAccount(account) {
  const auth = await getAuthorizedAccount(account);
  let rawCalendars = [];
  let pageToken = null;

  do {
    const res = await googleCalendarFetch(auth, "users/me/calendarList", {
      query: { pageToken, maxResults: 250, showHidden: false },
    }).catch((err) => {
      if (err.code === "calendar_google_forbidden" || err.code === "calendar_google_error") {
        return null;
      }
      throw err;
    });

    if (!res) break;
    const data = await res.json();
    rawCalendars.push(...(data.items || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  if (rawCalendars.length === 0) {
    return [buildSyntheticPrimaryCalendar(account, auth.hasWriteScope)];
  }

  return rawCalendars
    .map((entry) => normalizeCalendarEntry(account, entry, auth.hasWriteScope))
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      if (a.writable !== b.writable) return a.writable ? -1 : 1;
      return a.summary.localeCompare(b.summary);
    });
}

function findConferenceLink(event) {
  if (event?.hangoutLink) return event.hangoutLink;
  const entry = event?.conferenceData?.entryPoints?.find((item) => item.entryPointType === "video");
  return entry?.uri || null;
}

function isRecurringEventResource(event) {
  return !!(event?.recurrence?.length || event?.recurringEventId || event?.originalStartTime);
}

function allDayAnchorMs(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getTime();
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    timeZone: DASHBOARD_CALENDAR_TZ,
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
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function normalizeAttendees(attendees) {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .filter((attendee) => attendee?.email && !attendee.resource)
    .map((attendee) => attendee.displayName || attendee.email);
}

export function normalizeGoogleCalendarLink(rawUrl, accountEmail) {
  if (!rawUrl || !accountEmail) return rawUrl || null;

  try {
    const url = new URL(rawUrl);
    if (!/calendar\.google\.com$/i.test(url.hostname)) return rawUrl;
    url.searchParams.set("authuser", accountEmail);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeGoogleEvent({ account, calendar, event, isMultiDayRange = false }) {
  const isAllDay = !event.start?.dateTime && !!event.start?.date;
  const startValue = event.start?.dateTime || event.start?.date;
  const endValue = event.end?.dateTime || event.end?.date;
  const startMs = isAllDay ? allDayAnchorMs(startValue) : new Date(startValue).getTime();
  const endMs = isAllDay ? allDayAnchorMs(endValue) : new Date(endValue).getTime();
  const openUrl = normalizeGoogleCalendarLink(event.htmlLink || null, account.email);

  return {
    id: event.id,
    etag: event.etag || null,
    htmlLink: openUrl,
    openUrl,
    title: event.summary || "(No title)",
    time: isAllDay ? "All day" : formatTime(startValue),
    duration: isAllDay ? formatAllDayDuration(startValue, endValue) : formatDuration(startValue, endValue),
    location: event.location || "",
    description: event.description || "",
    attendees: normalizeAttendees(event.attendees),
    hangoutLink: findConferenceLink(event),
    source: calendar.summary,
    sourceColor: account.color || calendar.backgroundColor || "#4285f4",
    accountId: account.id,
    accountLabel: account.label,
    accountEmail: account.email,
    calendarId: calendar.id,
    calendarName: calendar.summary,
    color: calendar.backgroundColor || account.color || "#4285f4",
    flag: null,
    allDay: isAllDay,
    startMs,
    endMs,
    writable: !!calendar.writable,
    isRecurring: isRecurringEventResource(event),
    passed: false,
    ...(isMultiDayRange && {
      dayLabel: new Date(isAllDay ? `${startValue}T12:00:00Z` : startValue).toLocaleDateString("en-US", {
        timeZone: DASHBOARD_CALENDAR_TZ,
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    }),
  };
}

export async function fetchCalendar(gmailAccounts, { startDate, endDate } = {}) {
  const allEvents = [];
  if (!gmailAccounts?.length) return allEvents;

  let rangeStart;
  let rangeEnd;
  if (startDate && endDate) {
    rangeStart = startDate;
    rangeEnd = endDate;
  } else {
    const { dayStart, dayEnd } = pacificDayBoundaries(new Date());
    rangeStart = dayStart;
    rangeEnd = dayEnd;
  }
  const isMultiDayRange = !!(startDate && endDate);

  for (const account of gmailAccounts) {
    try {
      const auth = await getAuthorizedAccount(account);
      const calendars = await listCalendarsForAccount(account);

      for (const calendar of calendars) {
        const res = await googleCalendarFetch(auth, `calendars/${encodeURIComponent(calendar.id)}/events`, {
          query: {
            timeMin: rangeStart.toISOString(),
            timeMax: rangeEnd.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
          },
        }).catch((err) => {
          if (err.code === "calendar_google_forbidden" || err.code === "calendar_google_error") {
            console.warn(`[Calendar] events fetch failed for ${account.email} cal=${calendar.id}: ${err.message}`);
            return null;
          }
          throw err;
        });

        if (!res) continue;
        const data = await res.json();
        for (const event of data.items || []) {
          allEvents.push(normalizeGoogleEvent({
            account,
            calendar,
            event,
            isMultiDayRange,
          }));
        }
      }
    } catch (err) {
      console.error(`Calendar error for ${account.email}:`, err.message);
    }
  }

  for (let i = 0; i < allEvents.length; i += 1) {
    if (allEvents[i].allDay) continue;
    for (let j = i + 1; j < allEvents.length; j += 1) {
      if (allEvents[j].allDay) continue;
      const a = allEvents[i];
      const b = allEvents[j];
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        a.flag = "Conflict";
        b.flag = "Conflict";
      }
    }
  }

  const nowMs = Date.now();
  const isFutureRange = startDate && startDate.getTime() > nowMs;
  allEvents.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.startMs - b.startMs;
  });

  return allEvents.map((event) => ({
    ...event,
    passed: isFutureRange ? false : (event.allDay ? false : event.endMs <= nowMs),
  }));
}

export async function getCalendarSourceGroups(accounts) {
  const groups = [];
  for (const account of accounts) {
    const calendars = await listCalendarsForAccount(account);
    groups.push({
      accountId: account.id,
      accountLabel: account.label,
      accountEmail: account.email,
      calendars,
    });
  }
  return groups;
}

function assertWriteAccess(auth, calendar) {
  if (!auth.hasWriteScope) {
    throwCalendarError(403, "calendar_reauth_required", "Reconnect this Gmail account to edit calendar events.");
  }
  if (!calendar?.writable) {
    throwCalendarError(403, "calendar_not_writable", "This calendar is read-only in the dashboard.");
  }
}

async function getWritableCalendarContext(account, calendarId) {
  const auth = await getAuthorizedAccount(account);
  const calendars = await listCalendarsForAccount(account);
  const calendar = calendars.find((entry) => entry.id === calendarId);
  if (!calendar) {
    throwCalendarError(404, "calendar_not_found", "Calendar source not found.");
  }
  assertWriteAccess(auth, calendar);
  return { auth, calendar };
}

function toIsoDate(dateValue) {
  if (typeof dateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throwCalendarError(400, "calendar_validation_error", "Dates must use YYYY-MM-DD.");
  }
  return dateValue;
}

function toTime(value, label) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throwCalendarError(400, "calendar_validation_error", `${label} must use HH:MM.`);
  }
  return value;
}

function addDaysIso(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toCalendarMutationPayload(input) {
  const title = String(input.title || "").trim();
  if (!title) {
    throwCalendarError(400, "calendar_validation_error", "Title is required.");
  }

  const allDay = !!input.allDay;
  const startDate = toIsoDate(input.startDate);
  const endDate = toIsoDate(input.endDate || input.startDate);
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";

  if (allDay) {
    if (endDate < startDate) {
      throwCalendarError(400, "calendar_validation_error", "End date must be on or after the start date.");
    }
    return {
      summary: title,
      location,
      description,
      start: { date: startDate },
      end: { date: addDaysIso(endDate, 1) },
    };
  }

  const startTime = toTime(input.startTime, "Start time");
  const endTime = toTime(input.endTime, "End time");
  const startIso = `${startDate}T${startTime}:00`;
  const endIso = `${endDate}T${endTime}:00`;
  if (endIso <= startIso) {
    throwCalendarError(400, "calendar_validation_error", "End time must be after start time.");
  }

  return {
    summary: title,
    location,
    description,
    start: { dateTime: startIso, timeZone: DASHBOARD_CALENDAR_TZ },
    end: { dateTime: endIso, timeZone: DASHBOARD_CALENDAR_TZ },
  };
}

async function getRawEvent(account, calendarId, eventId) {
  const auth = await getAuthorizedAccount(account);
  const res = await googleCalendarFetch(auth, `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  const event = await res.json();
  return { auth, event };
}

async function ensureMutableEvent(account, calendarId, eventId) {
  const { auth, calendar } = await getWritableCalendarContext(account, calendarId);
  const res = await googleCalendarFetch(auth, `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  const event = await res.json();
  if (isRecurringEventResource(event)) {
    throwCalendarError(400, "calendar_recurring_unsupported", "Recurring events can’t be edited in the dashboard yet.");
  }
  return { auth, calendar, event };
}

export async function createCalendarEvent(account, input) {
  const { auth, calendar } = await getWritableCalendarContext(account, input.calendarId);
  const payload = toCalendarMutationPayload(input);
  const res = await googleCalendarFetch(auth, `calendars/${encodeURIComponent(calendar.id)}/events`, {
    method: "POST",
    body: payload,
  });
  const event = await res.json();
  return normalizeGoogleEvent({ account, calendar, event });
}

export async function updateCalendarEvent(account, eventId, input) {
  const { auth, calendar } = await ensureMutableEvent(account, input.calendarId, eventId);
  const payload = toCalendarMutationPayload(input);
  const res = await googleCalendarFetch(auth, `calendars/${encodeURIComponent(calendar.id)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: payload,
    headers: input.etag ? { "If-Match": input.etag } : {},
  });
  const event = await res.json();
  return normalizeGoogleEvent({ account, calendar, event });
}

export async function deleteCalendarEvent(account, eventId, input) {
  await ensureMutableEvent(account, input.calendarId, eventId);
  const auth = await getAuthorizedAccount(account);
  await googleCalendarFetch(auth, `calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: input.etag ? { "If-Match": input.etag } : {},
  });
}

export async function getCalendarEvent(account, calendarId, eventId) {
  const calendars = await listCalendarsForAccount(account);
  const calendar = calendars.find((entry) => entry.id === calendarId) || buildSyntheticPrimaryCalendar(account, false);
  const { event } = await getRawEvent(account, calendarId, eventId);
  return normalizeGoogleEvent({ account, calendar, event });
}

export function formatCalendarRouteError(err) {
  return {
    status: err?.status || 500,
    body: {
      code: err?.code || "calendar_unknown_error",
      message: err?.message || "Calendar request failed",
    },
  };
}

export function getNextWeekRange() {
  const now = new Date();
  const dayOfWeekStr = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_CALENDAR_TZ,
    weekday: "short",
  }).format(now);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeekStr);
  const daysUntilNextSunday = (7 - dayOfWeek) % 7 || 7;
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
