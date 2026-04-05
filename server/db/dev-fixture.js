import { getCategories } from "../briefing/actual.js";

// Minimal base mock briefing for local dev.
// Feature-specific data lives in server/db/scenarios/ — use the dev panel
// (Ctrl+Shift+D) or ?mock=1&scenario=name to layer them on.

function relativeDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);
}

function nowPacific() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric", minute: "2-digit", weekday: "long",
    month: "long", day: "numeric", year: "numeric",
  });
}

export function generateMockBriefing() {
  const now = new Date();
  const hour = now.getHours();

  const hourly = [];
  for (let i = 0; i < 6; i++) {
    const h = (hour + i * 2) % 24;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    const baseTemp = 65 + Math.round(Math.sin(((h - 6) / 24) * Math.PI * 2) * 12);
    hourly.push({
      time: `${h12} ${ampm}`,
      temp: Math.max(55, Math.min(90, baseTemp + Math.round(Math.random() * 4 - 2))),
      icon: h >= 6 && h < 18 ? "☀️" : "🌙",
    });
  }

  return {
    weather: {
      temp: 72, high: 78, low: 58,
      summary: "Sunny with a few afternoon clouds. Light breeze from the west.",
      hourly,
      location: "El Monte, CA",
    },
    aiInsights: [
      { icon: "📅", text: "Your 3 PM meeting overlaps with the Canvas assignment deadline at 4 PM. Complete the submission before lunch." },
      { icon: "📧", text: "2 emails need your attention today — check the briefing tab for details." },
    ],
    calendar: (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ms = (h, m) => today.getTime() + h * 3600000 + m * 60000;
      // In-progress event centered on now — marker always at 50%
      const nowMs = Date.now();
      const ipStart = nowMs - 30 * 60000;
      const ipEnd = nowMs + 30 * 60000;
      const ipStartDate = new Date(ipStart);
      const ipTime = ipStartDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      return [
        { time: "9:00 AM", duration: "30m", title: "Daily Standup", source: "Work", color: "#4285f4", flag: null, allDay: false, startMs: ms(9, 0), endMs: ms(9, 30), passed: true },
        { time: "11:00 AM", duration: "1h", title: "Project Review", source: "Work", color: "#4285f4", flag: null, allDay: false, startMs: ms(11, 0), endMs: ms(12, 0), passed: true },
        { time: "1:00 PM", duration: "30m", title: "Lunch with Alex", source: "Personal", color: "#34a853", flag: null, allDay: false, startMs: ms(13, 0), endMs: ms(13, 30), passed: true },
        { time: ipTime, duration: "1h", title: "Team Planning", source: "Work", color: "#4285f4", flag: "Conflict", allDay: false, startMs: ipStart, endMs: ipEnd },
        { time: "6:30 PM", duration: "30m", title: "Evening Wrap-up", source: "Personal", color: "#34a853", flag: null, allDay: false, startMs: ms(18, 30), endMs: ms(19, 0) },
      ];
    })(),
    nextWeekCalendar: [],
    ctm: {
      upcoming: [
        {
          id: 9001, title: "Module 5 Quiz", due_date: relativeDate(1), due_time: "11:59 PM",
          class_name: "CS 301", class_color: "#e74c3c", points_possible: 25,
          status: "pending", source: "canvas", description: "Covers chapters 9-11", url: null,
        },
        {
          id: 9002, title: "Research Paper Draft", due_date: relativeDate(3), due_time: "11:59 PM",
          class_name: "ENG 201", class_color: "#3498db", points_possible: 100,
          status: "pending", source: "canvas", description: "First draft, 5-7 pages, MLA format", url: null,
        },
      ],
      stats: { pending: 2, dueToday: 0, dueThisWeek: 2, totalPoints: 125 },
    },
    emails: {
      summary: "4 emails across 2 accounts. 2 need attention, 2 FYI, 0 noise.",
      accounts: [
        {
          name: "Work Gmail", icon: "📧", color: "#818cf8", unread: 2,
          important: [
            {
              id: "mock-work-001", message_id: "<mock-001@company.com>",
              from: "Sarah Chen", fromEmail: "sarah.chen@company.com",
              subject: "Q2 Report — Need Your Section by Tomorrow",
              preview: "Hey, just a reminder that I need your section of the Q2 report by end of day tomorrow.",
              action: "Reply needed", urgency: "high", date: now.toISOString(),
              read: false, hasBill: false, extractedBill: null, urgentFlag: null,
            },
            {
              id: "mock-work-002", message_id: "<mock-002@company.com>",
              from: "IT Department", fromEmail: "it@company.com",
              subject: "Scheduled Maintenance — Saturday 2 AM",
              preview: "Systems will be down for maintenance this Saturday from 2-4 AM PST.",
              action: "FYI", urgency: "low", date: now.toISOString(),
              read: true, hasBill: false, extractedBill: null, urgentFlag: null,
            },
          ],
          noise: [], noise_count: 0,
        },
        {
          name: "Personal iCloud", icon: "🍎", color: "#a259ff", unread: 2,
          important: [
            {
              id: "mock-personal-001", message_id: "<mock-003@venmo.com>",
              from: "Venmo", fromEmail: "venmo@venmo.com",
              subject: "Alex sent you $25.00",
              preview: "Alex paid you $25.00 for 'lunch'. The money is now in your Venmo balance.",
              action: "FYI", urgency: "low", date: now.toISOString(),
              read: true, hasBill: false, extractedBill: null, urgentFlag: null,
            },
            {
              id: "mock-personal-002", message_id: "<mock-004@shipping.com>",
              from: "Amazon.com", fromEmail: "auto-confirm@amazon.com",
              subject: "Your order has shipped",
              preview: "Your package is on its way and will arrive by " + new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + ".",
              action: "FYI", urgency: "low", date: now.toISOString(),
              read: false, hasBill: false, extractedBill: null, urgentFlag: null,
            },
          ],
          noise: [], noise_count: 0,
        },
      ],
    },
    deadlines: [],
    generatedAt: nowPacific(),
    dataUpdatedAt: now.toISOString(),
    aiGeneratedAt: now.toISOString(),
  };
}

