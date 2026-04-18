import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Clock, ClipboardList, Trash2, Check } from "lucide-react";
import { getBriefingHistory, getBriefingById } from "../../api";
import { transformBriefing } from "../../transform";
import { timeAgo } from "../../lib/dashboard-helpers";
import useIsMobile from "../../hooks/useIsMobile";
import BottomSheet from "../ui/BottomSheet";

const TZ = "America/Los_Angeles";
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const ACCENT = "#cba6da";

function groupByDate(items) {
  const groups = [];
  const todayStr = dateFmt.format(new Date());
  const yesterdayStr = dateFmt.format(new Date(Date.now() - 86400000));

  let currentLabel = null;
  let currentItems = [];

  for (const item of items) {
    const raw = (item.generated_at || "").replace(" ", "T");
    const d = new Date(raw.includes("T") ? raw + (raw.endsWith("Z") ? "" : "Z") : raw + "T00:00:00Z");
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

function HistoryRow({ item, active, loading, confirming, deleting, isMobile, onSelect, onDelete }) {
  const [hover, setHover] = useState(false);
  const time = item._date.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
  });
  const genTime = item.generation_time_ms
    ? `${(item.generation_time_ms / 1000).toFixed(1)}s`
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", margin: "0 8px",
        padding: "10px 14px", borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        cursor: active ? "default" : loading ? "wait" : "pointer",
        background: active
          ? `${ACCENT}12`
          : hover
          ? "rgba(255,255,255,0.035)"
          : "transparent",
        border: `1px solid ${active ? `${ACCENT}30` : "transparent"}`,
        transition: "background 150ms, border-color 150ms",
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute", left: 0, top: 8, bottom: 8, width: 3,
            background: ACCENT, borderRadius: 2,
            boxShadow: `0 0 8px ${ACCENT}60`,
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 7, height: 7, borderRadius: 99, flexShrink: 0,
            background: active ? ACCENT : "rgba(255,255,255,0.18)",
            boxShadow: active ? `0 0 8px ${ACCENT}70` : "none",
            transition: "all 200ms",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums",
              color: active ? "#e2d0eb" : "rgba(205,214,244,0.9)",
              lineHeight: 1.2,
            }}
          >
            {time}
          </div>
          <div
            style={{
              fontSize: 10, marginTop: 2, color: "rgba(205,214,244,0.45)",
              lineHeight: 1.2,
            }}
          >
            {timeAgo(item._date)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {loading && (
          <div
            style={{
              width: 13, height: 13, borderRadius: 99,
              border: `1.5px solid ${ACCENT}30`,
              borderTopColor: ACCENT,
              animation: "spin 600ms linear infinite",
            }}
          />
        )}
        {genTime && !loading && (!hover || confirming || isMobile) && (
          <span
            style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3,
              fontVariantNumeric: "tabular-nums",
              color: active ? `${ACCENT}cc` : "rgba(180,190,254,0.55)",
              background: active ? `${ACCENT}14` : "rgba(180,190,254,0.08)",
              padding: "2px 7px", borderRadius: 6,
              opacity: confirming ? 0 : 1,
              transition: "opacity 150ms",
            }}
          >
            {genTime}{item.skipped_ai ? " · no AI" : ""}
          </span>
        )}
        {!active && !loading && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title={confirming ? "Click again to confirm" : "Delete briefing"}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              gap: 4, padding: confirming ? "3px 8px" : 0,
              width: confirming ? "auto" : 22, height: 22,
              borderRadius: 6, border: "none", cursor: "pointer",
              fontFamily: "inherit",
              background: confirming
                ? "rgba(243,139,168,0.18)"
                : hover
                ? "rgba(243,139,168,0.10)"
                : "transparent",
              color: confirming ? "#f38ba8" : hover ? "#f38ba8" : "rgba(205,214,244,0.4)",
              opacity: isMobile || hover || confirming ? 1 : 0,
              transition: "all 150ms",
            }}
          >
            {deleting ? (
              <div
                style={{
                  width: 11, height: 11, borderRadius: 99,
                  border: "1.5px solid rgba(243,139,168,0.25)",
                  borderTopColor: "#f38ba8",
                  animation: "spin 600ms linear infinite",
                }}
              />
            ) : confirming ? (
              <>
                <Check size={10} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>delete?</span>
              </>
            ) : (
              <Trash2 size={12} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function BriefingHistoryPanel({ activeId, triggerRef, onSelect, onClose, onDelete }) {
  const isMobile = useIsMobile();
  const [history, setHistory] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const confirmTimer = useRef(null);
  const [error, setError] = useState(null);
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);

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

  function handleDeleteClick(item) {
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
  const totalBriefings = groups.reduce((sum, g) => sum + g.items.length, 0);

  const content = (
    <div ref={scrollRef} style={{ overflowY: "auto", overscrollBehavior: "contain", flex: 1 }}>
      {!history && !error && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div
            style={{
              width: 16, height: 16, borderRadius: 99, margin: "0 auto 12px",
              border: `2px solid ${ACCENT}26`,
              borderTopColor: ACCENT,
              animation: "spin 600ms linear infinite",
            }}
          />
          <div style={{ fontSize: 11, color: "rgba(205,214,244,0.5)" }}>Loading history…</div>
        </div>
      )}

      {error && (
        <div
          style={{
            margin: "14px 16px", padding: "10px 12px", borderRadius: 8,
            fontSize: 11, color: "#f38ba8",
            background: "rgba(243,139,168,0.08)",
            border: "1px solid rgba(243,139,168,0.22)",
            textAlign: "center", lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {history && groups.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <ClipboardList size={22} color="rgba(205,214,244,0.25)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 11, color: "rgba(205,214,244,0.5)" }}>No past briefings yet</div>
        </div>
      )}

      <div style={{ padding: "6px 0" }}>
        {groups.map((group, gi) => (
          <div key={group.label}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "14px 20px 6px",
              }}
            >
              <span
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 2,
                  textTransform: "uppercase", color: "rgba(205,214,244,0.5)",
                  whiteSpace: "nowrap",
                }}
              >
                {group.label}
              </span>
              {gi > 0 && (
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
              )}
            </div>
            {group.items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                active={item.id === activeId}
                loading={loadingId === item.id}
                confirming={confirmId === item.id}
                deleting={deletingId === item.id}
                isMobile={isMobile}
                onSelect={() => handleSelect(item)}
                onDelete={() => handleDeleteClick(item)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="Briefing History">
        {content}
      </BottomSheet>
    );
  }

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="isolate animate-in fade-in slide-in-from-top-2 duration-250"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        width: 340,
        maxHeight: `min(460px, calc(100vh - ${pos.top + 16}px))`,
        zIndex: 9999,
        display: "flex", flexDirection: "column",
        background: "radial-gradient(ellipse at top left, #1a1a2a, #0d0d15 70%)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 18px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: `linear-gradient(135deg, ${ACCENT}0e, transparent 60%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: `${ACCENT}18`,
              display: "grid", placeItems: "center",
            }}
          >
            <Clock size={11} color={ACCENT} />
          </div>
          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2,
              textTransform: "uppercase", color: ACCENT,
            }}
          >
            History
          </span>
        </div>
        {history && (
          <span
            style={{
              fontSize: 10, fontWeight: 500, fontVariantNumeric: "tabular-nums",
              color: "rgba(205,214,244,0.55)",
            }}
          >
            {totalBriefings} briefing{totalBriefings === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {content}
    </div>,
    document.body
  );
}
