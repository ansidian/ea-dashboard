/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { Circle, CircleDashed, CheckCircle2 } from "lucide-react";
import { parseDueDate } from "../../../lib/dashboard-helpers";
import DeadlineDetailPopover from "../../dashboard/DeadlineDetailPopover";

const MAX_PILLS = 2;

const SOURCE_COLORS = {
  canvas: "#5A8FBF",
  manual: "#5A8FBF",
  todoist: "#e8776a",
};

function sourceOf(task) {
  return task?.source || "canvas";
}

function DeadlineStatusIcon({ status, size = 12 }) {
  if (status === "complete") return <CheckCircle2 size={size} color="#a6e3a1" />;
  if (status === "in_progress") return <CircleDashed size={size} color="#89dceb" />;
  return <Circle size={size} color="rgba(205,214,244,0.45)" />;
}

function compute({ data, viewYear, viewMonth }) {
  const ctmItems = data?.ctm?.upcoming || [];
  const todoistItems = data?.todoist?.upcoming || [];
  const all = [...ctmItems, ...todoistItems];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const itemsByDay = {};
  let earliestOverdue = null;
  for (const t of all) {
    if (!t.due_date) continue;
    const d = parseDueDate(t.due_date);
    if (isNaN(d.getTime())) continue;

    if (t.status !== "complete" && d < today) {
      if (!earliestOverdue || d < earliestOverdue) earliestOverdue = d;
    }

    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
    const day = d.getDate();
    if (!itemsByDay[day]) itemsByDay[day] = [];
    itemsByDay[day].push(t);
  }

  // Sort each day's items: incomplete first, then by due_date asc
  for (const day of Object.keys(itemsByDay)) {
    itemsByDay[day].sort((a, b) => {
      const aComplete = a.status === "complete" ? 1 : 0;
      const bComplete = b.status === "complete" ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;
      return (a.due_date || "").localeCompare(b.due_date || "");
    });
  }

  return { itemsByDay, earliestOverdue };
}

function canNavigateBack({ viewYear, viewMonth, currentYear, currentMonth, computed }) {
  const currentIdx = currentYear * 12 + currentMonth;
  const viewIdx = viewYear * 12 + viewMonth;
  // Future months: always allow returning toward the current month.
  if (viewIdx > currentIdx) return true;
  // At/before current month: floor is the earliest overdue month (if any).
  const earliest = computed?.earliestOverdue;
  if (!earliest) return false;
  const earliestIdx = earliest.getFullYear() * 12 + earliest.getMonth();
  return viewIdx > earliestIdx;
}

function hasOverdue(items) {
  // "overdue" styling only meaningful for items not yet complete — de-emphasize
  return items.some((t) => t.status !== "complete" && t._overdueHint);
}

function allComplete(items) {
  return items.length > 0 && items.every((t) => t.status === "complete");
}

