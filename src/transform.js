const WEATHER_ICONS = {
  sunny: "☀️", clear: "☀️", partly_cloudy: "⛅", cloudy: "☁️",
  rain: "🌧️", thunderstorm: "⛈️", snow: "❄️", fog: "🌫️",
  night: "🌙", clear_night: "🌙",
};

export function transformBriefing(raw) {
  if (!raw) return null;
  const b = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // Handle both camelCase (from Haiku prompt) and snake_case (from older format)
  const aiInsights = b.aiInsights || b.ai_insights || [];
  const ctmDeadlines = b.ctm?.upcoming || b.ctm_deadlines || [];
  const ctmStats = b.ctm?.stats || computeCTMStats(ctmDeadlines);
  const todoistItems = b.todoist?.upcoming || [];
  const todoistStats = b.todoist?.stats || computeCTMStats(todoistItems);
  const emailSummary = b.emails?.summary || b.email_summary || "";
  const emailAccounts = b.emails?.accounts || [];

  return {
    generatedAt: b.generatedAt || formatGeneratedAt(b.generated_at),
    dataUpdatedAt: b.dataUpdatedAt || null,
    aiGeneratedAt: b.aiGeneratedAt || null,
    skippedAI: b.skippedAI || false,
    nonAiGenerationCount: b.nonAiGenerationCount || 0,
    weather: {
      ...b.weather,
      hourly: (b.weather?.hourly || []).map(h => ({
        ...h,
        icon: WEATHER_ICONS[h.icon] || h.icon,
      })),
    },
    aiInsights,
    calendar: b.calendar || [],
    nextWeekCalendar: b.nextWeekCalendar || [],
    tomorrowCalendar: b.tomorrowCalendar || [],
    ctm: {
      upcoming: ctmDeadlines,
      stats: ctmStats,
    },
    todoist: {
      upcoming: todoistItems,
      stats: todoistStats,
    },
    model: b.model || null,
    emails: {
      summary: emailSummary,
      accounts: emailAccounts.map(acc => ({
        ...acc,
        important: (acc.important || []).map(email => ({
          ...email,
          id: email.id || email.uid,
          fromEmail: email.fromEmail || email.from_email,
          hasBill: email.hasBill ?? email.has_bill ?? false,
          extractedBill: email.extractedBill || email.extracted_bill || null,
        })),
        noise: acc.noise || [],
      })),
    },
  };
}

function computeCTMStats(deadlines) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" });
  const today = fmt.format(new Date());
  const weekOut = fmt.format(new Date(Date.now() + 7 * 86400000));
  return {
    incomplete: deadlines.length,
    dueToday: deadlines.filter(d => d.due_date === today).length,
    dueThisWeek: deadlines.filter(d => d.due_date <= weekOut).length,
    totalPoints: deadlines.reduce((sum, d) => sum + (d.points_possible || 0), 0),
  };
}

function formatGeneratedAt(isoString) {
  if (!isoString) return "";
  const normalized = isoString.replace(" ", "T");
  const d = new Date(normalized.includes("T") ? normalized + (normalized.endsWith("Z") ? "" : "Z") : normalized + "T00:00:00Z");
  const tz = "America/Los_Angeles";
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz });
  return `${time} · ${date}`;
}
