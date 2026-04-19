import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Receipt, ListChecks, Calendar as CalendarIcon } from "lucide-react";
import billsView from "./views/billsView.jsx";
import deadlinesView from "./views/deadlinesView.jsx";
import eventsView from "./views/eventsView.jsx";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const GRID_ROWS = 6;
const CELL_HEIGHT = 84;
const SIDEBAR_WIDTH = 340;

const VIEWS = {
  events: eventsView,
  bills: billsView,
  deadlines: deadlinesView,
};

function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

function CalendarCell({ day, items, hasItems, isToday, isSelected, hasOverdue, allComplete, onClick, renderCellContents }) {
  // Minimal cells: hairline borders, accent dot for "today", purple ring on
  // selection, subtle status accents instead of heavy bg/border combinations.
  let cellBg = "rgba(255,255,255,0.015)";
  let cellBorder = "1px solid rgba(255,255,255,0.04)";
  let cellShadow = "none";
  let dateColor = "rgba(205,214,244,0.7)";
  let dateWeight = 400;
  let accentBar = null;

  if (isSelected) {
    cellBg = "rgba(203,166,218,0.06)";
    cellBorder = "1px solid rgba(203,166,218,0.4)";
    cellShadow = "0 0 0 1px rgba(203,166,218,0.18), 0 4px 14px rgba(203,166,218,0.18)";
    dateColor = "#cba6da";
    dateWeight = 600;
  } else if (allComplete) {
    accentBar = "#a6e3a1";
    dateColor = "rgba(166,227,161,0.85)";
  } else if (hasOverdue) {
    accentBar = "#f38ba8";
    dateColor = "rgba(243,139,168,0.9)";
  } else if (hasItems) {
    dateColor = "#cdd6f4";
    dateWeight = 500;
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        minWidth: 0, overflow: "hidden", borderRadius: 8,
        padding: "7px 9px",
        background: cellBg, border: cellBorder, boxShadow: cellShadow,
        cursor: hasItems ? "pointer" : "default",
        transition: "box-shadow 150ms, border-color 150ms, background 150ms",
        display: "flex", flexDirection: "column", gap: 3,
      }}
    >
      {accentBar && (
        <span
          style={{
            position: "absolute", left: 0, top: 8, bottom: 8, width: 2,
            background: accentBar, borderRadius: 2, opacity: 0.55,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 12.5, color: dateColor, fontWeight: dateWeight, fontVariantNumeric: "tabular-nums" }}>
          {day}
        </span>
        {isToday && (
          <span
            style={{
              width: 5, height: 5, borderRadius: 99, background: "#f97316",
              boxShadow: "0 0 8px rgba(249,115,22,0.6), 0 0 0 2px rgba(249,115,22,0.18)",
              animation: "dashPulse 2s ease-in-out infinite",
            }}
            aria-label="Today"
          />
        )}
      </div>
      {renderCellContents?.({ items, hasOverdue })}
    </div>
  );
}

function CalendarSummary({ view, viewYear, viewMonth, currentYear, currentMonth, todayDate, itemsByDay, computed, data, activeView }) {
  // Default-state side rail content. Renders the view-supplied footer
  // (already shows totals + legend) inside the new card layout, plus a
  // friendly empty-state hint at the top.
  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 2.6, textTransform: "uppercase",
            color: "rgba(205,214,244,0.55)",
          }}
        >
          {view === "bills" ? "Bills overview" : "Deadlines overview"}
        </div>
        <div className="ea-display" style={{ marginTop: 4, fontSize: 18, color: "#fff", letterSpacing: -0.2 }}>
          {isCurrentMonth ? "This month · " : ""}{monthLabel}
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />
      <div style={{ fontSize: 12, color: "rgba(205,214,244,0.55)", lineHeight: 1.5 }}>
        Click any day with activity to drill in. Items are color-coded by source on the rail.
      </div>
      <span style={{ flex: 1 }} />
      {/* The view's existing footer renderer becomes the per-month summary
          card now that it lives in the rail instead of below the grid. */}
      {activeView.renderFooter?.({ viewYear, viewMonth, currentYear, currentMonth, todayDate, itemsByDay, computed, data })}
    </div>
  );
}

