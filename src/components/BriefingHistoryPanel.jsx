import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getBriefingHistory, getBriefingById } from "../api";
import { transformBriefing } from "../transform";

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
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        width: 360,
        maxHeight: `min(420px, calc(100vh - ${pos.top + 16}px))`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#16161e",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
        zIndex: 9999,
        animation: "historyFadeIn 0.25s cubic-bezier(0.16,1,0.3,1)",
        isolation: "isolate",
      }}
    >
      <style>{`
        @keyframes historyFadeIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .history-row {
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          cursor: pointer;
        }
        .history-row:hover {
          background: rgba(255,255,255,0.06) !important;
          padding-left: 22px !important;
        }
        .history-row:active {
          background: rgba(99,102,241,0.12) !important;
          transform: scale(0.98);
        }
        .history-row[data-active="true"]:hover {
          background: rgba(99,102,241,0.15) !important;
        }
      `}</style>

      {/* Header — fixed above scroll area */}
      <div style={{
        padding: "16px 20px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "#16161e",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8", fontWeight: 600 }}>
          Briefing History
        </div>
        {history && (
          <span style={{ fontSize: 10, color: "#475569" }}>
            {groups.reduce((sum, g) => sum + g.items.length, 0)} briefings
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ overflowY: "auto", overscrollBehavior: "contain", flex: 1 }}>

        {/* Loading state */}
        {!history && !error && (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <div style={{
              width: 18, height: 18, border: "2px solid rgba(255,255,255,0.08)",
              borderTopColor: "#818cf8", borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 10px",
            }} />
            <div style={{ fontSize: 12, color: "#64748b" }}>Loading history...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ padding: "20px 20px", fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {history && groups.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>No past briefings yet</div>
          </div>
        )}

        {/* Briefing list grouped by date */}
        <div style={{ padding: "4px 0 8px" }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div style={{
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
              color: "#64748b", fontWeight: 600, padding: "14px 20px 6px",
            }}>
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
                  className="history-row"
                  data-active={isActive}
                  onClick={() => handleSelect(item)}
                  style={{
                    padding: "14px 20px",
                    margin: "2px 8px",
                    borderRadius: 8,
                    borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent",
                    cursor: isActive ? "default" : isLoading ? "wait" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 12,
                    background: isActive ? "rgba(99,102,241,0.1)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: isActive ? "#6366f1" : "rgba(255,255,255,0.15)",
                      boxShadow: isActive ? "0 0 8px rgba(99,102,241,0.4)" : "none",
                      transition: "all 0.2s ease",
                    }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: isActive ? "#c7d2fe" : "#f1f5f9" }}>
                        {time}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        {timeAgo(item._date)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isLoading && (
                      <div style={{
                        width: 14, height: 14, border: "2px solid rgba(99,102,241,0.3)",
                        borderTopColor: "#818cf8", borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }} />
                    )}
                    {genTime && !isLoading && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: "#a5b4fc",
                        background: "rgba(129,140,248,0.1)",
                        padding: "3px 8px", borderRadius: 6,
                        letterSpacing: 0.3,
                      }}>
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
