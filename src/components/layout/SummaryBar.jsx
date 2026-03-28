import { cn } from "@/lib/utils";

export default function SummaryBar({ stats, loaded }) {
  if (!stats) return null;

  const items = [
    stats.urgentEmails > 0 && {
      dot: "#ef4444",
      text: `${stats.urgentEmails} email${stats.urgentEmails !== 1 ? "s" : ""} need action`,
    },
    stats.billCount > 0 && {
      dot: "#6366f1",
      text: `${stats.billCount} bill${stats.billCount !== 1 ? "s" : ""} ($${stats.billTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })})`,
    },
    stats.dueToday > 0 && {
      dot: "#f59e0b",
      text: `${stats.dueToday} due today`,
    },
    stats.meetings > 0 && {
      dot: "#818cf8",
      text: `${stats.meetings} meeting${stats.meetings !== 1 ? "s" : ""}`,
    },
    stats.temp != null && {
      dot: null,
      text: `${stats.temp}°F`,
    },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-lg px-4 py-2 mb-6 flex gap-4 items-center flex-wrap transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] delay-150",
        loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary"
        >
          {item.dot && (
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: item.dot }}
            />
          )}
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
