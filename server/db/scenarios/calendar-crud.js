function pacificMidday(daysFromNow = 0) {
  const now = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + daysFromNow * 86400000));
  return new Date(`${iso}T12:00:00Z`).getTime();
}

export default function calendarCrud(briefing) {
  const baseDay = pacificMidday(0);
  briefing.calendar = [
    {
      id: "mock-editable-event",
      etag: '"editable-1"',
      title: "Editable design review",
      time: "9:00 AM",
      duration: "45m",
      source: "Personal",
      sourceColor: "#cba6da",
      color: "#cba6da",
      accountId: "gmail-main",
      accountLabel: "Google",
      calendarId: "primary",
      calendarName: "Personal",
      location: "Studio",
      description: "This row should open edit mode outside mock mode.",
      htmlLink: "https://calendar.google.com",
      writable: true,
      isRecurring: false,
      allDay: false,
      startMs: baseDay + 9 * 3600000,
      endMs: baseDay + 9 * 3600000 + 45 * 60000,
      attendees: ["Alex", "Chris"],
      passed: false,
    },
    {
      id: "mock-readonly-event",
      etag: '"readonly-1"',
      title: "Shared calendar seminar",
      time: "1:00 PM",
      duration: "1h",
      source: "School",
      sourceColor: "#89b4fa",
      color: "#89b4fa",
      accountId: "gmail-main",
      accountLabel: "Google",
      calendarId: "school",
      calendarName: "School",
      location: "Auditorium",
      description: "Read-only calendar source.",
      htmlLink: "https://calendar.google.com",
      writable: false,
      isRecurring: false,
      allDay: false,
      startMs: baseDay + 13 * 3600000,
      endMs: baseDay + 14 * 3600000,
      passed: false,
    },
    {
      id: "mock-recurring-event",
      etag: '"recurring-1"',
      title: "Weekly staff sync",
      time: "3:00 PM",
      duration: "30m",
      source: "Work",
      sourceColor: "#f9e2af",
      color: "#f9e2af",
      accountId: "gmail-main",
      accountLabel: "Google",
      calendarId: "work",
      calendarName: "Work",
      location: "Zoom",
      description: "Recurring event should stay view-only in v1.",
      htmlLink: "https://calendar.google.com",
      writable: true,
      isRecurring: true,
      allDay: false,
      startMs: baseDay + 15 * 3600000,
      endMs: baseDay + 15 * 3600000 + 30 * 60000,
      hangoutLink: "https://meet.google.com/mock-sync",
      passed: false,
    },
  ];
}

calendarCrud.description = "Shows editable, read-only, and recurring calendar events for the new events rail.";
calendarCrud.category = "Calendar";
