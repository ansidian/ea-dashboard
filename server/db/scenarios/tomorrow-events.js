// Adds tomorrow calendar events for testing the continuous timeline.

function tomorrowMs(hour, min) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
}

function event(hour, min, durationMin, title, color = "#4285f4") {
  const startMs = tomorrowMs(hour, min);
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
    endMs,
    passed: false,
  };
}

export default function tomorrowEvents(briefing) {
  briefing.tomorrowCalendar = [
    event(9, 0, 45, "Sprint Planning", "#4285f4"),
    event(11, 0, 60, "Client Presentation", "#ea4335"),
    event(13, 0, 30, "1:1 with Manager", "#fbbc04"),
    event(15, 0, 120, "Architecture Workshop", "#34a853"),
  ];
}

tomorrowEvents.description = "Adds tomorrow calendar events for testing the continuous timeline";
tomorrowEvents.category = "Calendar";
