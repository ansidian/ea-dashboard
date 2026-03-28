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

export default function BriefingHistoryPanel({ activeId, triggerRef, onSelect, onClose }) {
  const [history, setHistory] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
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

  const groups = history ? groupByDate(history.filter((h) => h.status === "ready")) : [];

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="bg-elevated border border-white/10 rounded-xl shadow-modal z-[9999] animate-in fade-in slide-in-from-top-2 duration-250 isolate flex flex-col overflow-hidden w-[360px]"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        maxHeight: `min(420px, calc(100vh - ${pos.top + 16}px))`,
      }}
    >
      {/* Header — fixed above scroll area */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.08] bg-elevated flex justify-between items-center shrink-0">
        <div className="text-[11px] tracking-[1.5px] uppercase text-text-secondary font-semibold">
          Briefing History
        </div>
        {history && (
          <span className="text-[10px] text-[#475569]">
            {groups.reduce((sum, g) => sum + g.items.length, 0)} briefings
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="overflow-y-auto overscroll-contain flex-1">

        {/* Loading state */}
        {!history && !error && (
          <div className="py-8 px-5 text-center">
            <div className="w-[18px] h-[18px] border-2 border-white/[0.08] border-t-accent-light rounded-full animate-spin mx-auto mb-2.5" />
            <div className="text-xs text-text-muted">Loading history...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="py-5 px-5 text-xs text-red-300 text-center">
            {error}
          </div>
        )}

        {/* Empty state */}
        {history && groups.length === 0 && (
          <div className="py-8 px-5 text-center">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-xs text-text-muted">No past briefings yet</div>
          </div>
        )}

        {/* Briefing list grouped by date */}
        <div className="pt-1 pb-2">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="text-[10px] tracking-[1.5px] uppercase text-text-muted font-semibold px-5 pt-3.5 pb-1.5">
              {group.label}
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
                    "flex items-center justify-between gap-3 py-3.5 px-5 mx-2 rounded-lg border-l-[3px] transition-all duration-200",
                    isActive
                      ? "border-l-accent bg-accent/10 cursor-default hover:bg-accent/15"
                      : isLoading
                        ? "border-l-transparent cursor-wait"
                        : "border-l-transparent cursor-pointer hover:bg-surface-hover hover:pl-[22px] active:bg-accent/[0.12] active:scale-[0.98]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0 transition-all duration-200",
                        isActive ? "shadow-[0_0_8px_rgba(99,102,241,0.4)]" : "shadow-none",
                      )}
                      style={{ background: isActive ? "#6366f1" : "rgba(255,255,255,0.15)" }}
                    />
                    <div>
                      <div className={cn(
                        "text-sm font-medium",
                        isActive ? "text-accent-lightest" : "text-text-primary",
                      )}>
                        {time}
                      </div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {timeAgo(item._date)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isLoading && (
                      <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent-light rounded-full animate-spin" />
                    )}
                    {genTime && !isLoading && (
                      <span className="text-[10px] font-semibold text-accent-lighter bg-accent-light/10 px-2 py-0.5 rounded-md tracking-wide">
                        {genTime}
                      </span>
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
