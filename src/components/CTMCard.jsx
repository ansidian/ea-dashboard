import "./CTMCard.css";

// Urgency color palette — referenced by BillBadge (Plan 02) and future components
// eslint-disable-next-line no-unused-vars
const urgencyStyles = {
  high: { bg: "rgba(239,68,68,0.1)", border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  medium: { bg: "rgba(245,158,11,0.08)", border: "#f59e0b", text: "#fcd34d", dot: "#f59e0b" },
  low: { bg: "rgba(107,114,128,0.08)", border: "#6b7280", text: "#9ca3af", dot: "#6b7280" },
};

function parseDueDate(dateStr) {
  // Handle both "2026-03-30" and "2026-03-30T06:59:59Z" formats
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDueDate(dateStr);
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `${diff} days`;
}

function getDueUrgency(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDueDate(dateStr);
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
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
                    Open in Canvas
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
