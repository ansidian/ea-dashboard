import Section from "../layout/Section";
import { MotionList, MotionItem } from "../ui/motion-wrappers";

function formatAmount(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function daysLabel(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
}

function urgencyColor(days) {
  if (days === null) return { accent: "#6c7086", text: "rgba(205,214,244,0.5)", bg: "rgba(205,214,244,0.04)" };
  if (days < 0) return { accent: "#f38ba8", text: "#f38ba8", bg: "rgba(243,139,168,0.1)" };
  if (days === 0) return { accent: "#f97316", text: "#f97316", bg: "rgba(249,115,22,0.1)" };
  if (days === 1) return { accent: "#fab387", text: "#fab387", bg: "rgba(250,179,135,0.1)" };
  if (days <= 3) return { accent: "#f9e2af", text: "#f9e2afcc", bg: "rgba(249,226,175,0.08)" };
  return { accent: "#a6e3a1", text: "rgba(205,214,244,0.5)", bg: "rgba(205,214,244,0.04)" };
}

export default function UpcomingBillsSection({ bills, loaded, delay, className }) {
  if (!bills?.length) return null;

  const dueToday = bills.filter(b => b.isDueToday);
  const overdue = bills.filter(b => b.isOverdue);
  const totalAmount = bills.reduce((sum, b) => sum + (b.amount || 0), 0);

  return (
    <Section title="Upcoming Bills" delay={delay} loaded={loaded} className={className}>
      {/* Header stats */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <div
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
          style={{ background: "rgba(180,190,254,0.06)", border: "1px solid rgba(180,190,254,0.12)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b4befe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#b4befedd" }}>
            {bills.length}
          </span>
          <span className="text-[11px] text-muted-foreground/50">
            bill{bills.length !== 1 ? "s" : ""} this week
          </span>
        </div>
        {totalAmount > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(205,214,244,0.04)", border: "1px solid rgba(205,214,244,0.08)" }}
          >
            <span className="text-[11px] font-semibold tabular-nums text-foreground/80">
              {formatAmount(totalAmount)}
            </span>
            <span className="text-[11px] text-muted-foreground/40">total</span>
          </div>
        )}
        {(dueToday.length > 0 || overdue.length > 0) && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{
              background: overdue.length ? "rgba(243,139,168,0.08)" : "rgba(249,115,22,0.08)",
              border: `1px solid ${overdue.length ? "rgba(243,139,168,0.15)" : "rgba(249,115,22,0.15)"}`,
            }}
          >
            <span
              className="text-[11px] font-semibold"
              style={{ color: overdue.length ? "#f38ba8" : "#f97316" }}
            >
              {overdue.length > 0 ? `${overdue.length} overdue` : `${dueToday.length} due today`}
            </span>
          </div>
        )}
      </div>

      <MotionList className="flex flex-col gap-1.5" loaded={loaded} delay={delay + 100} stagger={0.04}>
        {bills.map((bill) => {
          const days = daysUntil(bill.next_date);
          const uc = urgencyColor(days);

          return (
            <MotionItem key={bill.id}>
              <div
                className="relative rounded-lg py-3 px-4 pl-5 transition-all duration-150"
                style={{
                  background: days !== null && days <= 1
                    ? `${uc.accent}0a`
                    : "rgba(36,36,58,0.4)",
                  border: days !== null && days <= 1
                    ? `1px solid ${uc.accent}20`
                    : "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Urgency accent bar */}
                <div
                  className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                  style={{ background: uc.accent, opacity: 0.7, boxShadow: `0 0 6px ${uc.accent}30` }}
                />

                <div className="flex justify-between items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground/90">
                      {bill.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {bill.payee && bill.payee !== bill.name && (
                        <span className="text-[11px] text-muted-foreground/40">{bill.payee}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground/50">
                        Due {formatDate(bill.next_date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded"
                      style={{ color: uc.text, background: uc.bg }}
                    >
                      {days !== null ? daysLabel(days) : ""}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-foreground/80">
                      {formatAmount(bill.amount)}
                    </span>
                  </div>
                </div>
              </div>
            </MotionItem>
          );
        })}
      </MotionList>

      <div className="text-[10px] text-muted-foreground/30 mt-2 text-right">
        From Actual Budget
      </div>
    </Section>
  );
}
