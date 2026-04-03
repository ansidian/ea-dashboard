import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import Tooltip from "../shared/Tooltip";
import { urgencyStyles, formatRelativeDate, formatFullDate, parseDueDate } from "../../lib/dashboard-helpers";
import CTMCard from "../ctm/CTMCard";
import { MotionList, MotionItem } from "../ui/motion-wrappers";
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
    <Section
      title="Deadlines"
      delay={delay}
      loaded={loaded}
      style={style}
      className={className}
      summaryBadge={totalDueToday > 0 ? `${totalDueToday} due today` : `${totalIncomplete} total`}
      defaultExpanded={false}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <div
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
          style={{ background: "rgba(205,214,244,0.04)", border: "1px solid rgba(205,214,244,0.08)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(205,214,244,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span className="text-[11px] max-sm:text-xs font-semibold tabular-nums text-foreground/80">{totalIncomplete}</span>
          <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">incomplete</span>
        </div>
        {totalDueToday > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(243,139,168,0.06)", border: "1px solid rgba(243,139,168,0.12)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f38ba8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[11px] max-sm:text-xs font-semibold tabular-nums" style={{ color: "#f38ba8cc" }}>{totalDueToday}</span>
            <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">due today</span>
          </div>
        )}
        {ctmDueThisWeek > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(249,226,175,0.05)", border: "1px solid rgba(249,226,175,0.1)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="text-[11px] max-sm:text-xs font-semibold tabular-nums" style={{ color: "#f9e2afcc" }}>{ctmDueThisWeek}</span>
            <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">this week</span>
          </div>
        )}
        {ctmItems.length > 0 && (
          <a
            href="https://ctm.andysu.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] max-sm:text-xs font-medium no-underline transition-all duration-200 ml-auto max-sm:hidden"
            style={{
              color: "#cba6dacc",
              background: "rgba(203,166,218,0.06)",
              border: "1px solid rgba(203,166,218,0.12)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(203,166,218,0.12)"; e.currentTarget.style.borderColor = "rgba(203,166,218,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(203,166,218,0.06)"; e.currentTarget.style.borderColor = "rgba(203,166,218,0.12)"; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
            CTM
          </a>
        )}
      </div>
      <MotionList className="flex flex-col gap-1.5" loaded={loaded} delay={delay + 100} stagger={0.04}>
        {allItems.map((item, i) => {
          if (item._type === "ctm") {
            return (
              <MotionItem key={`ctm-${item.id}`}>
                <CTMCard
                  task={item}
                  expanded={expandedTask === item.id}
                  onToggle={() =>
                    setExpandedTask(expandedTask === item.id ? null : item.id)
                  }
                />
              </MotionItem>
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
            <MotionItem
              key={`dl-${i}`}
              onClick={handleClick}
              role="button"
              tabIndex={0}
              className={cn(
                "group relative flex items-center gap-3 py-3 px-4 pl-5 rounded-lg transition-all duration-150",
                isClickable ? "cursor-pointer" : "cursor-default",
              )}
              style={{
                background: s.bg,
                border: `1px solid ${s.border}15`,
              }}
            >
              {/* Color accent bar */}
              <div
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                style={{
                  background: s.dot,
                  opacity: 0.7,
                  boxShadow: `0 0 6px ${s.dot}30`,
                }}
              />

              {/* Hover bg */}
              {isClickable && (
                <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />
              )}

              <div className="relative flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground/90 truncate">
                  {dl.title}
                </div>
                {dl.source && (
                  <div className="text-[10px] max-sm:text-xs text-muted-foreground/40 mt-0.5">
                    {dl.source}
                  </div>
                )}
              </div>
              <Tooltip text={formatFullDate(dateStr)}>
                <div className="relative text-[11px] max-sm:text-xs font-semibold tabular-nums" style={{ color: s.text }}>
                  {formatRelativeDate(dateStr)}
                </div>
              </Tooltip>
            </MotionItem>
          );
        })}
      </MotionList>
    </Section>
  );
}
