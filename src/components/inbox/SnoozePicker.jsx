import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { NumberField } from "./primitives";
import {
  computePlacement, buildSnoozePresets, laComponents, epochFromLa,
  DASHBOARD_TZ,
} from "./helpers";

// Custom calendar + time view rendered inside SnoozePicker when the user
// chooses "Pick date & time". Draft state is stored as {year, month, day,
// hour, minute} in DASHBOARD_TZ so display and editing never touch the
// browser's ambient timezone — we only convert to/from epoch at the edges
// (default init, confirm).
export function CustomDateTimeView({
  nowTick,
  onSelect,
  onBack,
  initialEpoch = null,
  accent = "#f97316",
  confirmLabel = "Snooze",
}) {
  const confirmButtonRef = useRef(null);
  const advanceFocusToConfirmRef = useRef(false);
  // "today" in dashboard TZ — used to disable past days.
  const today = useMemo(() => laComponents(nowTick), [nowTick]);

  // Initial draft: current LA time, rounded up to the next whole minute.
  // Avoids a confusing "+6h" pre-offset — the presets already cover interval
  // shortcuts — and rounding ensures draftEpoch > nowTick so the Snooze button
  // is enabled without forcing an adjustment first.
  const [draft, setDraft] = useState(() => {
    if (Number.isFinite(initialEpoch)) return laComponents(initialEpoch);
    const nextMinute = Math.ceil(nowTick / 60_000) * 60_000;
    return laComponents(nextMinute);
  });
  // Month being displayed in the calendar (may differ from draft if user
  // navigated months without yet picking a day).
  const [viewYear, setViewYear] = useState(draft.year);
  const [viewMonth, setViewMonth] = useState(draft.month);
  const [ampmFocused, setAmPmFocused] = useState(false);

  // Build 42 day cells for the calendar — identified by {year, month, day}
  // rather than JS Date objects so we stay timezone-neutral throughout.
  const cells = useMemo(() => {
    // "first of viewMonth" as a UTC instant is fine for day-of-week math
    // because the DOW of (Y,M,1) is the same in every timezone.
    const firstDow = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const out = [];
    for (let i = 0; i < 42; i++) {
      const dayOffset = i - firstDow;
      const cellDate = new Date(Date.UTC(viewYear, viewMonth, 1 + dayOffset));
      out.push({
        year: cellDate.getUTCFullYear(),
        month: cellDate.getUTCMonth(),
        day: cellDate.getUTCDate(),
        inMonth: cellDate.getUTCMonth() === viewMonth,
      });
    }
    return out;
  }, [viewYear, viewMonth]);

  const changeMonth = (delta) => {
    const d = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  };

  // Day ordering helper — lexicographic (year, month, day) since we never
  // compare fractional days.
  const compareDay = (a, b) =>
    (a.year - b.year) || (a.month - b.month) || (a.day - b.day);

  const selectDay = (cell) => {
    if (compareDay(cell, today) < 0) return;
    setDraft((prev) => ({ ...prev, year: cell.year, month: cell.month, day: cell.day }));
    if (cell.month !== viewMonth || cell.year !== viewYear) {
      setViewYear(cell.year);
      setViewMonth(cell.month);
    }
  };

  const hour24 = draft.hour;
  const hour12 = ((hour24 + 11) % 12) + 1;
  const minute = draft.minute;
  const isPm = hour24 >= 12;

  const setHour12 = (h) => {
    const h24 = isPm ? (h % 12) + 12 : h % 12;
    setDraft((prev) => ({ ...prev, hour: h24 }));
  };
  const setMinuteVal = (m) => {
    setDraft((prev) => ({ ...prev, minute: Math.max(0, Math.min(59, m)) }));
  };
  const setAmPm = (pm) => {
    const newHour24 = (hour24 % 12) + (pm ? 12 : 0);
    setDraft((prev) => ({ ...prev, hour: newHour24 }));
  };

  const handleAmPmKeyDown = (event) => {
    const key = event.key.toLowerCase();
    if (key === "a") {
      event.preventDefault();
      advanceFocusToConfirmRef.current = true;
      setAmPm(false);
      return;
    }
    if (key === "p") {
      event.preventDefault();
      advanceFocusToConfirmRef.current = true;
      setAmPm(true);
      return;
    }
    if (key === "arrowleft" || key === "arrowdown") {
      event.preventDefault();
      setAmPm(false);
      return;
    }
    if (key === "arrowright" || key === "arrowup") {
      event.preventDefault();
      setAmPm(true);
      return;
    }
    if (key === " " || key === "enter") {
      event.preventDefault();
      setAmPm(!isPm);
    }
  };

  useEffect(() => {
    if (!advanceFocusToConfirmRef.current) return;
    advanceFocusToConfirmRef.current = false;
    confirmButtonRef.current?.focus();
  }, [draft.hour]);

  const draftEpoch = epochFromLa(draft.year, draft.month, draft.day, draft.hour, draft.minute);
  const confirmDisabled = draftEpoch <= nowTick;

  // Month label in LA — use Intl with explicit timeZone so the label always
  // matches the components we're editing (avoids "December" in LA displayed
  // as "January" if rendered under a different ambient TZ near midnight).
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long", year: "numeric",
    timeZone: DASHBOARD_TZ,
  }).format(new Date(Date.UTC(viewYear, viewMonth, 15, 12))); // noon-of-15th = DST-safe anchor

  const navBtn = (active = false) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 24, height: 24, padding: 0,
    background: active ? "rgba(255,255,255,0.04)" : "transparent",
    border: "none", borderRadius: 6, cursor: "pointer",
    color: "rgba(205,214,244,0.75)", transition: "background 120ms, color 120ms",
  });

  const segmentBtn = (selected) => ({
    padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    fontFamily: "inherit", border: "none", cursor: "pointer", borderRadius: 6,
    background: selected ? accent : "transparent",
    color: selected ? "#ffffff" : "rgba(205,214,244,0.65)",
    transition: "background 120ms, color 120ms",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Month header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "4px 6px 8px",
        }}
      >
        <button
          type="button" aria-label="Previous month"
          onClick={() => changeMonth(-1)} style={navBtn()}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ChevronLeft size={14} />
        </button>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
          {monthLabel}
        </div>
        <button
          type="button" aria-label="Next month"
          onClick={() => changeMonth(1)} style={navBtn()}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday header */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
          padding: "0 4px 4px",
        }}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            style={{
              textAlign: "center", fontSize: 10, fontWeight: 600,
              color: "rgba(205,214,244,0.4)", letterSpacing: 0.4,
              padding: "4px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
          padding: "0 4px 8px",
        }}
      >
        {cells.map((cell, i) => {
          const isPast = compareDay(cell, today) < 0;
          const isToday = compareDay(cell, today) === 0;
          const isSelected =
            cell.year === draft.year && cell.month === draft.month && cell.day === draft.day;
          const baseColor = !cell.inMonth
            ? "rgba(205,214,244,0.3)"
            : isPast
              ? "rgba(205,214,244,0.22)"
              : "rgba(205,214,244,0.85)";
          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => selectDay(cell)}
              onMouseEnter={(e) => {
                if (isPast || isSelected) return;
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                if (isSelected) return;
                e.currentTarget.style.background = "transparent";
              }}
              style={{
                height: 28, padding: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontFamily: "inherit", fontWeight: isSelected ? 700 : 500,
                fontVariantNumeric: "tabular-nums",
                color: isSelected ? "#ffffff" : baseColor,
                background: isSelected ? accent : "transparent",
                border: isToday && !isSelected
                  ? `1px solid color-mix(in srgb, ${accent} 60%, transparent)`
                  : "1px solid transparent",
                borderRadius: 6,
                cursor: isPast ? "not-allowed" : "pointer",
                transition: "background 120ms, color 120ms",
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Time row */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <NumberField
          value={hour12} onChange={setHour12} min={1} max={12}
          ariaLabel="hour"
          accent={accent}
        />
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(205,214,244,0.5)" }}>:</div>
        <NumberField
          value={minute} onChange={setMinuteVal} min={0} max={59} pad={2}
          ariaLabel="minute"
          accent={accent}
        />
        <div
          style={{
            display: "inline-flex", marginLeft: 4, padding: 2, gap: 2,
            background: "rgba(255,255,255,0.04)",
            border: ampmFocused
              ? `1px solid color-mix(in srgb, ${accent} 55%, transparent)`
              : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            boxShadow: ampmFocused
              ? `0 0 0 1px color-mix(in srgb, ${accent} 14%, transparent)`
              : "none",
            transition: "border-color 120ms, box-shadow 120ms",
          }}
          role="group"
          aria-label="AM or PM"
          tabIndex={0}
          onFocus={() => setAmPmFocused(true)}
          onBlur={() => setAmPmFocused(false)}
          onKeyDown={handleAmPmKeyDown}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={!isPm}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAmPm(false)}
            style={segmentBtn(!isPm)}
          >
            AM
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={isPm}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAmPm(true)}
            style={segmentBtn(isPm)}
          >
            PM
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 8,
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(205,214,244,0.75)", fontSize: 11, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
            transition: "background 120ms",
          }}
        >
          <ChevronLeft size={12} />
          Back
        </button>
        <button
          ref={confirmButtonRef}
          type="button"
          disabled={confirmDisabled}
          onClick={() => onSelect(draftEpoch)}
          style={{
            padding: "6px 14px", borderRadius: 8,
            background: confirmDisabled
              ? `color-mix(in srgb, ${accent} 20%, transparent)`
              : accent,
            border: confirmDisabled
              ? `1px solid color-mix(in srgb, ${accent} 25%, transparent)`
              : `1px solid ${accent}`,
            color: confirmDisabled ? "rgba(255,255,255,0.5)" : "#ffffff",
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
            fontFamily: "inherit",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            transition: "background 120ms, transform 120ms",
          }}
          onMouseEnter={(e) => {
            if (confirmDisabled) return;
            e.currentTarget.style.background = `color-mix(in srgb, ${accent} 82%, white)`;
          }}
          onMouseLeave={(e) => {
            if (confirmDisabled) return;
            e.currentTarget.style.background = accent;
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

// Floating picker anchored to the Snooze button. Follows the project's
// "Floating Panel Pattern" — portal, fixed positioning, isolated stacking,
// click-outside dismiss, and wheel-boundary capture so scroll inside the
// picker can't leak to the page.
export default function SnoozePicker({ anchorRef, onSelect, onClose }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  // View state: "presets" shows quick-picks, "custom" shows the calendar +
  // time view. Swapping views changes panel dimensions, so the placement
  // effect re-runs (view is in its dep array) to keep overflow handling sound.
  const [view, setView] = useState("presets");
  // nowTick drives live-updating preview text on "+6h" / "+24h" rows so the
  // labels stay accurate while the picker sits open. 60s cadence is coarse
  // enough to avoid needless renders and fine enough to feel fresh.
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function updatePos() {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const panelW = view === "custom" ? 300 : 240;
      const panelH = view === "custom" ? 400 : 180;
      setPos({ ...computePlacement(r, panelW, panelH), panelW, panelH });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchorRef, view]);

  useEffect(() => {
    function onDown(e) {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose, anchorRef]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      const atTop = el.scrollTop === 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) e.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pos]);

  if (!pos) return null;
  const presets = buildSnoozePresets(nowTick);

  const handlePick = (ts) => { onSelect(ts); onClose(); };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{
        position: "fixed", top: pos.top, left: pos.left,
        width: pos.panelW,
        // Allow shrinkage on very small viewports — the placement clamp keeps
        // us on screen but the content may need to scroll inside the panel.
        maxHeight: `min(${pos.panelH}px, calc(100vh - 20px))`,
        overflowY: "auto",
        overscrollBehavior: "contain", isolation: "isolate",
        background: "#16161e",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        padding: view === "custom" ? 8 : 6,
        zIndex: 9999,
        fontFamily: "inherit",
      }}
    >
      {view === "presets" ? (
        <>
          <div
            style={{
              padding: "6px 10px 8px",
              fontSize: 10, color: "rgba(205,214,244,0.4)",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >
            Snooze until
          </div>
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePick(p.at)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "8px 10px",
                background: "transparent", border: "none", cursor: "pointer",
                color: "rgba(205,214,244,0.85)", fontSize: 12, fontFamily: "inherit",
                borderRadius: 6, textAlign: "left",
              }}
            >
              <span>{p.label}</span>
              <span style={{ fontSize: 10, color: "rgba(205,214,244,0.4)" }}>
                {new Date(p.at).toLocaleString([], {
                  weekday: "short", hour: "numeric", minute: "2-digit",
                  timeZone: DASHBOARD_TZ,
                })}
              </span>
            </button>
          ))}
          <div
            style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 8px" }}
            role="separator"
          />
          <button
            type="button"
            onClick={() => setView("custom")}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 10px",
              background: "transparent", border: "none", cursor: "pointer",
              color: "rgba(205,214,244,0.85)", fontSize: 12, fontFamily: "inherit",
              borderRadius: 6, textAlign: "left",
            }}
          >
            <CalendarClock size={12} color="rgba(205,214,244,0.6)" />
            <span>Pick date &amp; time</span>
          </button>
        </>
      ) : (
        <CustomDateTimeView
          nowTick={nowTick}
          onSelect={handlePick}
          onBack={() => setView("presets")}
        />
      )}
    </div>,
    document.body,
  );
}
