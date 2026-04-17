import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X, CornerDownLeft } from "lucide-react";
import {
  getTodoistProjects,
  getTodoistLabels,
  createTodoistTask,
  updateTodoistTask,
} from "../../api";

// --- Token parsing (regex + guardrails) ---

// Priority: !1-!4 or bare ! (defaults to P1)
const PRIORITY_RE = /(?:^|\s)(!([1-4])?)(?:\s|$)/;
const PROJECT_RE = /#(\w+)/g;
const LABEL_RE = /@(\w+)/g;

// --- Date parsing + formatting ---

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

// Patterns that capture the full date+time phrase (time before or after date)
const DATE_TIME_PATTERNS = [
  // "today at 8am", "today 8am", "tomorrow 2:30pm", "tonight at 9pm"
  { re: /\b(today|tonight|tomorrow)(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, type: "relative_time" },
  // "8am today", "2pm tomorrow"
  { re: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?:\s+)(today|tonight|tomorrow)\b/i, type: "time_relative" },
  // "next monday 6pm", "next friday at 2pm"
  { re: /\b(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, type: "next_day_time" },
  // "6pm next monday"
  { re: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i, type: "time_next_day" },
  // "monday 3pm", "friday at 8am"
  { re: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, type: "day_time" },
  // "3pm monday"
  { re: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: "time_day" },
  // Simple date words (no time)
  { re: /\b(today)\b/i, type: "today" },
  { re: /\b(tonight)\b/i, type: "tonight" },
  { re: /\b(tomorrow)\b/i, type: "tomorrow" },
  { re: /\b(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i, type: "next_day" },
  { re: /\b(next\s+week)\b/i, type: "next_week" },
  { re: /\b(this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i, type: "this_day" },
  { re: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: "day" },
  { re: /\b(in\s+\d+\s+(?:days?|weeks?|months?))\b/i, type: "in_duration" },
  // "apr 29 at 9am", "apr 29 9am", "apr 29, 2026 at 9am"
  { re: /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:\s*,?\s*\d{4})?)(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, type: "month_day_time" },
  // "9am apr 29"
  { re: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:\s*,?\s*\d{4})?)\b/i, type: "time_month_day" },
  { re: /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:\s*,?\s*\d{4})?)\b/i, type: "month_day" },
  { re: /\b(\d{4}-\d{2}-\d{2})\b/, type: "iso" },
  // Bare time with no date — assumes today: "2pm", "8:30am"
  { re: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, type: "bare_time" },
];

function parseTime(timeStr) {
  const m = timeStr.match(TIME_RE);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  return { hour, minute };
}

function formatTime(time) {
  if (!time) return "";
  let h = time.hour;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return time.minute ? `${h}:${String(time.minute).padStart(2, "0")} ${ampm}` : `${h} ${ampm}`;
}

