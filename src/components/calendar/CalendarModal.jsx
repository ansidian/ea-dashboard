import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Receipt, ListChecks } from "lucide-react";
import billsView from "./views/billsView.jsx";
import deadlinesView from "./views/deadlinesView.jsx";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const GRID_ROWS = 6;
const CELL_HEIGHT = 88;
const DETAIL_HEIGHT = 340;

const VIEWS = {
  bills: billsView,
  deadlines: deadlinesView,
};

function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

export default function CalendarModal({
  open,
  onClose,
  view,
  onViewChange,
  billsData,
  deadlinesData,
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
  const viewData = view === "deadlines" ? deadlinesData : billsData;

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

  // Reset state when modal opens
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setViewDate({ month: currentMonth, year: currentYear });
      setSelectedDay(null);
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
        default:
          if (e.key.length === 1 && e.key !== "r" && e.key !== "R") {
            e.stopPropagation();
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, onClose, currentMonth, currentYear, canGoPrev]);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

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
            width: "min(1100px, calc(100vw - 96px))",
            maxHeight: "calc(100vh - 96px)",
            background: "#16161e",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          }}
        >
          <div
            ref={scrollRef}
            className="overflow-y-auto overscroll-contain flex-1"
            style={{ padding: "32px 40px" }}
          >
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 24, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "start" }}>
                <button
                  onClick={() => canGoPrev && navigateMonth(-1)}
                  style={{
                    color: canGoPrev ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)",
                    cursor: canGoPrev ? "pointer" : "default",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "none",
                    fontFamily: "inherit",
                    flexShrink: 0,
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <span style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#cdd6f4",
                  minWidth: 240,
                  textAlign: "center",
                }}>
                  {monthLabel}
                </span>
                <button
                  onClick={() => navigateMonth(1)}
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "none",
                    fontFamily: "inherit",
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Segmented view switcher */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: 3,
                  gap: 2,
                  justifySelf: "center",
                }}
              >
                {[
                  { key: "bills", label: "Bills", Icon: Receipt },
                  { key: "deadlines", label: "Deadlines", Icon: ListChecks },
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
                        gap: 6,
                        padding: "6px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        letterSpacing: 0.3,
                        border: "none",
                        cursor: active ? "default" : "pointer",
                        fontFamily: "inherit",
                        background: active ? "rgba(203,166,218,0.14)" : "transparent",
                        color: active ? "#cba6da" : "rgba(255,255,255,0.5)",
                        transition: "background 150ms, color 150ms",
                      }}
                    >
                      <Icon size={12} strokeWidth={1.8} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end" }}>
                {HeaderExtras ? (
                  <HeaderExtras
                    data={viewData}
                    computed={computed}
                    suppressOutsideClick={suppressOutsideClick}
                  />
                ) : null}
                <button
                  onClick={onClose}
                  style={{
                    color: "rgba(255,255,255,0.3)",
                    cursor: "pointer",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Day-of-week headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
              {DAYS.map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.35)", padding: 6, fontWeight: 500, letterSpacing: 0.5 }}>
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
                gap: 4,
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

                let cellBg = "rgba(255,255,255,0.02)";
                let cellBorder = "1px solid rgba(255,255,255,0.04)";
                let cellShadow = "none";
                let dateColor = "rgba(255,255,255,0.5)";
                let dateWeight = 400;

                if (isSelected) {
                  cellBg = "rgba(203,166,218,0.08)";
                  cellBorder = "1px solid rgba(203,166,218,0.3)";
                  cellShadow = "0 0 8px rgba(203,166,218,0.12)";
                  dateColor = "#cba6da";
                  dateWeight = 600;
                } else if (isToday) {
                  cellBg = "rgba(249,115,22,0.08)";
                  cellBorder = "1px solid rgba(249,115,22,0.25)";
                  cellShadow = "0 0 8px rgba(249,115,22,0.08)";
                  dateColor = "#f97316";
                  dateWeight = 600;
                } else if (allComplete) {
                  cellBg = "rgba(166,227,161,0.06)";
                  cellBorder = "1px solid rgba(166,227,161,0.18)";
                } else if (hasOverdue) {
                  cellBg = "rgba(243,139,168,0.06)";
                  cellBorder = "1px solid rgba(243,139,168,0.15)";
                }

                return (
                  <div
                    key={day}
                    onClick={() => hasItems && setSelectedDay(isSelected ? null : day)}
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: cellBg,
                      border: cellBorder,
                      boxShadow: cellShadow,
                      cursor: hasItems ? "pointer" : "default",
                      transition: "box-shadow 150ms, border-color 150ms",
                    }}
                  >
                    <div style={{ fontSize: 13, color: dateColor, fontWeight: dateWeight }}>
                      {day}
                    </div>
                    {isToday && !hasItems && (
                      <div style={{ fontSize: 9, fontWeight: 600, color: "#f97316", marginTop: 2, letterSpacing: 0.5 }}>TODAY</div>
                    )}
                    {activeView.renderCellContents?.({ items, hasOverdue })}
                  </div>
                );
              })}

              {Array.from({ length: trailingEmpty }, (_, i) => (
                <div key={`trail-${i}`} />
              ))}
            </div>

            {/* Detail area */}
            <div
              style={{
                height: DETAIL_HEIGHT,
                marginTop: 12,
                borderRadius: 8,
                background: showDetail ? "rgba(203,166,218,0.04)" : "transparent",
                border: showDetail ? "1px solid rgba(203,166,218,0.12)" : "1px solid transparent",
                transition: "background 200ms, border-color 200ms",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {showDetail ? (
                activeView.renderDetail?.({
                  selectedDay,
                  viewYear,
                  viewMonth,
                  items: selectedItems,
                  data: viewData,
                  computed,
                })
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Click a day to see details</span>
                </div>
              )}
            </div>

            {/* Footer */}
            {activeView.renderFooter?.({ viewYear, viewMonth, currentYear, currentMonth, todayDate, itemsByDay, computed, data: viewData })}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
