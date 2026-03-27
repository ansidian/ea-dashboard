import Section from "./Section";
import { urgencyStyles, formatRelativeDate, parseDueDate } from "../lib/dashboard-helpers";
import CTMCard from "./CTMCard";

export default function DeadlinesSection({
  ctm, deadlines,
  emailAccounts,
  expandedTask, setExpandedTask,
  setActiveAccount, setSelectedEmail,
  loaded, delay, style,
}) {
  const ctmItems = (ctm?.upcoming || []).map(t => ({ ...t, _type: "ctm" }));
  const otherItems = (deadlines || []).map(dl => ({ ...dl, _type: "other" }));
  const allItems = [...ctmItems, ...otherItems].sort((a, b) => {
    const dateA = a._type === "ctm" ? a.due_date : (a.due_date || a.due);
    const dateB = b._type === "ctm" ? b.due_date : (b.due_date || b.due);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return parseDueDate(dateA) - parseDueDate(dateB);
  });

  if (!allItems.length) return null;

  // Combined stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ctmDueToday = ctm?.stats?.dueToday || 0;
  const otherDueToday = otherItems.filter(dl => {
    const dateStr = dl.due_date || dl.due;
    if (!dateStr) return false;
    return parseDueDate(dateStr).getTime() === today.getTime();
  }).length;
  const totalDueToday = ctmDueToday + otherDueToday;
  const totalIncomplete = (ctm?.stats?.incomplete || 0) + otherItems.length;
  const ctmDueThisWeek = ctm?.stats?.dueThisWeek || 0;

  return (
    <Section title="Deadlines" delay={delay} loaded={loaded} style={style}>
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
            <span style={{ fontSize: 24, fontWeight: 600, color: "#f8fafc" }}>
              {totalIncomplete}
            </span>
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>
              incomplete
            </span>
          </div>
          <div>
            <span style={{ fontSize: 24, fontWeight: 600, color: "#fca5a5" }}>
              {totalDueToday}
            </span>
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>
              due today
            </span>
          </div>
          {ctmDueThisWeek > 0 && (
            <div>
              <span style={{ fontSize: 24, fontWeight: 600, color: "#fcd34d" }}>
                {ctmDueThisWeek}
              </span>
              <span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>
                this week
              </span>
            </div>
          )}
          {ctmItems.length > 0 && (
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
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
                CTM
              </a>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {allItems.map((item, i) => {
          if (item._type === "ctm") {
            return (
              <CTMCard
                key={`ctm-${item.id}`}
                task={item}
                expanded={expandedTask === item.id}
                onToggle={() =>
                  setExpandedTask(expandedTask === item.id ? null : item.id)
                }
              />
            );
          }

          // "other" deadline row
          const dl = item;
          const dateStr = dl.due_date || dl.due;
          const s = urgencyStyles[dl.urgency] || urgencyStyles.low;
          const ctmMatch =
            (dl.source === "canvas" || dl.type === "academic") && !dl.email_id
              ? ctmItems.find(
                  (t) => dl.title.includes(t.title) || t.title.includes(dl.title),
                )
              : null;
          const isClickable = !!(dl.email_id || ctmMatch);
          const handleClick = () => {
            if (ctmMatch) {
              setExpandedTask(ctmMatch.id);
              return;
            }
            if (!dl.email_id) return;
            const accIdx = emailAccounts.findIndex((acc) =>
              acc.important?.some((e) => e.id === dl.email_id),
            );
            if (accIdx === -1) return;
            const email = emailAccounts[accIdx].important.find(
              (e) => e.id === dl.email_id,
            );
            if (!email) return;
            setActiveAccount(accIdx);
            setSelectedEmail(email);
          };

          return (
            <div
              key={`dl-${i}`}
              onClick={handleClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: s.bg,
                border: `1px solid ${s.border}22`,
                borderRadius: 8,
                cursor: isClickable ? "pointer" : "default",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (isClickable)
                  e.currentTarget.style.background = s.bg
                    .replace("0.1", "0.18")
                    .replace("0.08", "0.14");
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = s.bg;
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: s.dot,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f0" }}>
                  {dl.title}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {dl.source}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: s.text }}>
                {formatRelativeDate(dateStr)}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
