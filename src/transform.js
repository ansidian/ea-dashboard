const WEATHER_ICONS = {
  sunny: "☀️", clear: "☀️", partly_cloudy: "⛅", cloudy: "☁️",
  rain: "🌧️", thunderstorm: "⛈️", snow: "❄️", fog: "🌫️",
  night: "🌙", clear_night: "🌙",
};

export function transformBriefing(raw) {
  const b = typeof raw === 'string' ? JSON.parse(raw) : raw;

  return {
    generatedAt: formatGeneratedAt(b.generated_at),
    weather: {
      ...b.weather,
      hourly: b.weather.hourly.map(h => ({
        ...h,
        icon: WEATHER_ICONS[h.icon] || h.icon,
      })),
    },
    aiInsights: b.ai_insights,
    calendar: b.calendar,
    ctm: {
      upcoming: b.ctm_deadlines,
      stats: computeCTMStats(b.ctm_deadlines),
    },
    deadlines: b.deadlines,
    emails: {
      summary: b.email_summary,
      accounts: b.emails.accounts.map(acc => ({
        ...acc,
        important: acc.important.map(email => ({
          ...email,
          id: email.uid,
          fromEmail: email.from_email,
          hasBill: email.has_bill,
          extractedBill: email.extracted_bill,
        })),
      })),
    },
  };
}

function computeCTMStats(deadlines) {
  const today = new Date().toISOString().split('T')[0];
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  return {
    pending: deadlines.length,
    dueToday: deadlines.filter(d => d.due_date === today).length,
    dueThisWeek: deadlines.filter(d => d.due_date <= weekOut).length,
    totalPoints: deadlines.reduce((sum, d) => sum + (d.points_possible || 0), 0),
  };
}

function formatGeneratedAt(isoString) {
  const d = new Date(isoString);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `${time} · ${date}`;
}
