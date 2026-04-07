export default function extractRelatedContext(briefing, sectionType, chunkText) {
  if (!briefing) return null;
  const ctx = { primary: [], related: [] };
  const chunk = chunkText.toLowerCase();

  const allEmails = [];
  for (const acct of briefing.emails?.accounts || []) {
    for (const e of acct.important || []) {
      allEmails.push({ ...e, accountName: acct.name, accountIcon: acct.icon, accountColor: acct.color });
    }
  }
  const allBills = allEmails.filter(e => e.hasBill && e.extractedBill);
  const insights = briefing.aiInsights || [];
  const calendar = briefing.calendar || [];
  const deadlines = [...(briefing.ctm?.upcoming || []), ...(briefing.deadlines || [])];

  if (sectionType === "bills") {
    ctx.primary = allBills.filter(e => {
      const payee = (e.extractedBill.payee || "").toLowerCase();
      return chunk.includes(payee) || payee.includes(chunk.split(":")[0]?.trim()?.toLowerCase());
    });
    const payees = ctx.primary.map(e => (e.extractedBill.payee || "").toLowerCase());
    ctx.related.push(...insights
      .filter(i => payees.some(p => i.text.toLowerCase().includes(p)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
    // Related emails from same senders (navigable)
    ctx.related.push(...allEmails
      .filter(e => !e.hasBill && payees.some(p => (e.from || "").toLowerCase().includes(p)))
      .map(e => ({ type: "email", icon: "📧", text: `${e.from}: "${e.subject}"`, emailData: e })));
  } else if (sectionType === "emails") {
    ctx.primary = allEmails.filter(e => {
      const from = (e.from || "").toLowerCase();
      const subject = (e.subject || "").toLowerCase();
      return chunk.includes(from) || chunk.includes(subject.slice(0, 30));
    });
    const senders = ctx.primary.map(e => (e.from || "").toLowerCase().split(" ")[0]);
    ctx.related.push(...insights
      .filter(i => senders.some(s => s.length > 2 && i.text.toLowerCase().includes(s)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
    ctx.related.push(...allBills
      .filter(e => senders.some(s => (e.from || "").toLowerCase().includes(s)) && !ctx.primary.includes(e))
      .map(e => ({ type: "bill", icon: "💰", text: `${e.extractedBill.payee}: $${e.extractedBill.amount}` })));
  } else if (sectionType === "deadlines") {
    ctx.primary = deadlines.filter(d => {
      const title = (d.title || "").toLowerCase();
      return chunk.includes(title.slice(0, 20));
    });
    const titles = ctx.primary.map(d => (d.title || "").toLowerCase().split(" ")[0]);
    ctx.related.push(...insights
      .filter(i => titles.some(t => t.length > 2 && i.text.toLowerCase().includes(t)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
    ctx.related.push(...calendar
      .filter(e => !e.passed).slice(0, 3)
      .map(e => ({ type: "calendar", icon: "📅", text: `${e.time} — ${e.title}` })));
  } else if (sectionType === "insights") {
    ctx.primary = insights.filter(i => {
      const text = i.text.toLowerCase();
      const words = chunk.split(/\s+/).filter(w => w.length > 4);
      return words.filter(w => text.includes(w)).length >= 2;
    });
    for (const insight of ctx.primary) {
      const iText = insight.text.toLowerCase();
      for (const e of allEmails) {
        if (iText.includes((e.from || "").toLowerCase().split(" ")[0]) && (e.from || "").length > 2) {
          ctx.related.push({ type: "email", icon: "📧", text: `${e.from}: "${e.subject}"`, urgency: e.urgency, emailData: e });
        }
      }
      for (const d of deadlines) {
        if (iText.includes((d.title || "").toLowerCase().slice(0, 15))) {
          ctx.related.push({ type: "deadline", icon: "⏰", text: `${d.title} — due ${d.due_date}` });
        }
      }
    }
  } else if (sectionType === "calendar") {
    ctx.primary = calendar.filter(e => chunk.includes((e.title || "").toLowerCase().slice(0, 15)));
    const titles = ctx.primary.map(e => (e.title || "").toLowerCase().split(" ")[0]);
    ctx.related.push(...insights
      .filter(i => titles.some(t => t.length > 2 && i.text.toLowerCase().includes(t)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
  }

  // Deduplicate
  const seen = new Set();
  ctx.related = ctx.related.filter(r => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });

  return ctx;
}
