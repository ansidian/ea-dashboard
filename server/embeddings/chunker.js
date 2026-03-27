// Extracts ~5 text chunks from a briefing JSON for embedding.
// Each chunk is a human-readable summary of one section type.

const SECTION_TYPES = ["emails", "insights", "bills", "calendar", "deadlines"];

export function chunkBriefing(briefingJson, briefingId, sourceDate) {
  const chunks = [];

  const emails = chunkEmails(briefingJson);
  if (emails) chunks.push({ section_type: "emails", chunk_text: emails, briefing_id: briefingId, source_date: sourceDate });

  const insights = chunkInsights(briefingJson);
  if (insights) chunks.push({ section_type: "insights", chunk_text: insights, briefing_id: briefingId, source_date: sourceDate });

  const bills = chunkBills(briefingJson);
  if (bills) chunks.push({ section_type: "bills", chunk_text: bills, briefing_id: briefingId, source_date: sourceDate });

  const calendar = chunkCalendar(briefingJson);
  if (calendar) chunks.push({ section_type: "calendar", chunk_text: calendar, briefing_id: briefingId, source_date: sourceDate });

  const deadlines = chunkDeadlines(briefingJson);
  if (deadlines) chunks.push({ section_type: "deadlines", chunk_text: deadlines, briefing_id: briefingId, source_date: sourceDate });

  return chunks;
}

function chunkEmails(b) {
  const accounts = b.emails?.accounts;
  if (!accounts?.length) return null;

  const lines = [];
  if (b.emails.summary) lines.push(b.emails.summary);

  for (const acct of accounts) {
    for (const e of acct.important || []) {
      let line = `[${acct.name}] ${e.from}: "${e.subject}"`;
      if (e.action) line += ` — ${e.action}`;
      if (e.urgency) line += ` (${e.urgency})`;
      lines.push(line);
    }
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

function chunkInsights(b) {
  const insights = b.aiInsights;
  if (!insights?.length) return null;
  return insights.map(i => i.text).join("\n");
}

function chunkBills(b) {
  const bills = [];
  for (const acct of b.emails?.accounts || []) {
    for (const e of acct.important || []) {
      if (e.hasBill && e.extractedBill) {
        const bill = e.extractedBill;
        let line = `${bill.payee}: $${bill.amount}`;
        if (bill.due_date) line += ` due ${bill.due_date}`;
        if (bill.type) line += ` (${bill.type})`;
        if (bill.category_name) line += ` [${bill.category_name}]`;
        bills.push(line);
      }
    }
  }
  return bills.length ? bills.join("\n") : null;
}

function chunkCalendar(b) {
  const events = b.calendar;
  if (!events?.length) return null;
  return events
    .filter(e => !e.passed)
    .map(e => {
      let line = `${e.time} ${e.duration} "${e.title}"`;
      if (e.source) line += ` (${e.source})`;
      if (e.flag) line += ` [${e.flag}]`;
      return line;
    })
    .join("\n") || null;
}

function chunkDeadlines(b) {
  const items = [];

  // CTM academic deadlines
  for (const d of b.ctm?.upcoming || []) {
    let line = `${d.title} due ${d.due_date}`;
    if (d.due_time) line += ` ${d.due_time}`;
    if (d.class_name) line += ` (${d.class_name})`;
    if (d.points_possible) line += ` ${d.points_possible}pts`;
    items.push(line);
  }

  // Email-extracted deadlines
  for (const d of b.deadlines || []) {
    let line = `${d.title} due ${d.due_date || d.due}`;
    if (d.source) line += ` (${d.source})`;
    items.push(line);
  }

  return items.length ? items.join("\n") : null;
}

export { SECTION_TYPES };
