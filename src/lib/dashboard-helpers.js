export const urgencyStyles = {
  high: { bg: "rgba(239,68,68,0.1)", border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  medium: { bg: "rgba(245,158,11,0.08)", border: "#f59e0b", text: "#fcd34d", dot: "#f59e0b" },
  low: { bg: "rgba(107,114,128,0.08)", border: "#6b7280", text: "#9ca3af", dot: "#6b7280" },
};

export const typeLabels = {
  transfer: { label: "Card Payment", color: "#818cf8", icon: "\u{1F4B3}" },
  bill: { label: "Recurring Bill", color: "#34d399", icon: "\u{1F4C4}" },
  expense: { label: "One-time Expense", color: "#f97316", icon: "\u{1F6D2}" },
  income: { label: "Income", color: "#22d3ee", icon: "\u{1F4B0}" },
};

const TZ = "America/Los_Angeles";

// Get today's date string (YYYY-MM-DD) in Pacific time
export function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// Convert any date string to YYYY-MM-DD in Pacific time
// Handles "2026-03-29T06:59:59Z" → "2026-03-28" (the Pacific date, not UTC)
// and plain "2026-03-28" → "2026-03-28" (pass-through)
export function toPacificDate(dateStr) {
  if (!dateStr) return dateStr;
  // Only treat as ISO timestamp if it matches "YYYY-MM-DDTHH" pattern
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(dateStr));
  }
  // Plain date "2026-03-28" or human-readable string — return as-is
  return dateStr.slice(0, 10);
}

export function parseDueDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(NaN);
  if (!/T/.test(dateStr)) return new Date(dateStr + "T12:00:00");
  return new Date(dateStr);
}

export function formatRelativeDate(dateStr) {
  if (!dateStr) return dateStr;
  // If not a parseable date (e.g. "Tomorrow EOD"), return as-is
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
  const todayStr = todayPacific();
  const dueStr = toPacificDate(dateStr);
  // Compare as date strings to avoid timezone drift
  const todayMs = new Date(todayStr + "T12:00:00").getTime();
  const dueMs = new Date(dueStr + "T12:00:00").getTime();
  const diff = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `Overdue (${Math.abs(diff)}d)`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const due = new Date(dueStr + "T12:00:00");
  if (diff < 6) return due.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
  return due.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: TZ });
}

export function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function formatShortTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
  });
}

export function getGreeting() {
  const hour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()), 10);
  if (hour >= 0 && hour < 5) return { label: "Late Night Briefing", greeting: "Burning the midnight oil." };
  if (hour < 12) return { label: "Morning Briefing", greeting: "Good morning." };
  if (hour < 15) return { label: "Afternoon Briefing", greeting: "Good afternoon." };
  if (hour < 18) return { label: "Evening Briefing", greeting: "Good evening." };
  return { label: "Evening Briefing", greeting: "Good evening." };
}
