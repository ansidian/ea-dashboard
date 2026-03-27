import Section from "./Section";
import CTMCard from "./CTMCard";

export default function CTMSection({ ctm, expandedTask, setExpandedTask, ctmSectionRef, loaded, delay }) {
  if (!ctm?.upcoming?.length) return null;

  return (
    <div ref={ctmSectionRef}>
      <Section title="Assignments & Deadlines" delay={delay} loaded={loaded}>
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <div>
              <span
                style={{ fontSize: 24, fontWeight: 600, color: "#f8fafc" }}
              >
                {ctm.stats.incomplete}
              </span>
              <span
                style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}
              >
                incomplete
              </span>
            </div>
            <div>
              <span
                style={{ fontSize: 24, fontWeight: 600, color: "#fca5a5" }}
              >
                {ctm.stats.dueToday}
              </span>
              <span
                style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}
              >
                due today
              </span>
            </div>
            <div>
              <span
                style={{ fontSize: 24, fontWeight: 600, color: "#fcd34d" }}
              >
                {ctm.stats.dueThisWeek}
              </span>
              <span
                style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}
              >
                this week
              </span>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <a
                href="https://ctm.andysu.tech"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(167,139,250,0.08)",
                  border: "1px solid rgba(167,139,250,0.15)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  color: "#a78bfa",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(167,139,250,0.18)";
                  e.currentTarget.style.borderColor = "rgba(167,139,250,0.35)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(167,139,250,0.08)";
                  e.currentTarget.style.borderColor = "rgba(167,139,250,0.15)";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
                CTM
              </a>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ctm.upcoming.map((task) => (
            <CTMCard
              key={task.id}
              task={task}
              expanded={expandedTask === task.id}
              onToggle={() =>
                setExpandedTask(expandedTask === task.id ? null : task.id)
              }
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
