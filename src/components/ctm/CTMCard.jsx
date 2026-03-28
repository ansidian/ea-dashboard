import { cn } from "@/lib/utils";
import { todayPacific, toPacificDate, formatFullDate } from "../../lib/dashboard-helpers";
import Tooltip from "../shared/Tooltip";
import "./CTMCard.css";

function getDaysUntil(dateStr) {
  const todayStr = todayPacific();
  const dueStr = toPacificDate(dateStr);
  const diff = Math.round((new Date(dueStr + "T12:00:00") - new Date(todayStr + "T12:00:00")) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `${diff} days`;
}

function getDueUrgency(dateStr) {
  const todayStr = todayPacific();
  const dueStr = toPacificDate(dateStr);
  const diff = Math.round((new Date(dueStr + "T12:00:00") - new Date(todayStr + "T12:00:00")) / 86400000);
  if (diff <= 0) return "high";
  if (diff <= 2) return "medium";
  return "low";
}

export default function CTMCard({ task, expanded, onToggle }) {
  const daysLabel = getDaysUntil(task.due_date);
  const urg = getDueUrgency(task.due_date);
  const isCanvas = task.source === "canvas";

  return (
    <div
      onClick={onToggle}
      role="button"
      tabIndex={0}
      className="bg-surface border border-border rounded-lg p-4 px-5 cursor-pointer transition-all duration-150 hover:bg-surface-hover"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-1 h-10 rounded-xs shrink-0 mt-0.5"
          style={{ background: task.class_color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium" style={{ color: task.class_color }}>{task.class_name}</span>
            <span
              className={cn(
                "text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-sm",
                isCanvas
                  ? "text-orange bg-orange/10"
                  : "text-[#a78bfa] bg-[rgba(167,139,250,0.1)]"
              )}
            >
              {isCanvas ? "Canvas" : "Todoist"}
            </span>
          </div>
          <div className="text-sm font-medium text-text-body mt-0.5">{task.title}</div>
          {expanded && (
            <div className="animate-[fadeIn_0.2s_ease] mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
              {task.description && <div className="ctm-desc" dangerouslySetInnerHTML={{ __html: task.description }} />}
              <div className="flex gap-2 mt-3">
                {task.url && (
                  <a
                    href={task.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-accent-light inline-flex items-center gap-1 no-underline bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)] py-1.5 px-3 rounded-md font-medium transition-all duration-200 hover:bg-[rgba(99,102,241,0.18)] hover:border-[rgba(99,102,241,0.35)] hover:-translate-y-px"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Open in {task.source === "todoist" ? "Todoist" : "Canvas"}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <Tooltip text={formatFullDate(task.due_date)}>
            <div
              className={cn(
                "text-xs font-semibold",
                urg === "high" && "text-[#fca5a5]",
                urg === "medium" && "text-[#fcd34d]",
                urg === "low" && "text-[#9ca3af]"
              )}
            >{daysLabel}</div>
          </Tooltip>
          <div className="text-[11px] text-text-muted mt-0.5">{task.due_time}</div>
          {task.points_possible && (
            <div className="text-[10px] font-semibold text-text-secondary mt-1 bg-surface-hover px-1.5 py-0.5 rounded-sm">
              {task.points_possible} pts
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