function getNextDayOfWeek(dayName, fromDate) {
  const target = DAYS.indexOf(dayName.toLowerCase());
  if (target < 0) return fromDate;
  const d = new Date(fromDate);
  const current = d.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function resolveDate(input) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const { re, type } of DATE_TIME_PATTERNS) {
    const m = input.match(re);
    if (!m) continue;

    let date = null;
    let time = null;
    const phrase = m[0];

    switch (type) {
      case "relative_time": {
        const word = m[1].toLowerCase();
        date = word === "tomorrow" ? new Date(today.getTime() + 86400000) : new Date(today);
        time = parseTime(m[2]);
        if (word === "tonight" && !time) time = { hour: 21, minute: 0 };
        break;
      }
      case "time_relative": {
        const word = m[2].toLowerCase();
        date = word === "tomorrow" ? new Date(today.getTime() + 86400000) : new Date(today);
        time = parseTime(m[1]);
        if (word === "tonight" && !time) time = { hour: 21, minute: 0 };
        break;
      }
      case "next_day_time": {
        const dayWord = m[1].replace(/^next\s+/i, "");
        date = getNextDayOfWeek(dayWord, today);
        time = parseTime(m[2]);
        break;
      }
      case "time_next_day": {
        const dayWord = m[2].replace(/^next\s+/i, "");
        date = getNextDayOfWeek(dayWord, today);
        time = parseTime(m[1]);
        break;
      }
      case "day_time": {
        date = getNextDayOfWeek(m[1], today);
        time = parseTime(m[2]);
        break;
      }
      case "time_day": {
        date = getNextDayOfWeek(m[2], today);
        time = parseTime(m[1]);
        break;
      }
      case "today":
        date = new Date(today);
        break;
      case "tonight":
        date = new Date(today);
        time = { hour: 21, minute: 0 };
        break;
      case "tomorrow":
        date = new Date(today.getTime() + 86400000);
        break;
      case "next_day": {
        const dayWord = m[1].replace(/^next\s+/i, "");
        date = getNextDayOfWeek(dayWord, today);
        break;
      }
      case "next_week":
        date = new Date(today.getTime() + 7 * 86400000);
        break;
      case "this_day": {
        const dayWord = m[1].replace(/^this\s+/i, "");
        date = getNextDayOfWeek(dayWord, today);
        break;
      }
      case "day":
        date = getNextDayOfWeek(m[1], today);
        break;
      case "in_duration": {
        const dm = m[1].match(/in\s+(\d+)\s+(days?|weeks?|months?)/i);
        if (dm) {
          const n = parseInt(dm[1], 10);
          const unit = dm[2].toLowerCase().replace(/s$/, "");
          date = new Date(today);
          if (unit === "day") date.setDate(date.getDate() + n);
          else if (unit === "week") date.setDate(date.getDate() + n * 7);
          else if (unit === "month") date.setMonth(date.getMonth() + n);
        }
        break;
      }
      case "month_day":
      case "month_day_time":
      case "time_month_day": {
        const dateGroup = type === "time_month_day" ? m[2] : m[1];
        const timeGroup = type === "month_day_time" ? m[2] : type === "time_month_day" ? m[1] : null;
        const parts = dateGroup.match(/(\w+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i);
        if (parts) {
          const monthIdx = MONTHS_LONG.findIndex(mo => mo.startsWith(parts[1].toLowerCase()));
          if (monthIdx >= 0) {
            const year = parts[3] ? parseInt(parts[3], 10) : now.getFullYear();
            date = new Date(year, monthIdx, parseInt(parts[2], 10));
            // if date is in the past and no year specified, bump to next year
            if (!parts[3] && date < today) date.setFullYear(date.getFullYear() + 1);
          }
        }
        if (timeGroup) time = parseTime(timeGroup);
        break;
      }
      case "iso": {
        const [y, mo, d] = m[1].split("-").map(Number);
        date = new Date(y, mo - 1, d);
        break;
      }
      case "bare_time":
        date = new Date(today);
        time = parseTime(m[1]);
        break;
    }

    if (!date) continue;

    return { date, time, phrase };
  }

  return null;
}

