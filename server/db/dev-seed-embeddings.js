// Dev seed for embeddings — deterministic fake vectors with intentional
// cosine similarity relationships so vector search returns sensible results.

import db from "./connection.js";

const DIMS = 1536;
const USER_ID = process.env.EA_USER_ID || "dev";

// Create a deterministic vector with a "theme" encoded in specific dimensions.
// Related chunks share similar directions; unrelated chunks are orthogonal.
const THEMES = {
  bills_electric: [0, 1, 2],
  bills_credit:   [3, 4, 5],
  bills_general:  [0, 1, 3, 4],
  emails_prof:    [10, 11, 12],
  emails_advisor: [13, 14, 15],
  emails_general: [10, 11, 13],
  deadlines_cs:   [20, 21, 22],
  deadlines_eng:  [23, 24, 25],
  deadlines_gen:  [20, 21, 23],
  calendar:       [30, 31, 32],
  insights:       [40, 41, 42],
  search_electric:[0, 1, 2],       // matches bills_electric
  search_smith:   [10, 11, 12],    // matches emails_prof
  search_deadline:[20, 21, 22],    // matches deadlines_cs
};

function makeVector(themeName, noise = 0.05) {
  const vec = new Float32Array(DIMS);
  const dims = THEMES[themeName];
  if (!dims) throw new Error(`Unknown theme: ${themeName}`);

  for (const d of dims) {
    vec[d] = 1.0;
  }
  // Add slight noise to non-theme dims for realism
  for (let i = 0; i < DIMS; i++) {
    if (!dims.includes(i)) {
      vec[i] = (Math.random() - 0.5) * noise;
    }
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < DIMS; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < DIMS; i++) vec[i] /= norm;
  return vec;
}

