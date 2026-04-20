// Adds urgentFlag to emails that have time-sensitive deadlines.
// Tests: Group E (Enhancement 4)

function relativeDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);
}

function formatLabel(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function urgentFlags(briefing) {
  const accounts = briefing.emails?.accounts;
  if (!accounts?.length) return;

  // Add urgentFlag to the first actionable email in account 0
  const first = accounts[0]?.important?.[0];
  if (first) {
    first.urgentFlag = { label: `Deadline ${formatLabel(2)}`, date: relativeDate(2) };
  }

  // Add a commencement-style email with registration deadline
  accounts[0].important.push({
    id: "mock-urgent-commencement",
    message_id: "<mock-commencement@calstatela.edu>",
    from: "Commencement",
    fromEmail: "commencement@calstatela.edu",
    subject: "REMINDER: Register for Commencement and reserve your guest tickets!",
    preview: `Registration closes ${formatLabel(20)}. Reserve guest tickets before the portal closes.`,
    action: "Register Now",
    urgency: "high",
    date: new Date().toISOString(),
    read: false,
    hasBill: false,
    extractedBill: null,
    urgentFlag: { label: `Deadline ${formatLabel(20)}`, date: relativeDate(20) },
  });
  accounts[0].unread = accounts[0].important.filter((email) => !email.read).length;
}

urgentFlags.description = "Adds urgentFlag badges to emails with time-sensitive deadlines";
urgentFlags.category = "Email";
