import { useState } from "react";
import { cn } from "@/lib/utils";
import useIsMobile from "../../hooks/useIsMobile";
import SummaryModal from "./SummaryModal";

export default function SummaryBar({ stats, loaded, urgentEmails, deadlinesToday, billsDueToday, modalContent }) {
  const isMobile = useIsMobile();
  const [activeBadge, setActiveBadge] = useState(null);

  // auto-close when actioned items empty the list
  const activeCount = activeBadge === "emails" ? urgentEmails?.length
    : activeBadge === "deadlines" ? deadlinesToday?.length
    : activeBadge === "bills" ? billsDueToday?.length
    : 0;
  if (activeBadge && activeCount === 0) {
    // schedule close on next tick to avoid setState during render
    queueMicrotask(() => setActiveBadge(null));
  }

  if (!stats) return null;

  const items = [
    stats.urgentEmails > 0 && {
      badgeKey: "emails",
      color: "#f38ba8",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      ),
      value: stats.urgentEmails,
      label: `email${stats.urgentEmails !== 1 ? "s" : ""} need${stats.urgentEmails !== 1 ? "" : "s"} action`,
    },
    stats.billsDueToday > 0 && {
      badgeKey: "bills",
      color: "#a6e3a1",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
      value: stats.billsDueToday,
      label: `bill${stats.billsDueToday !== 1 ? "s" : ""} due today`,
    },
    stats.dueToday > 0 && {
      badgeKey: "deadlines",
      color: "#fab387",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
      value: stats.dueToday,
      label: "due today",
    },
    stats.events > 0 && {
      color: "#89b4fa",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      value: stats.events,
      label: `event${stats.events !== 1 ? "s" : ""}`,
    },
    stats.temp != null && {
      color: "#f9e2af",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z" />
        </svg>
      ),
      value: `${stats.temp}°`,
      label: null,
    },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-wrap max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[-webkit-overflow-scrolling:touch] mb-6 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] delay-150",
        loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      {items.map((item, i) => {
        const clickable = !isMobile && item.badgeKey;
        return (
        <div
          key={i}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => setActiveBadge(item.badgeKey) : undefined}
          onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveBadge(item.badgeKey); } } : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 max-sm:shrink-0 transition-all duration-150",
            clickable && "cursor-pointer badge-clickable hover:scale-[1.03] active:scale-[0.97]",
          )}
          style={{
            background: `${item.color}08`,
            border: `1px solid ${item.color}${clickable ? "20" : "15"}`,
            boxShadow: clickable ? `0 0 0 0 ${item.color}00` : undefined,
            "--badge-color": clickable ? item.color : undefined,
          }}
        >
          <span style={{ color: `${item.color}99` }}>{item.icon}</span>
          <span
            className="text-[11px] max-sm:text-xs font-semibold tabular-nums"
            style={{ color: `${item.color}cc` }}
          >
            {item.value}
          </span>
          {item.label && (
            <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">
              {item.label}
            </span>
          )}
          {item.suffix && (
            <span
              className="text-[10px] max-sm:text-xs font-medium tabular-nums ml-0.5"
              style={{ color: `${item.color}80` }}
            >
              {item.suffix}
            </span>
          )}
        </div>
        );
      })}
      {activeBadge && modalContent?.[activeBadge] && (
        <SummaryModal
          badgeType={activeBadge}
          title={
            activeBadge === "emails" ? "Emails Needing Action"
              : activeBadge === "deadlines" ? "Due Today"
              : "Bills Due Today"
          }
          onClose={() => setActiveBadge(null)}
        >
          {modalContent[activeBadge](() => setActiveBadge(null))}
        </SummaryModal>
      )}
    </div>
  );
}
