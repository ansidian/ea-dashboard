import { todayPacific, toPacificDate, formatFullDate } from "../../lib/dashboard-helpers";
import Tooltip from "../shared/Tooltip";
import { MotionExpand, MotionChevron } from "../ui/motion-wrappers";
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
  const urgColor = { high: "#f38ba8", medium: "#f9e2af", low: "#a6adc8" }[urg];

  return (
    <div
      onClick={onToggle}
      role="button"
      tabIndex={0}
      className="group relative rounded-lg p-4 px-5 pl-5 cursor-pointer transition-all duration-150"
      style={{
        background: "rgba(36,36,58,0.5)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Hover bg */}
      <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />

      {/* Color accent bar — full height */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{
          background: task.class_color,
          boxShadow: `0 0 8px ${task.class_color}30`,
        }}
      />

      <div className="relative flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium" style={{ color: task.class_color }}>{task.class_name}</span>
            <span
              className="text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded"
              style={{
                color: isCanvas ? "#fab387cc" : "#cba6dacc",
                background: isCanvas ? "rgba(250,179,135,0.08)" : "rgba(203,166,218,0.08)",
              }}
            >
              {isCanvas ? "Canvas" : "Todoist"}
            </span>
          </div>
          <div className="text-[13px] font-medium text-foreground/90 mt-0.5">{task.title}</div>
          <MotionExpand isOpen={expanded}>
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              {task.description && <div className="ctm-desc" dangerouslySetInnerHTML={{ __html: task.description }} />}
              <div className="flex gap-2 mt-3">
                {task.url && (
                  <a
                    href={task.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[11px] inline-flex items-center gap-1.5 no-underline py-1.5 px-3 rounded-md font-medium transition-all duration-200 hover:-translate-y-px"
                    style={{
                      color: `${task.class_color}cc`,
                      background: `${task.class_color}0d`,
                      border: `1px solid ${task.class_color}20`,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                    Open in {task.source === "todoist" ? "Todoist" : "Canvas"}
                  </a>
                )}
              </div>
            </div>
          </MotionExpand>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          <div className="text-right">
            <Tooltip text={formatFullDate(task.due_date)}>
              <div
                className="text-[11px] font-semibold tabular-nums"
                style={{ color: urgColor }}
              >{daysLabel}</div>
            </Tooltip>
            <div className="text-[10px] text-muted-foreground/40 mt-0.5">{task.due_time}</div>
            {task.points_possible && (
              <div
                className="text-[9px] font-semibold mt-1.5 px-1.5 py-0.5 rounded tabular-nums"
                style={{
                  color: `${task.class_color}aa`,
                  background: `${task.class_color}0d`,
                }}
              >
                {task.points_possible} pts
              </div>
            )}
          </div>
          <MotionChevron isOpen={expanded} className="text-muted-foreground/40 mt-1" />
        </div>
      </div>
    </div>
  );
}