// Enrich mock with real Actual Budget category IDs if available
export async function generateEnrichedMock(userId) {
  const briefing = generateMockBriefing();
  try {
    const groups = await getCategories(userId);
    const catMap = new Map();
    for (const g of groups) {
      for (const c of g.categories || []) {
        catMap.set(c.name.toLowerCase(), c.id);
      }
    }
    for (const acct of briefing.emails?.accounts || []) {
      for (const email of acct.important || []) {
        if (email.extractedBill?.category_name) {
          const id = catMap.get(email.extractedBill.category_name.toLowerCase());
          if (id) email.extractedBill.category_id = id;
        }
      }
    }
  } catch {
    // Actual Budget not configured — leave mock data as-is
  }
  return briefing;
}

// Mock history entries for dev
export function generateMockHistory() {
  const now = Date.now();
  return [
    { id: 9001, status: "ready", generated_at: new Date(now - 0.5 * 3600000).toISOString().replace("Z", ""), generation_time_ms: 8420 },
    { id: 9002, status: "ready", generated_at: new Date(now - 4 * 3600000).toISOString().replace("Z", ""), generation_time_ms: 11230 },
    { id: 9003, status: "ready", generated_at: new Date(now - 14 * 3600000).toISOString().replace("Z", ""), generation_time_ms: 7150 },
    { id: 9004, status: "ready", generated_at: new Date(now - 26 * 3600000).toISOString().replace("Z", ""), generation_time_ms: 9870 },
    { id: 9005, status: "ready", generated_at: new Date(now - 38 * 3600000).toISOString().replace("Z", ""), generation_time_ms: 6340 },
    { id: 9006, status: "ready", generated_at: new Date(now - 50 * 3600000).toISOString().replace("Z", ""), generation_time_ms: 10100 },
  ];
}
