/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { parseDueDate } from "../../../lib/dashboard-helpers";
import { dueDateToMs } from "../../../lib/redesign-helpers";
import DeadlineDetailPopover from "../../dashboard/DeadlineDetailPopover";
import TimelineDetailRail from "../TimelineDetailRail.jsx";

const MAX_PILLS = 2;

const SOURCE_COLORS = {
  canvas: "#5A8FBF",
  manual: "#5A8FBF",
  todoist: "#e8776a",
};

function sourceOf(task) {
  return task?.source || "canvas";
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

function DeadlinesDetail({ selectedDay, viewYear, viewMonth, items }) {
  const [popover, setPopover] = useState(null);

  const incompleteCount = items.filter((t) => t.status !== "complete").length;

  const openPopover = (task, anchor) => {
    setPopover((prev) => {
      if (prev && String(prev.task?.id) === String(task?.id)) return null;
      return { task, anchor };
    });
  };

  const ordered = [...items].sort((a, b) => {
    const aMs = dueDateToMs(a.due_date, a.due_time) ?? Number.POSITIVE_INFINITY;
    const bMs = dueDateToMs(b.due_date, b.due_time) ?? Number.POSITIVE_INFINITY;
    if (aMs !== bMs) return aMs - bMs;
    const aComplete = a.status === "complete" ? 1 : 0;
    const bComplete = b.status === "complete" ? 1 : 0;
    if (aComplete !== bComplete) return aComplete - bComplete;
    return (a.title || "").localeCompare(b.title || "");
  });

  const railItems = ordered.map((task) => {
    const source = sourceOf(task);
    const sourceLabel = source === "todoist" ? "Todoist" : source === "canvas" ? "Canvas" : "CTM";
    const subtitle = task.class_name || task.project_name || sourceLabel;
    const metaParts = [];
    if (subtitle !== sourceLabel) metaParts.push(sourceLabel);
    if (task.status === "in_progress") metaParts.push("In progress");
    if (task.status === "complete") metaParts.push("Complete");

    return {
      id: `${source}-${task.id}`,
      timeLabel: task.due_time || "End of day",
      title: task.title || task.name || "Untitled",
      subtitle,
      meta: metaParts.join(" · "),
      dotColor: SOURCE_COLORS[source] || "rgba(255,255,255,0.3)",
      complete: task.status === "complete",
      onClick: (event) => openPopover(task, event.currentTarget),
    };
  });

  return (
    <>
      <TimelineDetailRail
        title={formatFullDate(viewYear, viewMonth, selectedDay)}
        summary={`${incompleteCount} open · ${items.length} total`}
        sections={[
          {
            id: "deadlines",
            label: "Chronological",
            items: railItems,
          },
        ]}
      />
      {popover && (
        <DeadlineDetailPopover
          task={popover.task}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
        />
      )}
    </>
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
  label: "Deadlines",
};

export default deadlinesView;
