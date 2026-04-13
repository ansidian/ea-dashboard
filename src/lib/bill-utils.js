export function formatAmount(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

export function daysLabel(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
}

export function urgencyColor(days) {
  if (days === null) return { accent: "#6c7086", text: "rgba(205,214,244,0.5)", bg: "rgba(205,214,244,0.04)" };
  if (days < 0) return { accent: "#f38ba8", text: "#f38ba8", bg: "rgba(243,139,168,0.1)" };
  if (days === 0) return { accent: "#f97316", text: "#f97316", bg: "rgba(249,115,22,0.1)" };
  if (days === 1) return { accent: "#fab387", text: "#fab387", bg: "rgba(250,179,135,0.1)" };
  if (days <= 3) return { accent: "#f9e2af", text: "#f9e2afcc", bg: "rgba(249,226,175,0.08)" };
  return { accent: "#a6e3a1", text: "rgba(205,214,244,0.5)", bg: "rgba(205,214,244,0.04)" };
}
