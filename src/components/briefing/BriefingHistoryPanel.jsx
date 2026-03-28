import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getBriefingHistory, getBriefingById } from "../../api";
import { transformBriefing } from "../../transform";

const TZ = "America/Los_Angeles";
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

function groupByDate(items) {
  const groups = [];
  const todayStr = dateFmt.format(new Date());
  const yesterdayStr = dateFmt.format(new Date(Date.now() - 86400000));

  let currentLabel = null;
  let currentItems = [];

  for (const item of items) {
    const d = new Date(item.generated_at + "Z");
    const itemDateStr = dateFmt.format(d);

    let label;
    if (itemDateStr === todayStr) label = "Today";
    else if (itemDateStr === yesterdayStr) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });

    if (label !== currentLabel) {
      if (currentLabel !== null) groups.push({ label: currentLabel, items: currentItems });
      currentLabel = label;
      currentItems = [];
    }
    currentItems.push({ ...item, _date: d });
  }
  if (currentLabel !== null) groups.push({ label: currentLabel, items: currentItems });

  return groups;
}

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BriefingHistoryPanel({ activeId, triggerRef, onSelect, onClose, onDelete }) {
  const [history, setHistory] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const confirmTimer = useRef(null);
  const [error, setError] = useState(null);
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);

  // Position below trigger, recalc on scroll/resize
  const updatePos = useCallback(() => {
    if (!triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [triggerRef]);

  useEffect(() => {
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [updatePos]);

  // Trap scroll inside panel — prevent page from scrolling when cursor is over it
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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
  });

  useEffect(() => {
    getBriefingHistory()
      .then(setHistory)
      .catch((err) => setError(err.message));
  }, []);

  // Click outside to close (ignore clicks on the trigger button)
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target) &&
          !(triggerRef?.current && triggerRef.current.contains(e.target))) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose, triggerRef]);

  async function handleSelect(item) {
    if (loadingId || item.status !== "ready" || item.id === activeId) return;
    setLoadingId(item.id);
    setError(null);
    try {
      const res = await getBriefingById(item.id);
      const briefing = transformBriefing(res.briefing);
      onSelect(briefing, { id: item.id, generated_at: item.generated_at });
    } catch (err) {
      setError(`Failed to load briefing: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  }

  function handleDeleteClick(e, item) {
    e.stopPropagation();
    if (deletingId || item.id === activeId) return;
    if (confirmId === item.id) {
      clearTimeout(confirmTimer.current);
      setConfirmId(null);
      performDelete(item);
    } else {
      setConfirmId(item.id);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmId(null), 2000);
    }
  }

  async function performDelete(item) {
    setDeletingId(item.id);
    setError(null);
    try {
      if (onDelete) await onDelete(item.id);
      setHistory(prev => prev?.filter(h => h.id !== item.id));
    } catch (err) {
      setError(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    return () => clearTimeout(confirmTimer.current);
  }, []);

  const groups = history ? groupByDate(history.filter((h) => h.status === "ready")) : [];

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="z-[9999] isolate flex flex-col overflow-hidden w-[360px] animate-in fade-in slide-in-from-top-2 duration-250"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        maxHeight: `min(420px, calc(100vh - ${pos.top + 16}px))`,
        background: "linear-gradient(180deg, #24243a 0%, #1e1e2e 100%)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex justify-between items-center"
        style={{
          padding: "14px 20px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.015)",
        }}
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-[11px] tracking-[1.5px] uppercase text-muted-foreground font-semibold">
            History
          </span>
        </div>
        {history && (
          <span className="text-[10px] text-muted-foreground/60 font-medium tabular-nums">
            {groups.reduce((sum, g) => sum + g.items.length, 0)} briefings
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="overflow-y-auto overscroll-contain flex-1">

        {/* Loading state */}
        {!history && !error && (
          <div className="py-10 px-5 text-center">
            <div className="w-4 h-4 border-2 border-white/[0.06] border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <div className="text-[11px] text-muted-foreground">Loading history...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="py-6 px-5 text-[11px] text-destructive text-center leading-relaxed">
            {error}
          </div>
        )}

        {/* Empty state */}
        {history && groups.length === 0 && (
          <div className="py-10 px-5 text-center">
            <div className="text-2xl mb-2 opacity-60">📋</div>
            <div className="text-[11px] text-muted-foreground">No past briefings yet</div>
          </div>
        )}

        {/* Briefing list grouped by date */}
        <div className="py-1.5">
        {groups.map((group, gi) => (
          <div key={group.label}>
            {/* Date group header with rule line */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
              <span className="text-[10px] tracking-[1.5px] uppercase text-muted-foreground/70 font-semibold whitespace-nowrap">
                {group.label}
              </span>
              {gi > 0 && (
                <div className="flex-1 h-px bg-white/[0.04]" />
              )}
            </div>
            {group.items.map((item) => {
              const isActive = item.id === activeId;
              const isLoading = loadingId === item.id;
              const time = item._date.toLocaleTimeString("en-US", {
                hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
              });
              const genTime = item.generation_time_ms
                ? `${(item.generation_time_ms / 1000).toFixed(1)}s`
                : null;

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(item)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelect(item); }}
                  className={cn(
                    "group relative flex items-center justify-between gap-3 mx-2 rounded-lg transition-all duration-200",
                    isActive
                      ? "cursor-default"
                      : isLoading
                        ? "cursor-wait"
                        : "cursor-pointer active:scale-[0.98]",
                  )}
                  style={{
                    padding: "10px 16px",
                    background: isActive
                      ? "rgba(203,166,218,0.08)"
                      : undefined,
                  }}
                >
                  {/* Active glow edge */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                      style={{
                        background: "linear-gradient(180deg, #cba6da 0%, #b4befe 100%)",
                        boxShadow: "0 0 10px rgba(203,166,218,0.3)",
                      }}
                    />
                  )}

                  {/* Hover bg — separate element for smooth transition */}
                  {!isActive && !isLoading && (
                    <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.04] transition-colors duration-200" />
                  )}

                  <div className="relative flex items-center gap-3">
                    {/* Status dot */}
                    <div
                      className={cn(
                        "w-[7px] h-[7px] rounded-full shrink-0 transition-all duration-300",
                      )}
                      style={{
                        background: isActive
                          ? "#cba6da"
                          : "rgba(255,255,255,0.10)",
                        boxShadow: isActive
                          ? "0 0 8px rgba(203,166,218,0.45)"
                          : "none",
                      }}
                    />
                    <div>
                      <div className={cn(
                        "text-[13px] font-medium leading-tight tabular-nums",
                        isActive ? "text-[#e2d0eb]" : "text-foreground/90 group-hover:text-foreground",
                      )}>
                        {time}
                      </div>
                      <div className={cn(
                        "text-[10px] mt-0.5 leading-tight transition-colors duration-200",
                        isActive ? "text-muted-foreground/60" : "text-muted-foreground/50 group-hover:text-muted-foreground/70",
                      )}>
                        {timeAgo(item._date)}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex items-center gap-2">
                    {isLoading && (
                      <div className="w-3.5 h-3.5 border-[1.5px] border-primary/20 border-t-primary rounded-full animate-spin" />
                    )}
                    {genTime && !isLoading && (
                      <span
                        className={cn(
                          "text-[9px] font-semibold tracking-wide tabular-nums transition-opacity duration-200",
                          !isActive && "group-hover:opacity-0",
                          confirmId === item.id && "!opacity-0",
                        )}
                        style={{
                          color: isActive ? "rgba(203,166,218,0.7)" : "rgba(180,190,254,0.5)",
                          background: isActive ? "rgba(203,166,218,0.08)" : "rgba(180,190,254,0.06)",
                          padding: "2px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {genTime}
                      </span>
                    )}
                    {!isActive && !isLoading && (
                      <button
                        onClick={(e) => handleDeleteClick(e, item)}
                        className={cn(
                          "absolute right-0 flex items-center justify-center rounded-md transition-all duration-200",
                          confirmId === item.id
                            ? "opacity-100 bg-destructive/[0.12] px-2 py-0.5 gap-1"
                            : "opacity-0 group-hover:opacity-100 w-6 h-6 bg-transparent hover:bg-destructive/[0.12]",
                          "active:scale-90",
                          deletingId === item.id && "opacity-100 pointer-events-none",
                        )}
                        title={confirmId === item.id ? "Click again to confirm" : "Delete briefing"}
                      >
                        {deletingId === item.id ? (
                          <div className="w-3 h-3 border-[1.5px] border-destructive/20 border-t-destructive rounded-full animate-spin" />
                        ) : confirmId === item.id ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-[9px] font-semibold text-destructive">delete?</span>
                          </>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50 hover:text-destructive transition-colors duration-200">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </div>,
    document.body
  );
}
