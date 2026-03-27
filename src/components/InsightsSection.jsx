import Section from "./Section";

export default function InsightsSection({ insights, loaded, delay, style }) {
  if (!insights?.length) return null;

  return (
    <Section title="Claude's Take" delay={delay} loaded={loaded} style={style}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {insights.map((insight, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "14px 16px",
              fontSize: 14,
              lineHeight: 1.6,
              color: "#cbd5e1",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              opacity: loaded ? 1 : 0,
              transform: loaded ? "translateY(0)" : "translateY(8px)",
              transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${delay + 100 + i * 80}ms`,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
              {insight.icon}
            </span>
            <span>{insight.text}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
