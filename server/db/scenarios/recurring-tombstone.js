// Injects one live-next-occurrence Todoist row + one tombstone row for the
// same task id, so the UI can be verified without a real recurring
// completion. Usage: ?mock=1&scenario=recurring-tombstone

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(dt);
}

export default function recurringTombstone(briefing) {
  const today = todayIso();
  const nextWeek = addDaysIso(today, 7);

  const base = {
    id: "td-ghost-demo",
    class_name: "Home",
    class_color: "#884dff",
    points_possible: null,
    source: "todoist",
    description: "Recurring weekly Todoist chore — demo for tombstone rendering.",
    url: "https://app.todoist.com/app/task/empty-dishwasher-td-ghost-demo",
    priority: 3,
    labels: [],
    is_recurring: true,
  };

  const tombstone = {
    ...base,
    title: "Empty dishwasher",
    due_date: today,
    due_time: "8:00 AM",
    status: "complete",
    _tombstone: true,
  };
  const live = {
    ...base,
    title: "Empty dishwasher",
    due_date: nextWeek,
    due_time: "8:00 AM",
    status: "incomplete",
  };

  if (!briefing.todoist) briefing.todoist = { upcoming: [], stats: {} };
  briefing.todoist.upcoming = [...(briefing.todoist.upcoming || []), live, tombstone];
  briefing.todoist.stats = {
    incomplete: briefing.todoist.upcoming.filter((t) => t.status !== "complete").length,
    dueToday: briefing.todoist.upcoming.filter((t) => t.due_date === today && t.status !== "complete").length,
    dueThisWeek: briefing.todoist.upcoming.filter((t) => t.due_date >= today && t.due_date <= nextWeek).length,
    totalPoints: 0,
  };
}

recurringTombstone.description = "Recurring Todoist task with tombstone ghost for today + live next occurrence";
recurringTombstone.category = "Other";
