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
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "8px 16px",
        marginBottom: 24,
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
        opacity: loaded ? 1 : 0,
        transform: loaded ? "translateY(0)" : "translateY(8px)",
        transition: "all 0.5s cubic-bezier(0.16,1,0.3,1) 150ms",
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: "#94a3b8",
          }}
        >
          {item.dot && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: item.dot,
                flexShrink: 0,
              }}
            />
          )}
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
