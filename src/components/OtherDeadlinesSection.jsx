import Section from "./Section";
import { urgencyStyles, formatRelativeDate } from "../lib/dashboard-helpers";

export default function OtherDeadlinesSection({
  deadlines, ctm, emailAccounts,
  setExpandedTask, setActiveAccount, setSelectedEmail,
  ctmSectionRef, loaded, delay,
}) {
  if (!deadlines?.length) return null;

  return (
    <Section title="Other Deadlines" delay={delay} loaded={loaded}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {deadlines.map((dl, i) => {
          const dateStr = dl.due_date || dl.due;
          const s = urgencyStyles[dl.urgency] || urgencyStyles.low;
          const ctmMatch =
            (dl.source === "canvas" || dl.type === "academic") && !dl.email_id
              ? (ctm?.upcoming || []).find(
                  (t) => dl.title.includes(t.title) || t.title.includes(dl.title),
                )
              : null;
          const isClickable = !!(dl.email_id || ctmMatch);
          const handleDeadlineClick = () => {
            if (ctmMatch) {
              setExpandedTask(ctmMatch.id);
              ctmSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
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
              key={i}
              onClick={handleDeadlineClick}
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
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#e2e8f0",
                  }}
                >
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