function parseFocusDate(focusDate) {
  if (!focusDate) return null;
  const d = new Date(`${focusDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default function CalendarModal({
  open,
  onClose,
  view,
  onViewChange,
  eventsData,
  billsData,
  deadlinesData,
  focusDate,
}) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const [viewDate, setViewDate] = useState({ month: currentMonth, year: currentYear });
  const [selectedDay, setSelectedDay] = useState(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);

  const viewMonth = viewDate.month;
  const viewYear = viewDate.year;

  const activeView = VIEWS[view] || billsView;
  const viewData =
    view === "events" ? eventsData
    : view === "deadlines" ? deadlinesData
    : billsData;

  const navigateMonthRef = useRef(null);
  useEffect(() => {
    navigateMonthRef.current = (dir) => {
      setSelectedDay(null);
      setViewDate((prev) => {
        const next = prev.month + dir;
        if (next > 11) return { month: 0, year: prev.year + 1 };
        if (next < 0) return { month: 11, year: prev.year - 1 };
        return { month: next, year: prev.year };
      });
    };
  });
  const navigateMonth = (dir) => navigateMonthRef.current?.(dir);

  // Reset state when modal opens. If a focusDate is supplied, jump to that
  // month and auto-select the day cell (e.g. clicking a bill drills straight
  // into its due-day's detail rail).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      const focus = parseFocusDate(focusDate);
      if (focus) {
        setViewDate({ month: focus.getMonth(), year: focus.getFullYear() });
        setSelectedDay(focus.getDate());
      } else {
        setViewDate({ month: currentMonth, year: currentYear });
        setSelectedDay(null);
      }
    }
  }

  // Reset selectedDay when view changes (preserve month/year)
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setSelectedDay(null);
  }

  // Allow views to opt out of outside-click close (e.g., when a popover is open)
  const suppressOutsideClickRef = useRef(null);
  const suppressOutsideClick = useCallback((test) => {
    suppressOutsideClickRef.current = test;
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (suppressOutsideClickRef.current?.(e.target)) return;
      // Ignore clicks inside floating menus/dialogs rendered in portals outside the panel.
      if (e.target.closest?.('[role="menu"], [role="dialog"]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open, onClose]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    function onWheel(e) {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) { e.preventDefault(); return; }
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop >= maxScroll && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  const computed = useMemo(
    () => activeView.compute({ data: viewData, viewYear, viewMonth }),
    [activeView, viewData, viewYear, viewMonth],
  );

  const itemsByDay = computed.itemsByDay || {};

  const { firstDay, daysInMonth } = getMonthData(viewYear, viewMonth);
  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const todayDate = now.getDate();
  const totalCells = firstDay + daysInMonth;
  const trailingEmpty = GRID_ROWS * 7 - totalCells;

  const canGoPrev = activeView.canNavigateBack
    ? activeView.canNavigateBack({ viewYear, viewMonth, currentYear, currentMonth, data: viewData, computed })
    : !isCurrentMonth;

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "Escape":
          onClose();
          e.stopPropagation();
          break;
        case "ArrowLeft":
        case "p":
          if (canGoPrev) {
            navigateMonthRef.current(-1);
          }
          e.preventDefault();
          e.stopPropagation();
          break;
        case "ArrowRight":
        case "n":
          navigateMonthRef.current(1);
          e.preventDefault();
          e.stopPropagation();
          break;
        case "t":
        case "T":
          setViewDate({ month: currentMonth, year: currentYear });
          setSelectedDay(null);
          e.preventDefault();
          e.stopPropagation();
          break;
        case "1":
          // Scoped to the modal — stopPropagation prevents the shell's
          // 1=Dashboard hotkey from firing underneath.
          if (view !== "events") onViewChange?.("events");
          e.preventDefault();
          e.stopPropagation();
          break;
        case "2":
          if (view !== "bills") onViewChange?.("bills");
          e.preventDefault();
          e.stopPropagation();
          break;
        case "3":
          if (view !== "deadlines") onViewChange?.("deadlines");
          e.preventDefault();
          e.stopPropagation();
          break;
        default:
          if (e.key.length === 1 && e.key !== "r" && e.key !== "R") {
            e.stopPropagation();
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, onClose, currentMonth, currentYear, canGoPrev, view, onViewChange]);

  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long" });
  const monthYear = String(viewYear);

  if (!open) return null;

  const selectedItems = selectedDay ? itemsByDay[selectedDay] || [] : [];
  const showDetail = selectedDay && selectedItems.length > 0;

  const HeaderExtras = activeView.HeaderExtras;

  return createPortal(
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 49,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
        }}
      >
        <div
          ref={panelRef}
          className="isolate flex flex-col animate-in fade-in zoom-in-95 duration-200"
          style={{
            width: "min(1280px, calc(100vw - 64px))",
            maxHeight: "calc(100vh - 64px)",
            background: "radial-gradient(ellipse at top left, #1a1a2a, #0d0d15 70%)",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div
            ref={scrollRef}
            className="overflow-y-auto overscroll-contain flex-1"
            style={{ padding: "28px 32px" }}
          >
            {/* Header — eyebrow + display title pattern from the mock */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 22, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifySelf: "start", minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: 2.6, textTransform: "uppercase",
                      color: "rgba(205,214,244,0.55)",
                    }}
                  >
                    Calendar · {VIEWS[view]?.label || "Bills"}
                  </div>
                  <div
                    className="ea-display"
                    style={{
                      fontSize: 28, fontWeight: 500, color: "#fff",
                      letterSpacing: -0.4, lineHeight: 1.05,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {monthName}{" "}
                    <span style={{ color: "rgba(205,214,244,0.4)", fontWeight: 400 }}>{monthYear}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => canGoPrev && navigateMonth(-1)}
                    aria-label="Previous month"
                    style={{
                      color: canGoPrev ? "rgba(205,214,244,0.7)" : "rgba(205,214,244,0.18)",
                      cursor: canGoPrev ? "pointer" : "default",
                      width: 36, height: 36,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      fontFamily: "inherit",
                      transition: "all 120ms",
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => navigateMonth(1)}
                    aria-label="Next month"
                    style={{
                      color: "rgba(205,214,244,0.7)",
                      cursor: "pointer",
                      width: 36, height: 36,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      fontFamily: "inherit",
                      transition: "all 120ms",
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Segmented view switcher */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  padding: 2,
                  gap: 2,
                  justifySelf: "center",
                }}
              >
                {[
                  { key: "events", label: "Events", Icon: CalendarIcon, hint: "1" },
                  { key: "bills", label: "Bills", Icon: Receipt, hint: "2" },
                  { key: "deadlines", label: "Deadlines", Icon: ListChecks, hint: "3" },
                ].map((opt) => {
                  const active = view === opt.key;
                  const { Icon } = opt;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => !active && onViewChange?.(opt.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "6px 12px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: 0.3,
                        border: "none",
                        cursor: active ? "default" : "pointer",
                        fontFamily: "inherit",
                        background: active ? "rgba(203,166,218,0.12)" : "transparent",
                        color: active ? "#cba6da" : "rgba(205,214,244,0.55)",
                        transition: "background 150ms, color 150ms",
                      }}
                    >
                      <Icon size={11} strokeWidth={1.8} />
                      {opt.label}
                      <kbd
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          minWidth: 16, height: 16, padding: "0 4px",
                          fontSize: 9.5, fontFamily: "Fira Code, ui-monospace, monospace", fontWeight: 500,
                          color: active ? "#cba6da" : "rgba(205,214,244,0.45)",
                          background: active ? "rgba(203,166,218,0.10)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${active ? "rgba(203,166,218,0.28)" : "rgba(255,255,255,0.06)"}`,
                          borderRadius: 4, letterSpacing: 0,
                          marginLeft: 2,
                        }}
                      >
                        {opt.hint}
                      </kbd>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "end" }}>
                {HeaderExtras ? (
                  <HeaderExtras
                    data={viewData}
                    computed={computed}
                    suppressOutsideClick={suppressOutsideClick}
                  />
                ) : null}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    color: "rgba(205,214,244,0.7)",
                    cursor: "pointer",
                    width: 36, height: 36,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontFamily: "inherit",
                    transition: "all 120ms",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body: calendar (left) + side rail (right) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `minmax(0, 1fr) ${SIDEBAR_WIDTH}px`,
                gap: 24,
                alignItems: "start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                {/* Day-of-week headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                  {DAYS.map((d) => (
                    <div
                      key={d}
                      style={{
                        textAlign: "center", fontSize: 10, fontWeight: 600,
                        color: "rgba(205,214,244,0.4)",
                        padding: 4, letterSpacing: 1.6, textTransform: "uppercase",
                      }}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div
                  key={`${view}-${viewYear}-${viewMonth}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gridTemplateRows: `repeat(${GRID_ROWS}, ${CELL_HEIGHT}px)`,
                    gap: 6,
                  }}
                >
                  {Array.from({ length: firstDay }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}

                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const items = itemsByDay[day] || [];
                    const hasItems = items.length > 0;
                    const isToday = isCurrentMonth && day === todayDate;
                    const isSelected = selectedDay === day;
                    const hasOverdue = activeView.hasOverdue?.(items) || false;
                    const allComplete = activeView.allComplete?.(items) || false;

                    return (
                      <CalendarCell
                        key={day}
                        day={day}
                        items={items}
                        hasItems={hasItems}
                        isToday={isToday}
                        isSelected={isSelected}
                        hasOverdue={hasOverdue}
                        allComplete={allComplete}
                        onClick={() => hasItems && setSelectedDay(isSelected ? null : day)}
                        renderCellContents={activeView.renderCellContents}
                      />
                    );
                  })}

                  {Array.from({ length: trailingEmpty }, (_, i) => (
                    <div key={`trail-${i}`} />
                  ))}
                </div>
              </div>

              {/* Side rail — detail when a day is selected, summary otherwise */}
              <aside
                style={{
                  position: "sticky",
                  top: 0,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 12,
                  minHeight: GRID_ROWS * CELL_HEIGHT + (GRID_ROWS - 1) * 6 + 30,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {activeView.renderSidebar ? (
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {activeView.renderSidebar({ selectedDay, itemsByDay, viewYear, viewMonth, data: viewData })}
                  </div>
                ) : showDetail ? (
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {activeView.renderDetail?.({
                      selectedDay,
                      viewYear,
                      viewMonth,
                      items: selectedItems,
                      data: viewData,
                      computed,
                    })}
                  </div>
                ) : (
                  <CalendarSummary
                    view={view}
                    viewYear={viewYear}
                    viewMonth={viewMonth}
                    currentYear={currentYear}
                    currentMonth={currentMonth}
                    todayDate={todayDate}
                    itemsByDay={itemsByDay}
                    computed={computed}
                    data={viewData}
                    activeView={activeView}
                  />
                )}
              </aside>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
