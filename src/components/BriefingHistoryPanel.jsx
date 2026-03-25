import { useState, useEffect, useRef } from "react";
import { getBriefingHistory, getBriefingById } from "../api";
import { transformBriefing } from "../transform";

function groupByDate(items) {
  const groups = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let currentLabel = null;
  let currentItems = [];

  for (const item of items) {
    const d = new Date(item.generated_at + "Z");
    const itemDate = new Date(d);
    itemDate.setHours(0, 0, 0, 0);

    let label;
    if (itemDate.getTime() === today.getTime()) label = "Today";
    else if (itemDate.getTime() === yesterday.getTime()) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

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

export default function BriefingHistoryPanel({ activeId, onSelect, onClose }) {
  const [history, setHistory] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    getBriefingHistory()
      .then(setHistory)
      .catch((err) => setError(err.message));
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  async function handleSelect(item) {
    if (loadingId || item.status !== "ready") return;
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

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 8,
        width: 340,
        maxHeight: 360,
        overflowY: "auto",
        background: "rgba(15,15,20,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        zIndex: 50,
        animation: "historyFadeIn 0.2s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <style>{`
        @keyframes historyFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .history-panel::-webkit-scrollbar { width: 4px; }
        .history-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .history-panel::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "12px 14px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0,
        background: "rgba(15,15,20,0.98)",
        zIndex: 1,
      }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
          Briefing History
        </div>
      </div>

      {/* Loading state */}
      {!history && !error && (
        <div style={{ padding: "24px 14px", textAlign: "center" }}>
          <div style={{
            width: 16, height: 16, border: "2px solid rgba(255,255,255,0.1)",
            borderTopColor: "#818cf8", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 8px",
          }} />
          <div style={{ fontSize: 12, color: "#64748b" }}>Loading history...</div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ padding: "16px 14px", fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {history && groups.length === 0 && (
        <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 12, color: "#64748b" }}>
          No past briefings yet
        </div>
      )}

      {/* Briefing list grouped by date */}
      <div className="history-panel">
        {groups.map((group) => (
          <div key={group.label}>
            <div style={{
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
              color: "#475569", fontWeight: 600, padding: "10px 14px 4px",
              background: "rgba(15,15,20,0.98)",
              position: "sticky", top: 36, zIndex: 1,
            }}>
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = item.id === activeId;
              const isLoading = loadingId === item.id;
              const time = item._date.toLocaleTimeString("en-US", {
                hour: "numeric", minute: "2-digit", hour12: true,
              });
              const genTime = item.generation_time_ms
                ? `${(item.generation_time_ms / 1000).toFixed(1)}s`
                : null;

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent",
                    cursor: isLoading ? "wait" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 8,
                    transition: "background 0.15s ease",
                    background: isActive ? "rgba(99,102,241,0.06)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? "#c7d2fe" : "#e2e8f0" }}>
                      {time}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                      {timeAgo(item._date)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isLoading && (
                      <div style={{
                        width: 12, height: 12, border: "2px solid rgba(99,102,241,0.3)",
                        borderTopColor: "#818cf8", borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }} />
                    )}
                    {genTime && !isLoading && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: "#818cf8",
                        background: "rgba(129,140,248,0.1)",
                        padding: "2px 6px", borderRadius: 4,
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
  );
}
