// Dynamic mock briefing for local dev — always reflects current date/time
// and matches the latest briefing JSON shape expected by the frontend.

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

  // Build hourly forecast starting from current hour
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
      temp: 72,
      high: 78,
      low: 58,
      summary: "Sunny with a few afternoon clouds. Light breeze from the west.",
      hourly,
      location: "El Monte, CA",
    },
    aiInsights: [
      { icon: "💰", text: "SoFi autopay is scheduled — statement balance will be debited automatically. Apple charged $3.99 for Narwhal Pro, and your Amazon order totals $21.55." },
      { icon: "📅", text: "Your 3 PM meeting overlaps with the Canvas assignment deadline at 4 PM. Complete the submission before lunch." },
      { icon: "📧", text: "3 emails require responses today — the most urgent is from your manager about the Q2 report due tomorrow." },
    ],
    calendar: [
      { time: "9:00 AM", duration: "30 min", title: "Daily Standup", source: "Work", color: "#4285f4", flag: null },
      { time: "11:00 AM", duration: "1 hr", title: "Project Review", source: "Work", color: "#4285f4", flag: null },
      { time: "1:00 PM", duration: "30 min", title: "Lunch with Alex", source: "Personal", color: "#34a853", flag: null },
      { time: "3:00 PM", duration: "1 hr", title: "Team Planning", source: "Work", color: "#4285f4", flag: "conflict" },
    ],
    ctm: {
      upcoming: [
        {
          id: 9001,
          title: "Module 5 Quiz",
          due_date: relativeDate(1),
          due_time: "11:59 PM",
          class_name: "CS 301",
          class_color: "#e74c3c",
          points_possible: 25,
          status: "pending",
          source: "canvas",
          description: "Covers chapters 9-11 on data structures and algorithm analysis",
          url: null,
        },
        {
          id: 9002,
          title: "Research Paper Draft",
          due_date: relativeDate(3),
          due_time: "11:59 PM",
          class_name: "ENG 201",
          class_color: "#3498db",
          points_possible: 100,
          status: "pending",
          source: "canvas",
          description: "First draft, 5-7 pages, MLA format with annotated bibliography",
          url: null,
        },
        {
          id: 9003,
          title: "Lab Report #4",
          due_date: relativeDate(5),
          due_time: "11:59 PM",
          class_name: "PHYS 101",
          class_color: "#2ecc71",
          points_possible: 40,
          status: "pending",
          source: "canvas",
          description: "Pendulum experiment analysis with error calculations",
          url: null,
        },
      ],
      stats: { pending: 3, dueToday: 0, dueThisWeek: 3, totalPoints: 165 },
    },
    emails: {
      summary: "16 emails across 2 accounts. 4 need action, 6 FYI, 6 noise.",
      accounts: [
        {
          name: "Work Gmail",
          icon: "📧",
          color: "#818cf8",
          unread: 4,
          important: [
            {
              id: "mock-work-001",
              from: "Sarah Chen",
              fromEmail: "sarah.chen@company.com",
              subject: "Q2 Report — Need Your Section by Tomorrow",
              preview: "Hey, just a reminder that I need your section of the Q2 report by end of day tomorrow. The exec team is reviewing Friday.",
              action: "Write and submit Q2 report section by EOD tomorrow",
              urgency: "high",
              date: now.toISOString(),
              hasBill: false,
              extractedBill: null,
            },
            {
              id: "mock-work-002",
              from: "SoFi",
              fromEmail: "no-reply@o.sofi.org",
              subject: "Your SoFi Credit Card autopay is scheduled for " + new Date(Date.now() + 10 * 86400000).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
              preview: "Your autopay for your SoFi Credit Card is scheduled. Your statement balance will be debited from your linked bank account.",
              action: "Pay by " + new Date(Date.now() + 10 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              urgency: "medium",
              date: now.toISOString(),
              hasBill: true,
              extractedBill: { payee: "SoFi", amount: 0, due_date: relativeDate(10), type: "transfer", category_id: null, category_name: null },
            },
            {
              id: "mock-work-003",
              from: "Amazon.com",
              fromEmail: "auto-confirm@amazon.com",
              subject: 'Ordered: "Clorox ToiletWand..." and 1 more item',
              preview: 'Thanks for your order, Andy! Your order #112-4567890 will arrive by ' + new Date(Date.now() + 4 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + ". [amounts: $12.49, $6.99, $2.07, $21.55]",
              action: "FYI",
              urgency: "low",
              date: now.toISOString(),
              hasBill: true,
              extractedBill: { payee: "Amazon", amount: 21.55, due_date: relativeDate(0), type: "expense", category_id: null, category_name: "Shopping" },
            },
            {
              id: "mock-work-004",
              from: "IT Department",
              fromEmail: "it@company.com",
              subject: "Scheduled Maintenance — Saturday 2 AM",
              preview: "Systems will be down for maintenance this Saturday from 2-4 AM PST. No action required.",
              action: "",
              urgency: "low",
              date: now.toISOString(),
              hasBill: false,
              extractedBill: null,
            },
          ],
          noise_count: 4,
        },
        {
          name: "Personal iCloud",
          icon: "🍎",
          color: "#a259ff",
          unread: 4,
          important: [
            {
              id: "mock-icloud-001",
              from: "Apple",
              fromEmail: "no_reply@email.apple.com",
              subject: "Your receipt from Apple.",
              preview: "Receipt. Narwhal for Reddit — Narwhal Pro (Monthly). Renews " + new Date(Date.now() + 21 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + ". [amounts: $3.99, $3.99, $3.99]",
              action: "FYI",
              urgency: "low",
              date: now.toISOString(),
              hasBill: true,
              extractedBill: { payee: "Apple", amount: 3.99, due_date: relativeDate(0), type: "bill", category_id: null, category_name: "Subscriptions" },
            },
            {
              id: "mock-icloud-002",
              from: "Edison",
              fromEmail: "billing@sce.com",
              subject: "Your Electric Bill — $50.00 Due",
              preview: "Your electricity bill for the current period is $50.00. Due by " + new Date(Date.now() + 12 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + ". [amounts: $50.00]",
              action: "Pay electric bill of $50.00",
              urgency: "medium",
              date: now.toISOString(),
              hasBill: true,
              extractedBill: { payee: "Edison", amount: 50.00, due_date: relativeDate(12), type: "bill", category_id: null, category_name: "Electric" },
            },
            {
              id: "mock-icloud-003",
              from: "SoFi",
              fromEmail: "noreply@sofi.com",
              subject: "Your Credit Card Statement is Ready",
              preview: "Your statement balance of $197.50 is due on " + new Date(Date.now() + 8 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + ". [amounts: $197.50]",
              action: "Pay credit card bill of $197.50",
              urgency: "medium",
              date: now.toISOString(),
              hasBill: true,
              extractedBill: { payee: "SoFi", amount: 197.50, due_date: relativeDate(8), type: "transfer", category_id: null, category_name: null },
            },
            {
              id: "mock-icloud-004",
              from: "Venmo",
              fromEmail: "venmo@venmo.com",
              subject: "Alex sent you $25.00",
              preview: "Alex paid you $25.00 for 'lunch'. The money is now in your Venmo balance.",
              action: "",
              urgency: "low",
              date: now.toISOString(),
              hasBill: true,
              extractedBill: { payee: "Venmo (Alex)", amount: 25.00, due_date: relativeDate(0), type: "income", category_id: null, category_name: null },
            },
          ],
          noise_count: 2,
        },
      ],
    },
    deadlines: [
      { title: "Q2 Report Section", due: "Tomorrow EOD", urgency: "high", source: "email", type: "work" },
      { title: "Dentist Appointment", due: relativeDate(4), urgency: "low", source: "calendar", type: "personal" },
    ],
    generatedAt: nowPacific(),
    dataUpdatedAt: now.toISOString(),
    aiGeneratedAt: now.toISOString(),
  };
}

// Mock history entries for dev — simulates several past briefings
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
