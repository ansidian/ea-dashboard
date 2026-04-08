// Resolves typed date slots in Claude-generated insight templates to
// natural-language phrases ("tonight at 8pm", "tomorrow", "last Wed",
// "Apr 15") based on the current time. Pure functions — no React, no
// browser-only APIs beyond Intl, safe for unit testing.

const TZ = "America/Los_Angeles";
const EVENING_ROLLOVER_HOUR = 4; // before 4am PT, evening events still render as "tonight"

// YYYY-MM-DD in PT from a Date
function pacificYmd(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

// Hour (0-23) in PT from a Date
function pacificHour(d) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  // Intl sometimes emits "24" for midnight under en-US hour12:false — normalize.
  return hour === 24 ? 0 : hour;
}

// Pacific calendar-day difference between an ISO date (YYYY-MM-DD) and `now`.
// Positive = future, negative = past. DST-safe: compares date strings, not ms.
function pacificDaysBetween(iso, now) {
  const targetYmd = iso.slice(0, 10);
  const nowYmd = pacificYmd(now);
  // Anchor both at noon UTC to avoid tz/DST drift in the diff.
  const tgt = new Date(targetYmd + "T12:00:00Z");
  const cur = new Date(nowYmd + "T12:00:00Z");
  return Math.round((tgt - cur) / 86_400_000);
}

// "08:00" → "8am", "13:30" → "1:30pm", "20:00" → "8pm"
function formatTimeOfDay(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${mStr}${period}`;
}

// "2026-04-09" → "Thu"
function weekdayShort(iso) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
}

// "2026-04-15" → "Apr 15"
function monthDay(iso) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

// Hour component of the slot's time, or null if no time.
function slotHour(time) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  return parseInt(time.split(":")[0], 10);
}

// Is this slot's event moment already past relative to `now`?
// Compares slot datetime (in PT) to now. Used only when diff === 0.
function isSlotPastToday(iso, time, now) {
  if (!time) return false;
  const nowYmd = pacificYmd(now);
  const nowH = pacificHour(now);
  if (iso.slice(0, 10) !== nowYmd) return false; // sanity
  const slotH = slotHour(time);
  return slotH !== null && slotH < nowH;
}

/**
 * Deterministic slot renderer. Returns a natural-language phrase describing
 * the slot's date/time relative to `now`.
 *
 * Rules:
 *   diff 0:
 *     no time → "today"
 *     with time, past → "earlier today at {t}"
 *     with time, morning (<12) → "this morning at {t}"
 *     with time, afternoon (12-16) → "this afternoon at {t}"
 *     with time, evening (17-19) → "this evening at {t}"
 *     with time, night (20+) → "tonight at {t}"
 *   diff 1:
 *     no time → "tomorrow"
 *     with time → "tomorrow at {t}"
 *   diff -1:
 *     no time → "yesterday"
 *     with time, evening/night (>=17) → "last night at {t}"
 *     with time → "yesterday at {t}"
 *   diff 2..6 → weekday (with optional "at {t}")
 *   diff -2..-6 → "last {weekday}" (with optional "at {t}")
 *   else → absolute "{weekday} {month} {day}" (with optional "at {t}")
 *
 * Evening rollover: if `now` is before 4am PT and the slot is "yesterday"
 * with an evening time, we still say "tonight at {t}" — because at 2am the
 * user's mental model of "tonight" is the evening that just happened.
 */
export function renderSlot(slot, now) {
  if (!slot || typeof slot.iso !== "string") return "";
  const diff = pacificDaysBetween(slot.iso, now);
  const rawTime = slot.time || null;
  // A time is only "present" if it parses — an invalid time string is treated
  // as no-time so downstream doesn't render "tomorrow at " with a blank suffix.
  const time = rawTime && /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : null;
  const hasTime = !!time;
  const tStr = hasTime ? formatTimeOfDay(time) : "";
  const hour = hasTime ? slotHour(time) : null;
  const nowHour = pacificHour(now);
  const inRollover = nowHour < EVENING_ROLLOVER_HOUR;

  // Evening rollover: at 2am, a slot from "yesterday" evening still feels
  // like "tonight". Re-map diff -1 with evening time → behave like diff 0 night.
  if (diff === -1 && hasTime && hour >= 17 && inRollover) {
    return `tonight at ${tStr}`;
  }

  if (diff === 0) {
    if (!hasTime) return "today";
    if (isSlotPastToday(slot.iso, time, now)) return `earlier today at ${tStr}`;
    if (hour < 12) return `this morning at ${tStr}`;
    if (hour < 17) return `this afternoon at ${tStr}`;
    if (hour < 20) return `this evening at ${tStr}`;
    return `tonight at ${tStr}`;
  }

  if (diff === 1) {
    return hasTime ? `tomorrow at ${tStr}` : "tomorrow";
  }

  if (diff === -1) {
    if (!hasTime) return "yesterday";
    if (hour >= 17) return `last night at ${tStr}`;
    return `yesterday at ${tStr}`;
  }

  if (diff >= 2 && diff <= 6) {
    const wd = weekdayShort(slot.iso);
    return hasTime ? `${wd} at ${tStr}` : wd;
  }

  if (diff <= -2 && diff >= -6) {
    const wd = weekdayShort(slot.iso);
    return hasTime ? `last ${wd} at ${tStr}` : `last ${wd}`;
  }

  // Further out — absolute weekday + month + day
  const abs = `${weekdayShort(slot.iso)} ${monthDay(slot.iso)}`;
  return hasTime ? `${abs} at ${tStr}` : abs;
}

/**
 * Resolves an insight to its rendered text. Handles back-compat: insights
 * without a `template` field (older briefings pre-dating the slot system)
 * fall through to `insight.text` unchanged.
 *
 * @param {object} insight - { template?, slots?, text? }
 * @param {Date} now - the reference time for relative rendering
 * @returns {string}
 */
export function resolveInsight(insight, now) {
  if (!insight) return "";
  // Back-compat: insights from before the slot system just have `text`.
  if (!insight.template) return insight.text || "";

  const slots = insight.slots || {};
  return insight.template.replace(/\{([a-z0-9_]+)\}/gi, (match, id) => {
    const slot = slots[id];
    if (!slot) return match; // leave unresolved ref visible rather than silently drop
    return renderSlot(slot, now);
  });
}
