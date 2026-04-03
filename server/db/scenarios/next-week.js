// Adds next-week calendar events and blended AI insights referencing them.

function nextSunday() {
  const now = new Date();
  const dow = now.getDay();
  const days = (7 - dow) % 7 || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayMs(sunday, offset) {
  const d = new Date(sunday);
  d.setDate(sunday.getDate() + offset);
  return d.getTime();
}

function dayLabel(ms) {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function event(sundayDate, dayOffset, hour, min, durationMin, title, color = "#4285f4") {
  const startMs = dayMs(sundayDate, dayOffset) + hour * 3600000 + min * 60000;
  const endMs = startMs + durationMin * 60000;
  const h = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? "PM" : "AM";
  const durH = Math.floor(durationMin / 60);
  const durM = durationMin % 60;
  const duration = durH > 0 ? (durM > 0 ? `${durH}h ${durM}m` : `${durH}h`) : `${durM}m`;
  return {
    time: `${h}:${String(min).padStart(2, "0")} ${ampm}`,
    duration,
    title,
    source: "Personal",
    color,
    flag: null,
    allDay: false,
    startMs,
    passed: false,
    dayLabel: dayLabel(startMs),
  };
}

export default function nextWeek(briefing) {
  const sun = nextSunday();
  const monLabel = dayLabel(dayMs(sun, 1));
  const wedLabel = dayLabel(dayMs(sun, 3));
  const thuLabel = dayLabel(dayMs(sun, 4));

  // Populate next-week calendar with a realistic week
  const events = [
    // Sunday — light
    event(sun, 0, 10, 0, 60, "Church Service", "#34a853"),
    // Monday — busy
    event(sun, 1, 9, 0, 30, "Team Standup", "#4285f4"),
    event(sun, 1, 10, 0, 60, "Sprint Planning", "#4285f4"),
    event(sun, 1, 14, 0, 60, "Client Presentation", "#ea4335"),
    event(sun, 1, 16, 30, 30, "1:1 with Manager", "#fbbc04"),
    // Tuesday
    event(sun, 2, 9, 0, 30, "Team Standup", "#4285f4"),
    event(sun, 2, 11, 0, 90, "Design Review", "#34a853"),
    // Wednesday — packed, with a conflict
    event(sun, 3, 9, 0, 30, "Team Standup", "#4285f4"),
    event(sun, 3, 13, 0, 60, "Budget Review", "#fbbc04"),
    event(sun, 3, 13, 30, 60, "Vendor Call", "#ea4335"),
    event(sun, 3, 15, 0, 120, "Architecture Workshop", "#4285f4"),
    // Thursday
    event(sun, 4, 9, 0, 30, "Team Standup", "#4285f4"),
    event(sun, 4, 14, 0, 60, "Quarterly Review Prep", "#ea4335"),
    // Friday
    event(sun, 5, 9, 0, 30, "Team Standup", "#4285f4"),
    event(sun, 5, 10, 0, 30, "All Hands", "#34a853"),
    // Saturday — free
  ];

  // Flag the Wednesday conflict
  events[8].flag = "Conflict";
  events[9].flag = "Conflict";

  briefing.nextWeekCalendar = events;

  // Replace insights with blended ones referencing next week
  briefing.aiInsights = [
    {
      icon: "📅",
      text: `${wedLabel} is your busiest day next week — 4 meetings including a 2-hour Architecture Workshop, and you have a scheduling conflict between Budget Review and Vendor Call at 1:30 PM. Consider rescheduling one.`,
    },
    {
      icon: "📊",
      text: `${monLabel} has a Client Presentation at 2 PM — if the project status email from David needs a reply, do it before then so you have the latest numbers ready.`,
    },
    {
      icon: "🎯",
      text: `${thuLabel}'s Quarterly Review Prep might be a good time to compile the metrics from this week's sprint — you'll have the morning free to prepare.`,
    },
    {
      icon: "💡",
      text: "Saturday is completely free next week. Could be a good window for the deep work you've been pushing off.",
    },
  ];
}

nextWeek.description = "Adds next-week calendar events and blended AI insights referencing them";
