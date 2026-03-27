import Section from "./Section";

export default function ScheduleSection({ calendar, loaded, delay, style }) {
  return (
    <Section title="Today's Schedule" delay={delay} loaded={loaded} style={style}>
      {calendar?.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {calendar.map((event, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background:
                  event.flag === "Conflict"
                    ? "rgba(239,68,68,0.06)"
                    : "rgba(255,255,255,0.02)",
                border: `1px solid ${event.flag === "Conflict" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`,
                borderRadius: 8,
                opacity: event.passed ? 0.4 : 1,
                transition: "opacity 0.2s ease",
              }}
            >
              <div
                style={{
                  width: 3,
                  height: 36,
                  borderRadius: 2,
                  background: event.color,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 72 }}>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}
                >
                  {event.time}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {event.duration}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#e2e8f0",
                    textDecoration: event.passed ? "line-through" : "none",
                  }}
                >
                  {event.title}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {event.source}
                </div>
              </div>
              {event.passed && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: "#64748b",
                    background: "rgba(255,255,255,0.05)",
                    padding: "4px 8px",
                    borderRadius: 6,
                  }}
                >
                  Done
                </div>
              )}
              {!event.passed && event.flag && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: event.flag === "Conflict" ? "#fca5a5" : "#fcd34d",
                    background:
                      event.flag === "Conflict"
                        ? "rgba(239,68,68,0.12)"
                        : "rgba(245,158,11,0.1)",
                    padding: "4px 8px",
                    borderRadius: 6,
                  }}
                >
                  {event.flag}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "20px 16px",
            textAlign: "center",
            fontSize: 13,
            color: "#64748b",
          }}
        >
          No events today
        </div>
      )}
    </Section>
  );
}