function renderCellContents({ items }) {
  return (
    <>
      {items.slice(0, MAX_PILLS).map((t) => {
        const source = sourceOf(t);
        const dot = SOURCE_COLORS[source] || "rgba(255,255,255,0.3)";
        const isComplete = t.status === "complete";
        return (
          <div
            key={`${source}-${t.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              marginTop: 3,
              minWidth: 0,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dot,
                opacity: isComplete ? 0.4 : 0.9,
                boxShadow: isComplete ? "none" : `0 0 4px ${dot}60`,
              }}
            />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                color: isComplete ? "rgba(205,214,244,0.35)" : "rgba(205,214,244,0.55)",
              }}
            >
              {t.title || t.name || "Untitled"}
            </span>
          </div>
        );
      })}
      {items.length > MAX_PILLS && (
        <div style={{ fontSize: 10, color: "rgba(203,166,218,0.6)", marginTop: 2 }}>
          +{items.length - MAX_PILLS} more
        </div>
      )}
    </>
  );
}

function formatFullDate(year, month, day) {
  const d = new Date(year, month, day);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function DeadlineDetailRow({ task, onOpen }) {
  const isComplete = task.status === "complete";
  const source = sourceOf(task);
  const dot = SOURCE_COLORS[source] || "rgba(255,255,255,0.3)";
  const sourceLabel = source === "todoist" ? "Todoist" : source === "canvas" ? "Canvas" : "CTM";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onOpen(task, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task, e.currentTarget);
        }
      }}
      style={{
        display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 10, alignItems: "center",
        padding: "9px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer", transition: "background 150ms",
        opacity: isComplete ? 0.55 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <DeadlineStatusIcon status={task.status} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12, color: "#cdd6f4", fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            marginBottom: 2,
            textDecoration: isComplete ? "line-through" : "none",
            textDecorationColor: "rgba(205,214,244,0.35)",
          }}
        >
          {task.title || task.name || "Untitled"}
        </div>
        <div
          style={{
            fontSize: 10.5, color: "rgba(205,214,244,0.45)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%", background: dot,
              opacity: 0.85, flexShrink: 0,
            }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.class_name || task.project_name || sourceLabel}
          </span>
        </div>
      </div>
      {task.due_time && (
        <div
          style={{
            fontSize: 10.5, color: "rgba(205,214,244,0.55)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {task.due_time}
        </div>
      )}
    </div>
  );
}

function DeadlinesDetail({ selectedDay, viewYear, viewMonth, items }) {
  const [popover, setPopover] = useState(null);

  const incompleteCount = items.filter((t) => t.status !== "complete").length;

  const openPopover = (task, anchor) => {
    setPopover((prev) => {
      if (prev && String(prev.task?.id) === String(task?.id)) return null;
      return { task, anchor };
    });
  };

  return (
    <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: "#cba6da", fontWeight: 500 }}>
          {formatFullDate(viewYear, viewMonth, selectedDay)}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {incompleteCount} open · {items.length} total
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((item) => (
          <DeadlineDetailRow
            key={`${sourceOf(item)}-${item.id}`}
            task={item}
            onOpen={openPopover}
          />
        ))}
      </div>
      {popover && (
        <DeadlineDetailPopover
          task={popover.task}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

function renderDetail(props) {
  return <DeadlinesDetail {...props} />;
}

function renderFooter({ viewYear, viewMonth, currentYear, currentMonth, todayDate, itemsByDay, data }) {
  const total = Object.values(itemsByDay).reduce((sum, arr) => sum + arr.length, 0);
  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;

  let dueToday = 0;
  let dueThisWeek = 0;
  if (isCurrentMonth) {
    const allItems = [
      ...(data?.ctm?.upcoming || []),
      ...(data?.todoist?.upcoming || []),
    ];
    const today = new Date(currentYear, currentMonth, todayDate);
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Sunday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    for (const t of allItems) {
      if (t.status === "complete" || !t.due_date) continue;
      const d = new Date(t.due_date + "T00:00:00");
      if (isNaN(d.getTime())) continue;
      if (d.getTime() === today.getTime()) dueToday++;
      if (d >= weekStart && d <= weekEnd) dueThisWeek++;
    }
  }

  // Stacks rows vertically — designed for the narrow (340px) side rail in
  // the redesigned CalendarModal. Big-number left, label right.
  const StatRow = ({ value, label }) => (
    <div
      style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ fontSize: 11, color: "rgba(205,214,244,0.55)" }}>{label}</span>
      <span
        style={{
          fontSize: 18, fontWeight: 500, color: "#fff",
          fontVariantNumeric: "tabular-nums", letterSpacing: -0.2,
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 10,
        display: "flex", flexDirection: "column", gap: 2,
      }}
    >
      {isCurrentMonth && <StatRow value={dueToday} label="Due today" />}
      {isCurrentMonth && <StatRow value={dueThisWeek} label="Due this week" />}
      <StatRow value={total} label="Total this month" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 10 }}>
        <LegendDot color={SOURCE_COLORS.canvas} label="Canvas" />
        <LegendDot color={SOURCE_COLORS.todoist} label="Todoist" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}60`,
        }}
      />
      {label}
    </span>
  );
}

const deadlinesView = {
  compute,
  canNavigateBack,
  hasOverdue,
  allComplete,
  renderCellContents,
  renderDetail,
  renderFooter,
  HeaderExtras: null,
};

export default deadlinesView;
