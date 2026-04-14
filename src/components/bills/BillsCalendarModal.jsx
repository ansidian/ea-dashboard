import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Zap, Droplet, Wifi, Flame, Trash2, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatAmount, daysUntil, daysLabel, urgencyColor } from "../../lib/bill-utils";
import Tooltip from "../shared/Tooltip";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_PILLS = 2;
const GRID_ROWS = 6;
const CELL_HEIGHT = 88;
const DETAIL_HEIGHT = 340;

const TRACKED_UTILITIES = [
  { key: "sce", label: "Electricity", match: "sce", icon: Zap },
  { key: "water", label: "Water", match: "sgv water", icon: Droplet },
  { key: "spectrum", label: "Internet", match: "spectrum", icon: Wifi },
  { key: "socalgas", label: "Gas", match: "socalgas", icon: Flame },
  { key: "trash", label: "Trash", match: "valley vista", icon: Trash2 },
];

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeDateLabel(days) {
  if (days === null || days === undefined) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day ago";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

function formatFullDate(year, month, day) {
  const d = new Date(year, month, day);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function scheduleToBill(schedule, payeeMap) {
  const amtCond = schedule.conditions?.find(c => c.field === "amount");
  const payeeCond = schedule.conditions?.find(c => c.field === "payee");
  const amountCents = amtCond?.value ?? 0;
  const payeeName = payeeCond ? payeeMap[payeeCond.value] : schedule.name;
  return {
    id: schedule.id,
    name: schedule.name || payeeName || "Unknown",
    payee: payeeName || schedule.name || "Unknown",
    amount: Math.abs(amountCents) / 100,
    next_date: schedule.next_date,
    paid: !!schedule.paid,
  };
}

export default function BillsCalendarModal({ open, onClose, schedules, recentTransactions, payeeMap, actualBudgetUrl }) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const [view, setView] = useState({ month: currentMonth, year: currentYear });
  const [selectedDay, setSelectedDay] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusPos, setStatusPos] = useState({ top: 0, right: 0 });
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const statusBtnRef = useRef(null);
  const statusPopoverRef = useRef(null);

  const viewMonth = view.month;
  const viewYear = view.year;

  const navigateMonthRef = useRef(null);
  useEffect(() => {
    navigateMonthRef.current = (dir) => {
      setSelectedDay(null);
      setView(prev => {
        const next = prev.month + dir;
        if (next > 11) return { month: 0, year: prev.year + 1 };
        if (next < 0) return { month: 11, year: prev.year - 1 };
        return { month: next, year: prev.year };
      });
    };
  });
  const navigateMonth = (dir) => navigateMonthRef.current?.(dir);

  // Reset modal state when `open` transitions — render-time sync avoids effect cascade
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setView({ month: currentMonth, year: currentYear });
      setSelectedDay(null);
    } else {
      setStatusOpen(false);
    }
  }

  // Keyboard shortcuts (capture phase to intercept before dashboard handlers)
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      // Block cmd/ctrl+F (email search) while modal is open
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Let other modified keys pass through (cmd+r, ctrl+c, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "Escape":
          onClose();
          e.stopPropagation();
          break;
        case "ArrowLeft":
        case "p":
          if (viewYear !== currentYear || viewMonth !== currentMonth) {
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
          setView({ month: currentMonth, year: currentYear });
          setSelectedDay(null);
          e.preventDefault();
          e.stopPropagation();
          break;
        default:
          // Let R through for quick refresh, swallow other single-key presses
          if (e.key.length === 1 && e.key !== "r" && e.key !== "R") {
            e.stopPropagation();
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, onClose, viewMonth, viewYear, currentMonth, currentYear]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (statusPopoverRef.current?.contains(e.target)) return;
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

  const billsByDay = useMemo(() => {
    const map = {};
    const seen = new Set();
    if (schedules?.length) {
      for (const s of schedules) {
        if (!s.next_date) continue;
        const d = new Date(s.next_date + "T00:00:00");
        if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(scheduleToBill(s, payeeMap));
        seen.add(`${s.id}:${day}`);
      }
    }
    if (recentTransactions?.length && schedules?.length) {
      const scheduleById = new Map(schedules.map(s => [s.id, s]));
      for (const t of recentTransactions) {
        if (!t.scheduleId || !t.date) continue;
        const sched = scheduleById.get(t.scheduleId);
        if (!sched) continue;
        const d = new Date(t.date + "T00:00:00");
        if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
        const day = d.getDate();
        const key = `${t.scheduleId}:${day}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!map[day]) map[day] = [];
        map[day].push({
          ...scheduleToBill(sched, payeeMap),
          next_date: t.date,
          amount: t.amount,
          paid: true,
        });
      }
    }
    return map;
  }, [schedules, recentTransactions, payeeMap, viewMonth, viewYear]);

  const utilityStatus = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const rows = TRACKED_UTILITIES.map(u => {
      const sched = schedules?.find(s => {
        const payeeCond = s.conditions?.find(c => c.field === "payee");
        const payeeName = payeeCond ? payeeMap?.[payeeCond.value] : null;
        const haystack = `${payeeName || ""} ${s.name || ""}`.toLowerCase();
        return haystack.includes(u.match);
      });
      const nextDate = sched?.next_date || null;
      const amtCond = sched?.conditions?.find(c => c.field === "amount");
      const amount = amtCond?.value ? Math.abs(amtCond.value) / 100 : null;
      return {
        ...u,
        found: !!sched,
        next_date: nextDate,
        amount,
        isStale: !sched || !nextDate || nextDate < today,
      };
    });
    // Sort ascending by next_date; not-found entries sink to the bottom
    return rows.sort((a, b) => {
      if (!a.next_date && !b.next_date) return 0;
      if (!a.next_date) return 1;
      if (!b.next_date) return -1;
      return a.next_date.localeCompare(b.next_date);
    });
  }, [schedules, payeeMap]);

  const anyStale = utilityStatus.some(u => u.isStale && u.found);
  const allFresh = utilityStatus.length > 0 && utilityStatus.every(u => u.found && !u.isStale);

  const updateStatusPos = useCallback(() => {
    if (!statusBtnRef.current) return;
    const r = statusBtnRef.current.getBoundingClientRect();
    setStatusPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!statusOpen) return;
    updateStatusPos();
    window.addEventListener("scroll", updateStatusPos, true);
    window.addEventListener("resize", updateStatusPos);
    return () => {
      window.removeEventListener("scroll", updateStatusPos, true);
      window.removeEventListener("resize", updateStatusPos);
    };
  }, [statusOpen, updateStatusPos]);

  useEffect(() => {
    if (!statusOpen) return;
    function handle(e) {
      if (statusBtnRef.current?.contains(e.target)) return;
      if (statusPopoverRef.current?.contains(e.target)) return;
      setStatusOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [statusOpen]);

  const monthTotal = useMemo(() => {
    let total = 0;
    for (const bills of Object.values(billsByDay)) {
      for (const b of bills) total += b.amount;
    }
    return total;
  }, [billsByDay]);

  const { firstDay, daysInMonth } = getMonthData(viewYear, viewMonth);
  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const todayDate = now.getDate();
  const totalCells = firstDay + daysInMonth;
  const trailingEmpty = GRID_ROWS * 7 - totalCells;

  const canGoPrev = !isCurrentMonth;
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (!open) return null;

  const selectedBills = selectedDay ? billsByDay[selectedDay] || [] : [];
  const showDetail = selectedDay && selectedBills.length > 0;

  const statusPopover = statusOpen ? createPortal(
    <div
      ref={statusPopoverRef}
      className="isolate"
      style={{
        position: "fixed",
        top: statusPos.top,
        right: statusPos.right,
        zIndex: 50,
        width: 280,
        background: "#16161e",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        padding: "12px 14px",
        isolation: "isolate",
        overscrollBehavior: "contain",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10, padding: "0 2px" }}>
        Statement Status
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {utilityStatus.map(u => {
          const Icon = u.icon;
          const color = !u.found ? "rgba(255,255,255,0.25)"
            : u.isStale ? "#f97316"
            : "#a6e3a1";
          const days = u.next_date ? daysUntil(u.next_date) : null;
          const rel = relativeDateLabel(days);
          const dateText = !u.found ? "not found"
            : u.isStale
              ? `last ${formatShortDate(u.next_date)}`
              : `next ${formatShortDate(u.next_date)}`;
          const tooltipText = u.found && rel ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, lineHeight: 1.3 }}>
              {u.amount != null && <span style={{ fontWeight: 600 }}>{formatAmount(u.amount)}</span>}
              <span>{u.isStale ? `${rel} — statement pending` : rel}</span>
            </div>
          ) : null;
          return (
            <div key={u.key} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderRadius: 6,
              gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Icon size={14} color={color} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#cdd6f4", fontWeight: 500 }}>{u.label}</span>
              </div>
              <Tooltip text={tooltipText} side="right" sideOffset={14} delay={200}>
                <span style={{ fontSize: 12, color: u.isStale && u.found ? "#f97316" : "rgba(255,255,255,0.4)", whiteSpace: "nowrap", cursor: tooltipText ? "help" : "default" }}>
                  {dateText}
                </span>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  ) : null;

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tooltip text="Utility statement status">
                <button
                  ref={statusBtnRef}
                  onClick={() => setStatusOpen(v => !v)}
                  style={{
                    position: "relative",
                    color: statusOpen ? "#cba6da" : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: statusOpen ? "rgba(203,166,218,0.08)" : "rgba(255,255,255,0.04)",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                >
                  <Zap size={18} strokeWidth={1.8} />
                  {anyStale && (
                    <span style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#f97316",
                      boxShadow: "0 0 6px rgba(249,115,22,0.5)",
                    }} />
                  )}
                  {allFresh && (
                    <span style={{
                      position: "absolute",
                      top: 5,
                      right: 5,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#a6e3a1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 6px rgba(166,227,161,0.5)",
                    }}>
                      <Check size={8} color="#16161e" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              </Tooltip>
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

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.35)", padding: 6, fontWeight: 500, letterSpacing: 0.5 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid — keyed by month to prevent stale CSS transitions */}
          <div
            key={`${viewYear}-${viewMonth}`}
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
              const bills = billsByDay[day] || [];
              const hasBills = bills.length > 0;
              const isToday = isCurrentMonth && day === todayDate;
              const isSelected = selectedDay === day;
              const hasOverdue = bills.some(b => daysUntil(b.next_date) < 0);

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
              } else if (hasOverdue) {
                cellBg = "rgba(243,139,168,0.06)";
                cellBorder = "1px solid rgba(243,139,168,0.15)";
              }

              return (
                <div
                  key={day}
                  onClick={() => hasBills && setSelectedDay(isSelected ? null : day)}
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    borderRadius: 8,
                    padding: "6px 8px",
                    background: cellBg,
                    border: cellBorder,
                    boxShadow: cellShadow,
                    cursor: hasBills ? "pointer" : "default",
                    transition: "box-shadow 150ms, border-color 150ms",
                  }}
                >
                  <div style={{ fontSize: 13, color: dateColor, fontWeight: dateWeight }}>
                    {day}
                  </div>
                  {isToday && !hasBills && (
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#f97316", marginTop: 2, letterSpacing: 0.5 }}>TODAY</div>
                  )}
                  {bills.slice(0, MAX_PILLS).map(b => {
                    const d = daysUntil(b.next_date);
                    const uc = urgencyColor(d);
                    const amountColor = b.paid ? "#a6e3a1" : hasOverdue && d < 0 ? "#f38ba8" : uc.text === "rgba(205,214,244,0.5)" ? "#a6e3a1" : uc.text;
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: "flex",
                          gap: 4,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        <span style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                          color: "rgba(205,214,244,0.45)",
                          textDecoration: b.paid ? "line-through" : "none",
                        }}>
                          {b.name}
                        </span>
                        <span style={{ flexShrink: 0, color: amountColor, fontWeight: 500, textDecoration: b.paid ? "line-through" : "none" }}>
                          {formatAmount(b.amount).replace(".00", "")}
                        </span>
                      </div>
                    );
                  })}
                  {bills.length > MAX_PILLS && (
                    <div style={{ fontSize: 10, color: "rgba(203,166,218,0.6)", marginTop: 2 }}>
                      +{bills.length - MAX_PILLS} more
                    </div>
                  )}
                </div>
              );
            })}

            {Array.from({ length: trailingEmpty }, (_, i) => (
              <div key={`trail-${i}`} />
            ))}
          </div>

          {/* Detail area — fixed height, always present */}
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
              <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, color: "#cba6da", fontWeight: 500 }}>
                    {formatFullDate(viewYear, viewMonth, selectedDay)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                    {selectedBills.length} payment{selectedBills.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedBills.map(b => {
                    const days = daysUntil(b.next_date);
                    const uc = urgencyColor(days);
                    const accent = b.paid ? "#a6e3a1" : uc.accent;
                    const rowBg = b.paid ? "rgba(166,227,161,0.06)" : uc.bg;
                    const amountColor = b.paid ? "#a6e3a1" : uc.text;
                    const scheduleUrl = actualBudgetUrl
                      ? `${actualBudgetUrl.replace(/\/+$/, "")}/schedules?highlight=${b.id}`
                      : null;
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: rowBg,
                          border: `1px solid ${accent}18`,
                          borderRadius: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, color: "#cdd6f4" }}>{b.name}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                            {b.paid && <Check size={11} style={{ color: "#a6e3a1" }} />}
                            {b.paid ? "Paid" : daysLabel(days)}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: amountColor }}>
                            {formatAmount(b.amount)}
                          </div>
                          {scheduleUrl && (
                            <Tooltip text="Edit Schedule in Actual">
                              <a
                                href={scheduleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  color: "rgba(203,166,218,0.5)",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: 4,
                                  borderRadius: 4,
                                  transition: "color 150ms",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = "#cba6da"}
                                onMouseLeave={(e) => e.currentTarget.style.color = "rgba(203,166,218,0.5)"}
                              >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                  <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  <path d="M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </a>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  Day total: <span style={{ color: "#cdd6f4", fontWeight: 600 }}>
                    {formatAmount(selectedBills.reduce((sum, b) => sum + b.amount, 0))}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Click a day to see details</span>
              </div>
            )}
          </div>

          {/* Month total footer — always pinned */}
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
            }}
          >
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
              {new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long" })} total
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#cdd6f4" }}>
              {formatAmount(monthTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
    {statusPopover}
    </>,
    document.body,
  );
}
