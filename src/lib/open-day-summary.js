import { dayBucket, dueDateToMs } from "./redesign-helpers";
import { daysUntil } from "./bill-utils";

function urgentDeadlines(deadlines, now) {
  const out = [];
  for (const deadline of deadlines || []) {
    if (!deadline || deadline.status === "complete") continue;
    const dueAtMs = dueDateToMs(deadline.due_date, deadline.due_time);
    if (!Number.isFinite(dueAtMs)) continue;
    const bucket = dayBucket(dueAtMs, now);
    if (dueAtMs < now || bucket <= 0) {
      out.push({ deadline, dueAtMs, bucket: "overdue-or-today" });
    } else if (bucket <= 2) {
      out.push({ deadline, dueAtMs, bucket: "soon" });
    }
  }
  return out.sort((a, b) => a.dueAtMs - b.dueAtMs);
}

function unpaidBills(bills) {
  const out = [];
  for (const bill of bills || []) {
    if (!bill || bill.paid) continue;
    const days = daysUntil(bill.next_date);
    if (days == null || days > 5) continue;
    out.push({ bill, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

function actionableEmailCount(emails) {
  let count = 0;
  const accounts = emails?.accounts || [];
  for (const acc of accounts) {
    for (const email of acc.important || []) {
      if (email.triage === "actionable") count += 1;
    }
  }
  return count;
}

function deadlineLabel(entry) {
  if (entry.bucket === "overdue-or-today") {
    return entry.dueAtMs < Date.now() ? "Overdue" : "Due today";
  }
  return "Due soon";
}

export function deriveOpenDaySummary({ deadlines = [], bills = [], emails = null, now = Date.now() }) {
  const dl = urgentDeadlines(deadlines, now);
  const bl = unpaidBills(bills);
  const actionable = actionableEmailCount(emails);

  const items = [];

  if (dl.length) {
    const top = dl[0];
    items.push({
      kind: "deadline",
      urgency: top.bucket === "overdue-or-today" ? "high" : "medium",
      label: deadlineLabel(top),
      title: top.deadline.title || "Deadline",
      sub: top.deadline.class_name || top.deadline.source || null,
      count: dl.length,
    });
  }

  if (bl.length) {
    const top = bl[0];
    items.push({
      kind: "bill",
      urgency: top.days <= 1 ? "high" : "medium",
      label: top.days <= 0 ? "Due today" : top.days === 1 ? "Due tomorrow" : `Due in ${top.days}d`,
      title: top.bill.name || top.bill.payee || "Bill",
      sub: top.bill.amount != null ? `$${Number(top.bill.amount).toFixed(2)}` : null,
      count: bl.length,
    });
  }

  if (actionable > 0) {
    items.push({
      kind: "email",
      urgency: actionable >= 5 ? "medium" : "low",
      label: actionable === 1 ? "1 actionable email" : `${actionable} actionable emails`,
      title: actionable === 1 ? "Reply to 1 message" : `Reply to ${actionable} messages`,
      sub: null,
      count: actionable,
    });
  }

  if (items.length === 0) {
    return {
      tone: "light",
      primary: null,
      secondaries: [],
      hint: "Calendar is open. Best use: clear admin, email, or bills.",
    };
  }

  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.urgency] - order[b.urgency]);

  const [primary, ...rest] = items;
  return {
    tone: "pressure",
    primary,
    secondaries: rest,
    hint: null,
  };
}
