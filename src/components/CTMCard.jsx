import { todayPacific, toPacificDate } from "../lib/dashboard-helpers";
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
    <div onClick={onToggle} className={`ctm-card-root ctm-card--${urg}`}>
      <div className="ctm-card-layout">
        <div className="ctm-card-color-bar" style={{ background: task.class_color }} />
        <div className="ctm-card-content">
          <div className="ctm-card-header">
            <span className="ctm-card-class" style={{ color: task.class_color }}>{task.class_name}</span>
            <span className={`ctm-card-source ctm-card-source--${isCanvas ? "canvas" : "todoist"}`}>
              {isCanvas ? "Canvas" : "Todoist"}
            </span>
          </div>
          <div className="ctm-card-title">{task.title}</div>
          {expanded && (
            <div className="ctm-card-expanded">
              {task.description && <div className="ctm-desc" dangerouslySetInnerHTML={{ __html: task.description }} />}
              <div className="ctm-card-actions">
                {task.url && (
                  <a
                    href={task.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="ctm-card-link"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Open in {task.source === "todoist" ? "Todoist" : "Canvas"}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="ctm-card-meta">
          <div className="ctm-card-days">{daysLabel}</div>
          <div className="ctm-card-time">{task.due_time}</div>
          {task.points_possible && (
            <div className="ctm-card-points">{task.points_possible} pts</div>
          )}
        </div>
      </div>
    </div>
  );
}