function formatResolvedDate(resolved) {
  if (!resolved) return null;
  const { date, time } = resolved;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);

  let prefix;
  if (date.getTime() === today.getTime()) prefix = "Today";
  else if (date.getTime() === tomorrow.getTime()) prefix = "Tomorrow";
  else prefix = DAYS[date.getDay()].charAt(0).toUpperCase() + DAYS[date.getDay()].slice(1);

  const monthDay = `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
  const year = date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : "";
  const timeStr = time ? ` at ${formatTime(time)}` : "";

  if (prefix === "Today" || prefix === "Tomorrow") {
    return `${prefix}, ${monthDay}${year}${timeStr}`;
  }
  return `${prefix}, ${monthDay}${year}${timeStr}`;
}

function parseTokens(input, projects, labels) {
  const result = {
    priority: null,
    project: null,
    labels: [],
    datePhrase: null,
    dateFormatted: null,
    stripped: input,
  };

  // priority: ! = P1, !2 = P2, !3 = P3, !4 = P4
  const pm = input.match(PRIORITY_RE);
  if (pm) {
    result.priority = pm[2] ? parseInt(pm[2], 10) : 1;
    result.stripped = result.stripped.replace(
      pm[0],
      pm[0].startsWith(" ") ? " " : "",
    );
  }

  // project — match against known names (case-insensitive, startsWith)
  for (const m of input.matchAll(PROJECT_RE)) {
    const token = m[1].toLowerCase();
    const match = projects.find((p) => p.name.toLowerCase().startsWith(token));
    if (match) {
      result.project = match;
      result.stripped = result.stripped.replace(m[0], "");
    }
  }

  // labels — match against known names (case-insensitive, exact)
  for (const m of input.matchAll(LABEL_RE)) {
    const token = m[1].toLowerCase();
    const match = labels.find((l) => l.name.toLowerCase() === token);
    if (match && !result.labels.find((l) => l.id === match.id)) {
      result.labels.push(match);
      result.stripped = result.stripped.replace(m[0], "");
    }
  }

  // date phrase — resolve to actual date and format
  const resolved = resolveDate(result.stripped);
  if (resolved) {
    result.datePhrase = resolved.phrase;
    result.dateFormatted = formatResolvedDate(resolved);
    result.stripped = result.stripped.replace(resolved.phrase, "");
  }

  result.stripped = result.stripped.replace(/\s{2,}/g, " ").trim();
  return result;
}

// --- Priority display ---

function PriorityIndicator({ level }) {
  const colors = {
    1: "#f38ba8", // urgent
    2: "#f9e2af",
    3: "#89b4fa",
    4: "#a6adc8", // low
  };
  const color = colors[level] || colors[4];
  const litCount = 5 - level;
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 10,
            borderRadius: 2,
            background: color,
            opacity: i <= litCount ? 1 : 0.22,
          }}
        />
      ))}
      <span style={{ color, marginLeft: 4, fontSize: 11, fontWeight: 600 }}>
        P{level}
      </span>
    </span>
  );
}

// --- Dropdown ---

function Dropdown({
  label,
  value,
  options,
  onChange,
  renderOption,
  renderValue,
  color,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  const borderColor = color ? `${color}33` : "rgba(205,214,244,0.08)";
  const bgColor = color ? `${color}0d` : "rgba(205,214,244,0.04)";

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        style={{
          color: "rgba(205,214,244,0.4)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          color: color || "rgba(205,214,244,0.35)",
          transition: "all 0.2s",
        }}
      >
        <span>{renderValue ? renderValue(value) : value || "None"}</span>
        <ChevronDown size={12} style={{ opacity: 0.5 }} />
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#16161e",
            border: "1px solid rgba(205,214,244,0.12)",
            borderRadius: 8,
            maxHeight: 160,
            overflowY: "auto",
            zIndex: 10,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          }}
        >
          {options.map((opt, i) => (
            <div
              key={opt.id ?? opt.value ?? i}
              role="button"
              tabIndex={0}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onChange(opt);
                  setOpen(false);
                }
              }}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                cursor: "pointer",
                color: "#cdd6f4",
                borderBottom:
                  i < options.length - 1
                    ? "1px solid rgba(205,214,244,0.06)"
                    : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(205,214,244,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {renderOption ? renderOption(opt) : opt.name || opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Token autocomplete popover ---

function TokenAutocomplete({ cursorPos, input, items, type, onSelect }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef(null);

  // Find the active token being typed (# or @) based on cursor position
  const trigger = type === "project" ? "#" : "@";
  const textBeforeCursor = input.slice(0, cursorPos);
  const triggerIdx = textBeforeCursor.lastIndexOf(trigger);

  // Only show if trigger exists and there's no space between trigger and cursor
  const fragment =
    triggerIdx >= 0 ? textBeforeCursor.slice(triggerIdx + 1) : null;
  const isActive = fragment !== null && !/\s/.test(fragment);

  const filtered = useMemo(() => {
    if (!isActive) return [];
    const q = fragment.toLowerCase();
    return items
      .filter((item) => item.name.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [isActive, fragment, items]);

  // Clamp activeIdx to valid range
  const safeIdx = filtered.length
    ? Math.min(activeIdx, filtered.length - 1)
    : 0;

  // Keyboard navigation
  useEffect(() => {
    if (!filtered.length) return;
    function handleKey(e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[safeIdx]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(filtered[safeIdx], triggerIdx, cursorPos);
        }
      }
    }
    // Use capture phase so we intercept before the panel's Enter-to-submit
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [filtered, activeIdx, safeIdx, onSelect, triggerIdx, cursorPos]);

  if (!isActive || !filtered.length) return null;

  return (
    <div
      ref={listRef}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        marginTop: 4,
        background: "#16161e",
        border: "1px solid rgba(205,214,244,0.12)",
        borderRadius: 8,
        maxHeight: 160,
        overflowY: "auto",
        zIndex: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          padding: "4px 8px 2px",
          fontSize: 10,
          color: "rgba(205,214,244,0.3)",
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {type === "project" ? "Projects" : "Labels"}
      </div>
      {filtered.map((item, i) => (
        <div
          key={item.id}
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item, triggerIdx, cursorPos);
          }}
          onMouseEnter={() => setActiveIdx(i)}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
            color: type === "project" ? "#cba6da" : "#a6dac0",
            background:
              i === safeIdx ? "rgba(205,214,244,0.06)" : "transparent",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {type === "project" && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: item.color || "rgba(205,214,244,0.3)",
              }}
            />
          )}
          {item.name}
        </div>
      ))}
    </div>
  );
}

// --- Main panel ---

export default function AddTaskPanel({ anchorRef, onClose, onTaskAdded, editingTask, onTaskUpdated }) {
  const isEdit = !!editingTask;
  const [input, setInput] = useState(() => (editingTask?.title || ""));
  const [description, setDescription] = useState(() => (editingTask?.description || ""));
  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [manualProject, setManualProject] = useState(null);
  const [manualPriority, setManualPriority] = useState(
    editingTask?.priority ?? null,
  );
  // Seeded with name-keyed placeholders; resolved against the real label
  // list once it loads so ids match and LabelPicker dedupes correctly.
  const [manualLabels, setManualLabels] = useState(
    editingTask?.labels?.length
      ? editingTask.labels.map((name) => ({ id: `name:${name}`, name, color: "#cba6da" }))
      : null,
  );
  const [manualDue, setManualDue] = useState("");
  const [overrides, setOverrides] = useState(
    editingTask
      ? {
          project: false, // set true once the project list loads and we resolve a match
          priority: editingTask.priority != null,
          labels: !!editingTask.labels?.length,
          due: false, // seeded due is shown as an overlay, not as field text
        }
      : {},
  );

  // Format the editing task's current due date/time as a display string
  // that matches parsed.dateFormatted's style ("Tomorrow, Apr 11 at 8:00 AM").
  const seededDueDisplay = useMemo(() => {
    if (!editingTask?.due_date) return null;
    const [y, mo, d] = editingTask.due_date.split("-").map(Number);
    if (!y || !mo || !d) return null;
    const date = new Date(y, mo - 1, d);
    let time = null;
    if (editingTask.due_time) {
      const tm = editingTask.due_time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      if (tm) {
        let hour = parseInt(tm[1], 10);
        const minute = tm[2] ? parseInt(tm[2], 10) : 0;
        const ampm = tm[3].toLowerCase();
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        time = { hour, minute };
      }
    }
    return formatResolvedDate({ date, time });
  }, [editingTask?.due_date, editingTask?.due_time]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [pos, setPos] = useState(null);
  const [autocompleteType, setAutocompleteType] = useState(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(null);

  // Delayed close so the exit animation has time to play. Callers should
  // use requestClose() instead of onClose() directly so click-outside /
  // Escape / submit all go through the same 180ms fade.
  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 180);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);
  const inputRef = useRef(null);

  // Fetch projects and labels on mount
  useEffect(() => {
    getTodoistProjects()
      .then((list) => {
        // Inbox first, then the rest in the server order.
        const sorted = [...list].sort((a, b) => {
          if (a.isInbox) return -1;
          if (b.isInbox) return 1;
          return 0;
        });
        setProjects(sorted);
      })
      .catch(() => {});
    getTodoistLabels()
      .then(setLabels)
      .catch(() => {});
  }, []);

  // In edit mode, resolve the editing task's project once the project list loads.
  useEffect(() => {
    if (!editingTask || !projects.length || manualProject) return;
    const match = projects.find((p) => p.name === editingTask.class_name);
    if (match) {
      setManualProject(match);
      setOverrides((o) => ({ ...o, project: true }));
    }
  }, [editingTask, projects, manualProject]);

  // In edit mode, swap the name-keyed placeholder labels for real label
  // objects once the label list loads. Without this, LabelPicker can't
  // filter out labels the task already has.
  useEffect(() => {
    if (!editingTask || !labels.length) return;
    setManualLabels((prev) => {
      if (!prev?.length) return prev;
      const needsResolve = prev.some((l) => String(l.id).startsWith("name:"));
      if (!needsResolve) return prev;
      return prev.map((l) => {
        if (!String(l.id).startsWith("name:")) return l;
        const real = labels.find((x) => x.name === l.name);
        return real || l;
      });
    });
  }, [editingTask, labels]);

  // Parse tokens (debounced via useMemo since input is the only dep)
  const parsed = useMemo(
    () => parseTokens(input, projects, labels),
    [input, projects, labels],
  );

  // Resolved field values (manual overrides take precedence)
  const resolvedProject = overrides.project
    ? manualProject
    : parsed.project || null;
  const resolvedPriority = overrides.priority
    ? manualPriority
    : parsed.priority || null;
  const resolvedLabels = overrides.labels
    ? manualLabels
    : parsed.labels.length
      ? parsed.labels
      : [];
  const resolvedDue = overrides.due
    ? manualDue
    : parsed.datePhrase || manualDue;

  // Detect # or @ token being typed for autocomplete
  function handleInputChange(e) {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    setCursorPos(cursor);
    const before = val.slice(0, cursor);
    const lastHash = before.lastIndexOf("#");
    const lastAt = before.lastIndexOf("@");
    if (lastHash >= 0 && !/\s/.test(before.slice(lastHash + 1))) {
      setAutocompleteType("project");
    } else if (lastAt >= 0 && !/\s/.test(before.slice(lastAt + 1))) {
      setAutocompleteType("label");
    } else {
      setAutocompleteType(null);
    }
  }

  // Replace token in input when autocomplete selection is made
  const handleAutocompleteSelect = useCallback(
    (item, triggerIdx, cursorPos) => {
      const trigger = input[triggerIdx];
      const before = input.slice(0, triggerIdx);
      const after = input.slice(cursorPos);
      const newInput = `${before}${trigger}${item.name}${after ? " " + after.trimStart() : " "}`;
      setInput(newInput);
      setAutocompleteType(null);
      // Sync into manual state so resolved* picks it up even when overrides
      // are already set (edit mode). In create mode this is redundant with
      // token parsing but harmless.
      if (trigger === "#") {
        setManualProject(item);
        setOverrides((prev) => ({ ...prev, project: true }));
      } else if (trigger === "@") {
        setManualLabels((prev) => {
          const existing = prev || [];
          if (existing.find((l) => l.id === item.id)) return existing;
          return [...existing, item];
        });
        setOverrides((prev) => ({ ...prev, labels: true }));
      }
      // Refocus and set cursor after the inserted token
      setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const pos = before.length + trigger.length + item.name.length + 1;
          el.setSelectionRange(pos, pos);
        }
      }, 0);
    },
    [input],
  );

  // Position panel below anchor
  const updatePos = useCallback(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const panelWidth = 340;
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }
    setPos({ top: rect.bottom + 8, left, width: panelWidth });
  }, [anchorRef]);

  useEffect(() => {
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [updatePos]);

  // Focus input on mount, flip visible on next frame so the enter
  // animation has a starting state to transition from.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClick(e) {
      if (
        anchorRef?.current?.contains(e.target) ||
        panelRef.current?.contains(e.target)
      )
        return;
      requestClose();
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [anchorRef, requestClose]);

  // Escape to close
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [requestClose]);

  // Scroll trapping
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    function handleWheel(e) {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom =
        scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const canSubmit = parsed.stripped.length > 0 || input.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload = { content: parsed.stripped };
      if (description.trim()) payload.description = description.trim();
      if (resolvedProject) payload.project_id = resolvedProject.id;
      if (resolvedPriority) payload.priority = resolvedPriority;
      // On edit, always send labels so clearing them actually takes effect.
      // On create, only send when non-empty.
      if (isEdit || resolvedLabels.length) {
        payload.labels = resolvedLabels.map((l) => l.name);
      }
      if (resolvedDue) payload.due_string = resolvedDue;

      let task;
      if (isEdit) {
        task = await updateTodoistTask(editingTask.id, payload);
        onTaskUpdated?.(task);
      } else {
        task = await createTodoistTask(payload);
        onTaskAdded?.(task);
      }
      requestClose();
    } catch (err) {
      setError(err.message || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    // Don't submit if autocomplete is active — it handles Enter/Tab itself
    if (autocompleteType) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const priorityOptions = [
    { value: null, label: "None" },
    { value: 1, label: "P1 — Urgent" },
    { value: 2, label: "P2 — High" },
    { value: 3, label: "P3 — Medium" },
    { value: 4, label: "P4 — Low" },
  ];

  if (!pos) return null;

  const active = visible && !closing;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        background: "#16161e",
        border: "1px solid rgba(205,214,244,0.12)",
        borderRadius: 12,
        padding: 16,
        zIndex: 9999,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        isolation: "isolate",
        overscrollBehavior: "contain",
        fontFamily: "system-ui, -apple-system, sans-serif",
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0)" : "translateY(-6px)",
        transition:
          "opacity 180ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        transformOrigin: "top left",
      }}
    >
      {/* Task input */}
      <div style={{ marginBottom: 8, position: "relative" }}>
        <div
          style={{
            color: "rgba(205,214,244,0.4)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            marginBottom: 4,
          }}
        >
          Task
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Buy groceries tomorrow ! #Shopping @errand"
          style={{
            width: "100%",
            background: "rgba(205,214,244,0.06)",
            border: input
              ? "1px solid rgba(99,102,241,0.4)"
              : "1px solid rgba(205,214,244,0.12)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "#cdd6f4",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            boxShadow: input ? "0 0 0 1px rgba(99,102,241,0.15)" : "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        />
        {autocompleteType === "project" && (
          <TokenAutocomplete
            cursorPos={cursorPos}
            input={input}
            items={projects}
            type="project"
            onSelect={handleAutocompleteSelect}
          />
        )}
        {autocompleteType === "label" && (
          <TokenAutocomplete
            cursorPos={cursorPos}
            input={input}
            items={labels}
            type="label"
            onSelect={handleAutocompleteSelect}
          />
        )}
      </div>

      {/* NLP hint */}
      <div
        style={{
          color: "rgba(205,214,244,0.25)",
          fontSize: 11,
          marginBottom: 8,
        }}
      >
        Supports: dates, ! or !1-!4, #project, @label
      </div>

      {/* Description */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            color: "rgba(205,214,244,0.4)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            marginBottom: 4,
          }}
        >
          Description
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
          rows={2}
          style={{
            width: "100%",
            background: "rgba(205,214,244,0.04)",
            border: "1px solid rgba(205,214,244,0.08)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "#cdd6f4",
            fontSize: 12,
            outline: "none",
            resize: "vertical",
            minHeight: 40,
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Project + Priority row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Dropdown
          label="Project"
          value={resolvedProject}
          color={resolvedProject ? "#cba6da" : null}
          options={projects}
          onChange={(opt) => {
            setManualProject(opt);
            setOverrides((prev) => ({ ...prev, project: true }));
          }}
          renderValue={(val) => val?.name || "Inbox"}
          renderOption={(opt) => (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: opt.color || "rgba(205,214,244,0.3)",
                }}
              />
              {opt.name}
            </span>
          )}
        />
        <Dropdown
          label="Priority"
          value={resolvedPriority}
          color={
            resolvedPriority && resolvedPriority <= 2
              ? "#f38ba8"
              : resolvedPriority === 3
                ? "#89b4fa"
                : null
          }
          options={priorityOptions}
          onChange={(opt) => {
            setManualPriority(opt.value);
            setOverrides((prev) => ({ ...prev, priority: true }));
          }}
          renderValue={(val) =>
            val ? <PriorityIndicator level={val} /> : "None"
          }
          renderOption={(opt) =>
            opt.value ? <PriorityIndicator level={opt.value} /> : "None"
          }
        />
      </div>

      {/* Due date */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            color: "rgba(205,214,244,0.4)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            marginBottom: 4,
          }}
        >
          Due
        </div>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={manualDue}
            onChange={(e) => {
              setManualDue(e.target.value);
              setOverrides((prev) => ({ ...prev, due: true }));
            }}
            placeholder={
              parsed.dateFormatted || seededDueDisplay
                ? ""
                : "e.g. tomorrow, next monday at 8am"
            }
            style={{
              width: "100%",
              background:
                resolvedDue || seededDueDisplay
                  ? "rgba(249,226,175,0.06)"
                  : "rgba(205,214,244,0.04)",
              border:
                resolvedDue || seededDueDisplay
                  ? "1px solid rgba(249,226,175,0.15)"
                  : "1px solid rgba(205,214,244,0.08)",
              borderRadius: 8,
              padding: "8px 12px",
              color: resolvedDue ? "#f9e2af" : "rgba(205,214,244,0.35)",
              fontSize: 12,
              outline: "none",
              boxSizing: "border-box",
              transition: "all 0.2s",
            }}
          />
          {!manualDue && (parsed.dateFormatted || seededDueDisplay) && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                color: "#f9e2af",
                fontSize: 12,
                pointerEvents: "none",
                gap: 6,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {parsed.dateFormatted || seededDueDisplay}
            </div>
          )}
        </div>
      </div>

      {/* Labels */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            color: "rgba(205,214,244,0.4)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            marginBottom: 4,
          }}
        >
          Labels
        </div>
        <div
          style={{
            background: resolvedLabels.length
              ? "rgba(205,214,244,0.04)"
              : "rgba(205,214,244,0.04)",
            border: resolvedLabels.length
              ? "1px solid rgba(166,218,203,0.15)"
              : "1px solid rgba(205,214,244,0.08)",
            borderRadius: 8,
            padding: "6px 12px",
            minHeight: 32,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {resolvedLabels.map((l) => (
            <span
              key={l.id}
              style={{
                background: "rgba(166,218,203,0.1)",
                border: "1px solid rgba(166,218,203,0.2)",
                borderRadius: 4,
                padding: "2px 8px",
                color: "#a6dac0",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {l.name}
              <span
                role="button"
                tabIndex={0}
                onClick={() => {
                  const updated = resolvedLabels.filter((x) => x.id !== l.id);
                  setManualLabels(updated);
                  setOverrides((prev) => ({ ...prev, labels: true }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const updated = resolvedLabels.filter((x) => x.id !== l.id);
                    setManualLabels(updated);
                    setOverrides((prev) => ({ ...prev, labels: true }));
                  }
                }}
                style={{ cursor: "pointer", opacity: 0.6, display: "inline-flex", alignItems: "center" }}
              >
                <X size={12} />
              </span>
            </span>
          ))}
          {labels.length > 0 && (
            <LabelPicker
              available={labels.filter(
                (l) => !resolvedLabels.find((r) => r.id === l.id),
              )}
              onAdd={(label) => {
                const updated = [...resolvedLabels, label];
                setManualLabels(updated);
                setOverrides((prev) => ({ ...prev, labels: true }));
              }}
            />
          )}
          {!resolvedLabels.length && !labels.length && (
            <span style={{ color: "rgba(205,214,244,0.3)", fontSize: 12 }}>
              None
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            color: "#f38ba8",
            fontSize: 12,
            marginBottom: 8,
            padding: "6px 8px",
            background: "rgba(243,139,168,0.08)",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ color: "rgba(205,214,244,0.25)", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <CornerDownLeft size={11} /> Enter to add &middot; Esc to cancel
        </div>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            background:
              canSubmit && !submitting ? "#6366f1" : "rgba(99,102,241,0.3)",
            borderRadius: 6,
            padding: "6px 16px",
            color: canSubmit && !submitting ? "white" : "rgba(255,255,255,0.4)",
            fontSize: 12,
            fontWeight: 600,
            cursor: canSubmit && !submitting ? "pointer" : "default",
            border: "none",
            transition: "all 0.2s",
          }}
        >
          {submitting
            ? isEdit ? "Saving..." : "Adding..."
            : isEdit ? "Save" : "Add task"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// --- Label picker (inline add) ---

function LabelPicker({ available, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  if (!available.length) return null;

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setOpen((v) => !v);
        }}
        style={{
          color: "rgba(205,214,244,0.3)",
          fontSize: 11,
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: 4,
          border: "1px dashed rgba(205,214,244,0.12)",
        }}
      >
        + label
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 4,
            background: "#16161e",
            border: "1px solid rgba(205,214,244,0.12)",
            borderRadius: 8,
            maxHeight: 120,
            overflowY: "auto",
            zIndex: 10,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            minWidth: 120,
          }}
        >
          {available.map((l) => (
            <div
              key={l.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                onAdd(l);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAdd(l);
                  setOpen(false);
                }
              }}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                color: "#a6dac0",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(205,214,244,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {l.name}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