function vectorToJson(vec) {
  return `[${Array.from(vec).join(",")}]`;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// The seed chunks — 5 mock briefings across different dates
const SEED_CHUNKS = [
  // Briefing 1: 1 day ago
  { briefing_id: 9001, source_date: daysAgo(1), section_type: "bills", theme: "bills_electric",
    chunk_text: "Edison: $142.00 due 2026-03-28 (bill) [Electric]\nSoFi: $210.00 due 2026-04-01 (transfer)" },
  { briefing_id: 9001, source_date: daysAgo(1), section_type: "emails", theme: "emails_prof",
    chunk_text: "3 emails from Dr. Smith — 2 flagged important.\n[Work Gmail] Dr. Smith: \"Research feedback — revisions needed\" — Reply needed (high)" },
  { briefing_id: 9001, source_date: daysAgo(1), section_type: "insights", theme: "insights",
    chunk_text: "Dr. Smith has emailed twice this week about research revisions — consider prioritizing a response.\nEdison bill is $142, up from $118 last month." },
  { briefing_id: 9001, source_date: daysAgo(1), section_type: "deadlines", theme: "deadlines_cs",
    chunk_text: "CS301 Assignment 5 due 2026-03-27 11:59 PM (CS 301) 50pts\nENG201 Essay due 2026-03-29 11:59 PM (ENG 201) 75pts" },
  { briefing_id: 9001, source_date: daysAgo(1), section_type: "calendar", theme: "calendar",
    chunk_text: '9:00 AM 30 min "Daily Standup" (Work)\n2:00 PM 1 hr "Advisor Meeting" (Academic)' },

  // Briefing 2: 3 days ago
  { briefing_id: 9002, source_date: daysAgo(3), section_type: "bills", theme: "bills_electric",
    chunk_text: "Edison: $118.00 due 2026-03-15 (bill) [Electric]\nApple: $3.99 (bill) [Subscriptions]" },
  { briefing_id: 9002, source_date: daysAgo(3), section_type: "emails", theme: "emails_advisor",
    chunk_text: "Unread email from academic advisor re: course registration deadline.\n[Personal iCloud] Advisor: \"Spring registration opens Monday\" — Reply needed (medium)" },
  { briefing_id: 9002, source_date: daysAgo(3), section_type: "insights", theme: "insights",
    chunk_text: "Course registration opens Monday — advisor flagged priority enrollment window.\nApple subscription renewed at $3.99/mo for Narwhal Pro." },
  { briefing_id: 9002, source_date: daysAgo(3), section_type: "deadlines", theme: "deadlines_cs",
    chunk_text: "CS301 Assignment 4 submitted 58 min before deadline\nPHYS101 Lab Report due 2026-03-25 11:59 PM (PHYS 101) 40pts" },

  // Briefing 3: 7 days ago
  { briefing_id: 9003, source_date: daysAgo(7), section_type: "bills", theme: "bills_credit",
    chunk_text: "SoFi: $197.50 due 2026-03-20 (transfer)\nAmazon: $45.23 (expense) [Shopping]" },
  { briefing_id: 9003, source_date: daysAgo(7), section_type: "emails", theme: "emails_prof",
    chunk_text: "2 emails from Dr. Smith — initial research feedback.\n[Work Gmail] Dr. Smith: \"Please review attached comments\" — Reply needed (medium)" },
  { briefing_id: 9003, source_date: daysAgo(7), section_type: "insights", theme: "insights",
    chunk_text: "Dr. Smith sent initial research feedback — 2 attachments need review.\nSoFi statement balance $197.50 due in 5 days." },
  { briefing_id: 9003, source_date: daysAgo(7), section_type: "deadlines", theme: "deadlines_eng",
    chunk_text: "CS301 Assignment 3 submitted 45 min before deadline\nENG201 Annotated Bibliography due 2026-03-22 (ENG 201) 50pts" },

  // Briefing 4: 10 days ago
  { briefing_id: 9004, source_date: daysAgo(10), section_type: "bills", theme: "bills_electric",
    chunk_text: "Edison: $95.00 due 2026-02-28 (bill) [Electric]" },
  { briefing_id: 9004, source_date: daysAgo(10), section_type: "insights", theme: "insights",
    chunk_text: "Electric bill trending up — $95 this month vs $88 last month.\nNo urgent deadlines this week." },

  // Briefing 5: 14 days ago
  { briefing_id: 9005, source_date: daysAgo(14), section_type: "bills", theme: "bills_electric",
    chunk_text: "Edison: $88.00 due 2026-02-15 (bill) [Electric]\nSoFi: $185.00 due 2026-02-20 (transfer)" },
  { briefing_id: 9005, source_date: daysAgo(14), section_type: "deadlines", theme: "deadlines_cs",
    chunk_text: "CS301 Assignment 2 submitted 30 min before deadline\nCS301 Midterm study guide posted" },
];

export async function seedEmbeddings() {
  // Idempotent — skip if already seeded
  const existing = await db.execute({
    sql: "SELECT COUNT(*) as count FROM ea_embeddings WHERE user_id = ?",
    args: [USER_ID],
  });
  if (existing.rows[0].count > 0) {
    console.log("[EA] Dev embeddings already seeded, skipping");
    return false;
  }

  // Seed mock briefing rows if they don't exist (needed for FK)
  for (const id of [9001, 9002, 9003, 9004, 9005]) {
    const exists = await db.execute({
      sql: "SELECT id FROM ea_briefings WHERE id = ?",
      args: [id],
    });
    if (!exists.rows.length) {
      const date = SEED_CHUNKS.find(c => c.briefing_id === id)?.source_date;
      await db.execute({
        sql: `INSERT INTO ea_briefings (id, user_id, status, briefing_json, generated_at)
              VALUES (?, ?, 'ready', '{}', ?)`,
        args: [id, USER_ID, date],
      });
    }
  }

  for (const chunk of SEED_CHUNKS) {
    const vec = makeVector(chunk.theme);
    await db.execute({
      sql: `INSERT INTO ea_embeddings (user_id, briefing_id, section_type, chunk_text, embedding, source_date)
            VALUES (?, ?, ?, ?, vector32(?), ?)`,
      args: [USER_ID, chunk.briefing_id, chunk.section_type, chunk.chunk_text, vectorToJson(vec), chunk.source_date],
    });
  }

  console.log(`[EA] Seeded ${SEED_CHUNKS.length} dev embedding chunks`);
  return true;
}

// RAG-enhanced mock briefing with insights that reference historical data
export function generateRAGMockBriefing() {
  return {
    aiInsights: [
      { icon: "💡", text: "Your electricity bill is $142, up from $118 last month and $95 the month before — 49% increase over 3 months. Consider checking for unusual usage." },
      { icon: "📧", text: "3 emails from Dr. Smith this week — last briefing flagged 2 unread from him about research revisions. This thread has been active for 7 days." },
      { icon: "⏰", text: "CS301 midterm due Friday — your last two assignments were submitted within 1 hour of deadline (58 min and 45 min). Start early this time." },
      { icon: "💳", text: "SoFi autopay scheduled for $210 — up from $197.50 last statement. Your credit spend has been increasing over the last 3 cycles." },
    ],
    ragContext: true,
  };
}

// Pre-computed fake query vectors for dev search testing
export function getDevQueryVector(query) {
  const q = query.toLowerCase();
  if (q.includes("electric") || q.includes("edison") || q.includes("power") || q.includes("utility")) {
    return makeVector("search_electric");
  }
  if (q.includes("smith") || q.includes("professor") || q.includes("research")) {
    return makeVector("search_smith");
  }
  if (q.includes("deadline") || q.includes("assignment") || q.includes("cs301") || q.includes("submit")) {
    return makeVector("search_deadline");
  }
  // Fallback: return a generic vector that matches insights
  return makeVector("insights");
}
