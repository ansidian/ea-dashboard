/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { parseDueDate } from "../../../lib/dashboard-helpers";
import CTMCard from "../../ctm/CTMCard";
import ContextMenu from "../../ui/ContextMenu";
import AddTaskPanel from "../../todoist/AddTaskPanel";
import { useDashboard } from "../../../context/DashboardContext";

const MAX_PILLS = 2;

const SOURCE_COLORS = {
  canvas: "#5A8FBF",
  manual: "#5A8FBF",
  todoist: "#e8776a",
};

function sourceOf(task) {
  return task?.source || "canvas";
}

function openInNewTab(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildTaskMenu(task, { onEdit, onComplete, onStatusChange }) {
  const isTodoist = task.source === "todoist";
  const isCanvas = task.source === "canvas";
  const isComplete = task.status === "complete";

  if (isTodoist) {
    return [
      { label: "Edit task", onSelect: onEdit },
      !isComplete && { label: "Mark complete", onSelect: onComplete },
      { type: "separator" },
      task.url && { label: "Open in Todoist", onSelect: () => openInNewTab(task.url) },
    ].filter(Boolean);
  }

  const statusItems = [];
  if (task.status !== "incomplete") {
    statusItems.push({ label: "Mark incomplete", onSelect: () => onStatusChange("incomplete") });
  }
  if (task.status !== "in_progress") {
    statusItems.push({ label: "Mark in-progress", onSelect: () => onStatusChange("in_progress") });
  }
  if (task.status !== "complete") {
    statusItems.push({ label: "Mark complete", onSelect: () => onStatusChange("complete") });
  }

  const ctmUrl = `https://ctm.andysu.tech/#/event/${task.id}`;
  const openItems = [];
  if (isCanvas && task.url) {
    openItems.push({ label: "Open in Canvas", onSelect: () => openInNewTab(task.url) });
  }
  openItems.push({ label: "Open in CTM", onSelect: () => openInNewTab(ctmUrl) });

  return [...statusItems, { type: "separator" }, ...openItems];
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
                color: "rgba(205,214,244,0.55)",
                textDecoration: isComplete ? "line-through" : "none",
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
  const {
    expandedTask,
    setExpandedTask,
    handleCompleteTask,
    handleUpdateTaskStatus,
    handleUpdateTask,
  } = useDashboard();
  const [menuState, setMenuState] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  const incompleteCount = items.filter((t) => t.status !== "complete").length;

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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const source = sourceOf(item);
          return (
            <CTMCard
              key={`${source}-${item.id}`}
              task={item}
              expanded={expandedTask === item.id}
              onToggle={() =>
                setExpandedTask(expandedTask === item.id ? null : item.id)
              }
              onComplete={handleCompleteTask}
              onStatusChange={handleUpdateTaskStatus}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuState({
                  task: item,
                  x: e.clientX,
                  y: e.clientY,
                  rowEl: e.currentTarget,
                });
              }}
            />
          );
        })}
      </div>
      {editingTask && (
        <AddTaskPanel
          anchorRef={editingTask.anchorRef}
          editingTask={editingTask.task}
          onClose={() => setEditingTask(null)}
          onTaskUpdated={(task) => handleUpdateTask(task)}
        />
      )}
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          onClose={() => setMenuState(null)}
          items={buildTaskMenu(menuState.task, {
            onEdit: () => {
              const rowEl = menuState.rowEl;
              setEditingTask({
                task: menuState.task,
                anchorRef: { current: rowEl },
              });
            },
            onComplete: () => handleCompleteTask(menuState.task.id),
            onStatusChange: (status) =>
              handleUpdateTaskStatus(menuState.task.id, status),
          })}
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

  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 20px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 8,
        gap: 16,
        minHeight: 56,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <LegendDot color={SOURCE_COLORS.canvas} label="Canvas" />
        <LegendDot color={SOURCE_COLORS.todoist} label="Todoist" />
      </div>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        {isCurrentMonth && (
          <>
            <span style={{ color: "#cdd6f4", fontWeight: 600 }}>{dueToday}</span> due today
            <span style={{ color: "rgba(255,255,255,0.25)", margin: "0 8px" }}>·</span>
            <span style={{ color: "#cdd6f4", fontWeight: 600 }}>{dueThisWeek}</span> due this week
            <span style={{ color: "rgba(255,255,255,0.25)", margin: "0 8px" }}>·</span>
          </>
        )}
        <span style={{ color: "#cdd6f4", fontWeight: 600 }}>{total}</span> total this month
      </span>
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
