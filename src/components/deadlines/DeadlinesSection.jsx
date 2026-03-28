import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import Tooltip from "../shared/Tooltip";
import { urgencyStyles, formatRelativeDate, formatFullDate, parseDueDate } from "../../lib/dashboard-helpers";
import CTMCard from "../ctm/CTMCard";
import { useDashboard } from "../../context/DashboardContext";

export default function DeadlinesSection({ ctm, deadlines, loaded, delay, style, className }) {
  const {
    emailAccounts, expandedTask, setExpandedTask,
    setActiveAccount, setSelectedEmail,
  } = useDashboard();
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
    <Section title="Deadlines" delay={delay} loaded={loaded} style={style} className={className}>
      <div className="bg-surface border border-border rounded-lg p-4 px-5 mb-3">
        <div className="flex gap-4 items-baseline flex-wrap">
          <div>
            <span className="text-2xl font-semibold text-text-primary">
              {totalIncomplete}
            </span>
            <span className="text-xs text-text-muted ml-1.5">
              incomplete
            </span>
          </div>
          <div>
            <span className="text-2xl font-semibold" style={{ color: "#fca5a5" }}>
              {totalDueToday}
            </span>
            <span className="text-xs text-text-muted ml-1.5">
              due today
            </span>
          </div>
          {ctmDueThisWeek > 0 && (
            <div>
              <span className="text-2xl font-semibold" style={{ color: "#fcd34d" }}>
                {ctmDueThisWeek}
              </span>
              <span className="text-xs text-text-muted ml-1.5">
                this week
              </span>
            </div>
          )}
          {ctmItems.length > 0 && (
            <div className="ml-auto">
              <a
                href="https://ctm.andysu.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium no-underline transition-all duration-200 text-[#a78bfa] bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.15)] hover:bg-[rgba(167,139,250,0.18)] hover:border-[rgba(167,139,250,0.35)] hover:-translate-y-px cursor-pointer"
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
      <div className="flex flex-col gap-1.5">
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
              role="button"
              tabIndex={0}
              className={cn(
                "flex items-center gap-3 py-3 px-4 rounded transition-all duration-150",
                isClickable ? "cursor-pointer hover:brightness-125" : "cursor-default",
              )}
              style={{
                background: s.bg,
                border: `1px solid ${s.border}22`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: s.dot }}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-text-body">
                  {dl.title}
                </div>
                <div className="text-[11px] text-text-muted">
                  {dl.source}
                </div>
              </div>
              <Tooltip text={formatFullDate(dateStr)}>
                <div className="text-xs font-semibold" style={{ color: s.text }}>
                  {formatRelativeDate(dateStr)}
                </div>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
