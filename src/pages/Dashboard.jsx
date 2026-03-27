import { useState, useEffect, useRef } from "react";
import { getLatestBriefing, triggerGeneration, quickRefresh, pollStatus, checkInProgress, getSettings, dismissEmail, skipSchedule } from "../api";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) return { label: "Late Night Briefing", greeting: "Burning the midnight oil." };
  if (hour < 12) return { label: "Morning Briefing", greeting: "Good morning." };
  if (hour < 15) return { label: "Afternoon Briefing", greeting: "Good afternoon." };
  if (hour < 18) return { label: "Evening Briefing", greeting: "Good evening." };
  return { label: "Evening Briefing", greeting: "Good evening." };
}
import { transformBriefing } from "../transform";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ErrorState from "../components/ErrorState";
import RefreshBanner from "../components/RefreshBanner";
import BriefingHistoryPanel from "../components/BriefingHistoryPanel";
import CTMCard from "../components/CTMCard";
import EmailBody from "../components/EmailBody";

const urgencyStyles = {
  high: { bg: "rgba(239,68,68,0.1)", border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  medium: { bg: "rgba(245,158,11,0.08)", border: "#f59e0b", text: "#fcd34d", dot: "#f59e0b" },
  low: { bg: "rgba(107,114,128,0.08)", border: "#6b7280", text: "#9ca3af", dot: "#6b7280" },
};

const typeLabels = {
  transfer: { label: "Card Payment", color: "#818cf8", icon: "💳" },
  bill: { label: "Recurring Bill", color: "#34d399", icon: "📄" },
  expense: { label: "One-time Expense", color: "#f97316", icon: "🛒" },
  income: { label: "Income", color: "#22d3ee", icon: "💰" },
};

function parseDueDate(dateStr) {
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDueDate(dateStr);
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `Overdue (${Math.abs(diff)}d)`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 6) return due.toLocaleDateString("en-US", { weekday: "long" });
  return due.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function Section({ title, children, delay, loaded }) {
  return (
    <div style={{ marginBottom: 28, opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(12px)", transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}>
      <h2 style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "#475569", fontWeight: 600, margin: "0 0 12px 0" }}>{title}</h2>
      {children}
    </div>
  );
}

function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatShortTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function Dashboard() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // quick refresh in progress
  const [generating, setGenerating] = useState(false); // full AI generation in progress
  const [error, setError] = useState(null);
  const [activeAccount, setActiveAccount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loadingBillId, setLoadingBillId] = useState(null); // bill card waiting for email body
  const [confirmDismissId, setConfirmDismissId] = useState(null); // first-seen dismiss confirmation
  const [expandedTask, setExpandedTask] = useState(null);
  const [holdConfirm, setHoldConfirm] = useState(false); // show "Generate fresh AI briefing?" confirm
  const [modelLabel, setModelLabel] = useState("Claude");
  const [genProgress, setGenProgress] = useState(null); // progress text from server
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingPast, setViewingPast] = useState(null); // { id, generated_at } when viewing a past briefing
  const [latestBriefing, setLatestBriefing] = useState(null); // preserved so "Back to latest" is instant
  const [latestId, setLatestId] = useState(null); // id of the most recent briefing
  const [schedules, setSchedules] = useState([]); // user's briefing schedules
  const [nextBriefingHover, setNextBriefingHover] = useState(false);
  const [refreshHover, setRefreshHover] = useState(false);
  const holdTimerRef = useRef(null);
  const [holdProgress, setHoldProgress] = useState(0); // 0-100 for progress bar
  const holdProgressRef = useRef(null);
  const emailSectionRef = useRef(null);
  const ctmSectionRef = useRef(null);
  const historyTriggerRef = useRef(null);

  // Scroll is handled by EmailBody once the body finishes loading (or immediately if already cached)

  useEffect(() => {
    getSettings()
      .then((s) => {
        const id = s?.claude_model || "claude-haiku-4-5-20251001";
        // "claude-haiku-4-5-20251001" → "Claude Haiku 4.5"
        const name = id
          .replace(/^claude-/, "")
          .replace(/-\d{8,}$/, "")
          .replace(
            /(\w+)-(\d+)-(\d+)/,
            (_, n, maj, min) =>
              `${n.charAt(0).toUpperCase() + n.slice(1)} ${maj}.${min}`,
          )
          .replace(/(\w+)$/, (m) => m.charAt(0).toUpperCase() + m.slice(1));
        setModelLabel(`Claude ${name}`);
        if (s?.schedules) setSchedules(s.schedules);
      })
      .catch(() => {});

    // Resume polling if a generation is already in progress (e.g. navigated away and back)
    checkInProgress()
      .then(({ generating: inProgress, id, progress }) => {
        if (inProgress && id) {
          if (progress) setGenProgress(progress);
          startPolling(id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getLatestBriefing()
      .then((res) => {
        const transformed = transformBriefing(res.briefing);
        setBriefing(transformed);
        setLatestBriefing(transformed);
        setLatestId(res.id);

        // Always quick-refresh on load to get fresh weather/calendar/CTM
        // Skip refresh in mock mode — it would overwrite the mock with real data
        const isMock = new URLSearchParams(window.location.search).has("mock");
        if (isMock) return;
        sessionStorage.removeItem("ea_settings_changed");
        setRefreshing(true);
        quickRefresh()
          .then((result) => {
            const updated = transformBriefing(result.briefingJson);
            setBriefing(updated);
            setLatestBriefing(updated);
            setLatestId(result.id);
          })
          .catch(() => {})
          .finally(() => setRefreshing(false));
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setTimeout(() => setLoaded(true), 100);
      });
  }, []);

  // Dismiss an email from current and future briefings
  async function handleDismiss(emailId) {
    dismissEmail(emailId).catch(() => {}); // fire and forget
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      for (const acct of updated.emails?.accounts || []) {
        acct.important = acct.important.filter(e => e.id !== emailId);
        acct.unread = acct.important.length;
      }
      return updated;
    });
  }

  // Quick refresh: tap — raw data only, no Haiku
  async function handleQuickRefresh() {
    if (refreshing || generating) return;
    setRefreshing(true);
    try {
      const result = await quickRefresh();
      const transformed = transformBriefing(result.briefingJson);
      setBriefing(transformed);
      setLatestBriefing(transformed);
      setLatestId(result.id);
      setViewingPast(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  // Start polling an in-progress briefing by ID
  function startPolling(id) {
    setGenerating(true);
    const poll = setInterval(async () => {
      try {
        const { status, error_message, progress } = await pollStatus(id);
        if (progress) setGenProgress(progress);
        if (status === "ready") {
          clearInterval(poll);
          setGenProgress(null);
          const res = await getLatestBriefing();
          const transformed = transformBriefing(res.briefing);
          setBriefing(transformed);
          setLatestBriefing(transformed);
          setLatestId(res.id);
          setViewingPast(null);
          setGenerating(false);
        } else if (status === "error") {
          clearInterval(poll);
          setGenProgress(null);
          setError(error_message);
          setGenerating(false);
        }
      } catch {
        clearInterval(poll);
        setGenProgress(null);
        setError("Lost connection while generating briefing.");
        setGenerating(false);
      }
    }, 2000);
  }

  // Full generation: hold → confirm → Claude call
  async function handleFullGeneration() {
    setHoldConfirm(false);
    setGenerating(true);
    try {
      const genResult = await triggerGeneration();

      startPolling(genResult.id);
    } catch (err) {
      setError(err.message);
      setGenerating(false);
    }
  }

  // Long press handlers for the refresh button
  const HOLD_DURATION = 600;
  function startHold() {
    if (refreshing || generating) return;
    setHoldProgress(0);
    const start = Date.now();
    holdProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(pct);
    }, 16);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = "fired";
      clearInterval(holdProgressRef.current);
      setHoldProgress(0);
      setHoldConfirm(true);
    }, HOLD_DURATION);
  }
  function endHold(cancel) {
    clearInterval(holdProgressRef.current);
    setHoldProgress(0);
    if (holdTimerRef.current === "fired") {
      holdTimerRef.current = null;
      return;
    }
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (!cancel) handleQuickRefresh();
  }
  function onPointerDown() {
    startHold();
  }
  function onPointerUp() {
    endHold(false);
  }
  function onPointerLeave() {
    endHold(true);
  }

  // R hotkey: tap = quick refresh, hold = full generation (same as button)
  useEffect(() => {
    function onKeyDown(e) {
      if (
        e.repeat ||
        e.key !== "r" ||
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA"
      )
        return;
      if (holdConfirm) {
        handleFullGeneration();
        return;
      }
      startHold();
    }
    function onKeyUp(e) {
      if (e.key !== "r") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      // Only end hold if startHold was actually called (holdTimerRef is set)
      if (!holdTimerRef.current) return;
      endHold(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  if (loading) return <LoadingSkeleton />;
  if (error && !briefing)
    return (
      <ErrorState message={error} onRetry={() => window.location.reload()} />
    );
  if (!briefing)
    return (
      <div
        style={{
          minHeight: "100vh",
          color: "#e2e8f0",
          fontFamily: "'DM Sans', sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 48 }}>☀️</div>
        <h1
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: 28,
            fontWeight: 400,
            color: "#f8fafc",
            margin: 0,
          }}
        >
          No briefings yet
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            margin: 0,
            textAlign: "center",
            maxWidth: 400,
          }}
        >
          Connect your email accounts in Settings, then generate your first
          briefing.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={handleFullGeneration} className="btn-primary">
            Generate First Briefing
          </button>
          <a href="/settings" className="btn-secondary">
            Settings
          </a>
        </div>
        {generating && (
          <div style={{ marginTop: 16 }}>
            <RefreshBanner progress={genProgress} />
          </div>
        )}
      </div>
    );

  const d = briefing;

  // Compute next upcoming briefing from schedules (both active and skipped)
  const { nextBriefing, nextSkipped } = (() => {
    const now = new Date();
    const enabled = schedules
      .map((s, i) => ({ ...s, _idx: i }))
      .filter(s => s.enabled)
      .map(s => {
        const [h, m] = s.time.split(":").map(Number);
        const target = new Date();
        target.setHours(h, m, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const isSkipped = s.skipped_until && new Date(s.skipped_until) > now;
        return { ...s, targetTime: target, msUntil: target - now, isSkipped };
      })
      .sort((a, b) => a.msUntil - b.msUntil);
    const active = enabled.find(s => !s.isSkipped) || null;
    const skipped = enabled.find(s => s.isSkipped) || null;
    // Show whichever comes first — if the soonest schedule is skipped, show that
    const soonest = enabled[0] || null;
    if (soonest?.isSkipped) return { nextBriefing: null, nextSkipped: soonest };
    return { nextBriefing: active, nextSkipped: skipped };
  })();

  const briefingIndicator = nextBriefing || nextSkipped;

  const nextBriefingLabel = (() => {
    if (!briefingIndicator) return null;
    const hrs = Math.floor(briefingIndicator.msUntil / 3600000);
    const mins = Math.round((briefingIndicator.msUntil % 3600000) / 60000);
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  })();

  const nextBriefingFullTime = briefingIndicator
    ? briefingIndicator.targetTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  const emailAccounts = d.emails?.accounts || [];
  const billEmails = emailAccounts.flatMap((acc, accIdx) =>
    (acc.important || [])
      .filter((e) => e.hasBill)
      .map((e) => ({ ...e, accountColor: acc.color, _accIdx: accIdx })),
  );
  const totalBills = billEmails.reduce(
    (sum, e) => sum + (e.extractedBill?.amount || 0),
    0,
  );
  const currentAccount = emailAccounts[activeAccount] || {
    important: [],
    name: "",
    icon: "",
    color: "#818cf8",
    unread: 0,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#e2e8f0",
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        padding: "24px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {generating && <RefreshBanner progress={genProgress} />}

      {/* Full generation confirm dialog */}
      {holdConfirm && (
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <span style={{ fontSize: 16 }}>🧠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#c7d2fe" }}>
              Generate fresh AI briefing?
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              Re-fetches new emails and analyzes with {modelLabel} (uses an API
              call)
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={handleFullGeneration}
            style={{ padding: "8px 16px", fontSize: 12 }}
          >
            Generate
          </button>
          <button
            className="btn-secondary"
            onClick={() => setHoldConfirm(false)}
            style={{ padding: "8px 12px", fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#64748b",
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              {getGreeting().label}
            </div>
            <h1
              style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontSize: 36,
                fontWeight: 400,
                margin: 0,
                color: "#f8fafc",
                lineHeight: 1.1,
              }}
            >
              {getGreeting().greeting}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                {d.dataUpdatedAt
                  ? `Data updated ${timeAgo(d.dataUpdatedAt)}`
                  : d.generatedAt}
                {d.aiGeneratedAt &&
                  ` · AI analysis from ${formatShortTime(d.aiGeneratedAt)}`}
              </p>
              <div
                style={{ position: "relative", display: "inline-block" }}
                onMouseEnter={() => setRefreshHover(true)}
                onMouseLeave={() => setRefreshHover(false)}
              >
                <button
                  className="btn-header"
                  onPointerDown={onPointerDown}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerLeave}
                  disabled={refreshing || generating}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    background: refreshing
                      ? "rgba(99,102,241,0.12)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${refreshing ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: refreshing ? "#a5b4fc" : "#94a3b8",
                    cursor: refreshing || generating ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    opacity: refreshing || generating ? 0.7 : 1,
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                    userSelect: "none",
                    touchAction: "none",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!refreshing && !generating) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      e.currentTarget.style.color = "#e2e8f0";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!refreshing && !generating) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#94a3b8";
                    }
                  }}
                >
                  {holdProgress > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${holdProgress}%`,
                        background:
                          "linear-gradient(90deg, rgba(99,102,241,0.2), rgba(139,92,246,0.3))",
                        transition: "none",
                        borderRadius: 6,
                      }}
                    />
                  )}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      animation: refreshing
                        ? "spin 0.8s linear infinite"
                        : "none",
                      position: "relative",
                    }}
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  <span style={{ position: "relative" }}>
                    {holdProgress > 0
                      ? "Hold for new briefing..."
                      : refreshing
                        ? "Updating..."
                        : "Refresh"}
                  </span>
                </button>
                {refreshHover && !refreshing && !generating && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 11,
                    color: "#e2e8f0",
                    whiteSpace: "nowrap",
                    zIndex: 50,
                    pointerEvents: "none",
                  }}>
                    Tap to refresh data · Hold to regenerate AI briefing · Hotkey: R
                  </div>
                )}
              </div>
              <div ref={historyTriggerRef} style={{ position: "relative" }}>
                <button
                  className="btn-header"
                  onClick={() => setHistoryOpen((v) => !v)}
                  style={{
                    background: historyOpen
                      ? "rgba(99,102,241,0.12)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${historyOpen ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: historyOpen ? "#a5b4fc" : "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontWeight: 500,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!historyOpen) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      e.currentTarget.style.color = "#e2e8f0";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!historyOpen) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#94a3b8";
                    }
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
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  History
                </button>
                {historyOpen && (
                  <BriefingHistoryPanel
                    activeId={viewingPast?.id ?? latestId}
                    triggerRef={historyTriggerRef}
                    onSelect={(briefing, meta) => {
                      setBriefing(briefing);
                      setViewingPast(meta.id === latestId ? null : meta);
                      setHistoryOpen(false);
                    }}
                    onClose={() => setHistoryOpen(false)}
                  />
                )}
              </div>
              {briefingIndicator && (
                <div
                  style={{ position: "relative", display: "inline-block" }}
                  onMouseEnter={() => setNextBriefingHover(true)}
                  onMouseLeave={() => setNextBriefingHover(false)}
                >
                  <button
                    className="btn-header"
                    onClick={async () => {
                      const result = await skipSchedule(briefingIndicator._idx, !briefingIndicator.isSkipped);
                      if (result.schedules) setSchedules(result.schedules);
                    }}
                    style={{
                      background: briefingIndicator.isSkipped ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${briefingIndicator.isSkipped ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      color: briefingIndicator.isSkipped ? "#fbbf24" : "#94a3b8",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontWeight: 500,
                      transition: "all 0.2s ease",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      if (briefingIndicator.isSkipped) {
                        e.currentTarget.style.background = "rgba(99,102,241,0.1)";
                        e.currentTarget.style.borderColor = "rgba(99,102,241,0.25)";
                        e.currentTarget.style.color = "#a5b4fc";
                      } else {
                        e.currentTarget.style.background = "rgba(245,158,11,0.08)";
                        e.currentTarget.style.borderColor = "rgba(245,158,11,0.2)";
                        e.currentTarget.style.color = "#fbbf24";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (briefingIndicator.isSkipped) {
                        e.currentTarget.style.background = "rgba(245,158,11,0.08)";
                        e.currentTarget.style.borderColor = "rgba(245,158,11,0.2)";
                        e.currentTarget.style.color = "#fbbf24";
                      } else {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                        e.currentTarget.style.color = "#94a3b8";
                      }
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{briefingIndicator.isSkipped
                      ? `${briefingIndicator.label} skipped`
                      : `Next in ${nextBriefingLabel}`}</span>
                  </button>
                  {nextBriefingHover && (
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 11,
                      color: "#e2e8f0",
                      whiteSpace: "nowrap",
                      zIndex: 50,
                      pointerEvents: "none",
                    }}>
                      {briefingIndicator.isSkipped
                        ? `${briefingIndicator.label} at ${nextBriefingFullTime} · Click to unskip`
                        : `${briefingIndicator.label} at ${nextBriefingFullTime} · Click to skip`}
                    </div>
                  )}
                </div>
              )}
              <a
                href="/settings"
                className="btn-header"
                style={{ textDecoration: "none" }}
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </a>
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: "16px 20px",
              textAlign: "center",
              minWidth: 100,
            }}
          >
            <div style={{ fontSize: 36, lineHeight: 1 }}>☀️</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 300,
                color: "#f8fafc",
                marginTop: 4,
              }}
            >
              {d.weather.temp}°
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {d.weather.high}° / {d.weather.low}°
            </div>
          </div>
        </div>
      </div>

      {/* Viewing past briefing banner */}
      {viewingPast && (
        <div
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            animation: "fadeIn 0.2s ease",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a5b4fc"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: 12, color: "#a5b4fc", flex: 1 }}>
            Viewing briefing from{" "}
            {(() => {
              const d = new Date(viewingPast.generated_at + "Z");
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const itemDate = new Date(d);
              itemDate.setHours(0, 0, 0, 0);
              const dayLabel =
                itemDate.getTime() === today.getTime()
                  ? "Today"
                  : itemDate.getTime() === today.getTime() - 86400000
                    ? "Yesterday"
                    : d.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
              return `${dayLabel} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
            })()}
          </span>
          <button
            onClick={() => {
              setBriefing(latestBriefing);
              setViewingPast(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#818cf8",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              transition: "color 0.15s ease, opacity 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#a5b4fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#818cf8"; }}
          >
            Back to latest
          </button>
        </div>
      )}

      {/* AI Insights — omit if none */}
      {d.aiInsights?.length > 0 && (
        <Section title="Claude's Take" delay={200} loaded={loaded}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {d.aiInsights.map((insight, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "#cbd5e1",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  opacity: loaded ? 1 : 0,
                  transform: loaded ? "translateY(0)" : "translateY(8px)",
                  transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${300 + i * 80}ms`,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                  {insight.icon}
                </span>
                <span>{insight.text}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* CTM Assignments — omit if none */}
      {d.ctm?.upcoming?.length > 0 && (
        <div ref={ctmSectionRef}>
          <Section title="Assignments & Deadlines" delay={300} loaded={loaded}>
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "16px 20px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "baseline",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <span
                    style={{ fontSize: 24, fontWeight: 600, color: "#f8fafc" }}
                  >
                    {d.ctm.stats.incomplete}
                  </span>
                  <span
                    style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}
                  >
                    incomplete
                  </span>
                </div>
                <div>
                  <span
                    style={{ fontSize: 24, fontWeight: 600, color: "#fca5a5" }}
                  >
                    {d.ctm.stats.dueToday}
                  </span>
                  <span
                    style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}
                  >
                    due today
                  </span>
                </div>
                <div>
                  <span
                    style={{ fontSize: 24, fontWeight: 600, color: "#fcd34d" }}
                  >
                    {d.ctm.stats.dueThisWeek}
                  </span>
                  <span
                    style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}
                  >
                    this week
                  </span>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <a
                    href="https://ctm.andysu.tech"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: "rgba(167,139,250,0.08)",
                      border: "1px solid rgba(167,139,250,0.15)",
                      borderRadius: 6,
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      color: "#a78bfa",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      textDecoration: "none",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(167,139,250,0.18)";
                      e.currentTarget.style.borderColor =
                        "rgba(167,139,250,0.35)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "rgba(167,139,250,0.08)";
                      e.currentTarget.style.borderColor =
                        "rgba(167,139,250,0.15)";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                    CTM
                  </a>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.ctm.upcoming.map((task) => (
                <CTMCard
                  key={task.id}
                  task={task}
                  expanded={expandedTask === task.id}
                  onToggle={() =>
                    setExpandedTask(expandedTask === task.id ? null : task.id)
                  }
                />
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Bills — omit if none */}
      {billEmails.length > 0 && (
        <Section title="Bills Detected" delay={400} loaded={loaded}>
          <div
            style={{
              background: "rgba(99,102,241,0.04)",
              border: "1px solid rgba(99,102,241,0.12)",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 13, color: "#a5b4fc", fontWeight: 500 }}>
                {billEmails.length} payment{billEmails.length !== 1 ? "s" : ""}{" "}
                found
              </span>
              {totalBills > 0 && (
                <span
                  style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}
                >
                  $
                  {totalBills.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {billEmails
                .filter((e) => e.extractedBill)
                .map((email, i) => {
                  const typeInfo =
                    typeLabels[email.extractedBill.type] || typeLabels.expense;
                  const billCarriedOver = (email.seenCount || 1) >= 2;
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        // Toggle off if already selected
                        if (selectedEmail?.id === email.id) {
                          setSelectedEmail(null);
                          setLoadingBillId(null);
                          return;
                        }
                        setActiveAccount(email._accIdx);
                        const original = emailAccounts[
                          email._accIdx
                        ]?.important?.find((e) => e.id === email.id);
                        setSelectedEmail(original || email);
                        setLoadingBillId(email.id);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.02)",
                        borderRadius: 8,
                        cursor: "pointer",
                        transition: "background 0.15s ease, opacity 0.15s ease",
                        opacity: billCarriedOver ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                        const btn = e.currentTarget.querySelector(".dismiss-btn");
                        if (btn) btn.style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                        const btn = e.currentTarget.querySelector(".dismiss-btn");
                        if (btn && !billCarriedOver) btn.style.opacity = "0";
                      }}
                    >
                      <div
                        style={{
                          width: 3,
                          height: 24,
                          borderRadius: 2,
                          background: email.accountColor,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#e2e8f0",
                          flex: 1,
                        }}
                      >
                        {email.extractedBill.payee}
                        {billCarriedOver && (
                          <span style={{ fontSize: 10, color: "#64748b", opacity: 0.7, marginLeft: 8 }}>↩ From previous</span>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: typeInfo.color,
                          background: typeInfo.color + "15",
                          padding: "2px 7px",
                          borderRadius: 4,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {typeInfo.label}
                      </span>
                      {email.extractedBill.amount != null ? (
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#cbd5e1",
                            minWidth: 80,
                            textAlign: "right",
                          }}
                        >
                          $
                          {email.extractedBill.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            minWidth: 80,
                            textAlign: "right",
                            fontStyle: "italic",
                          }}
                        >
                          See email
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          minWidth: 50,
                          textAlign: "right",
                        }}
                      >
                        {email.extractedBill.due_date
                          ? new Date(
                              email.extractedBill.due_date + "T12:00:00",
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : ""}
                      </span>
                      {loadingBillId === email.id && (
                        <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                      )}
                      {confirmDismissId === email.id ? (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <button
                            className="dismiss-confirm-btn"
                            onClick={() => { handleDismiss(email.id); setConfirmDismissId(null); }}
                            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#fca5a5", fontSize: 10, fontWeight: 600, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s ease" }}
                          >Dismiss</button>
                          <button
                            className="dismiss-cancel-btn"
                            onClick={() => setConfirmDismissId(null)}
                            style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1, transition: "color 0.15s ease" }}
                          >×</button>
                        </div>
                      ) : (
                        <button
                          className="dismiss-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (billCarriedOver) handleDismiss(email.id);
                            else setConfirmDismissId(email.id);
                          }}
                          style={{
                            opacity: billCarriedOver ? 1 : 0,
                            transition: "opacity 0.15s, color 0.15s",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#64748b",
                            fontSize: 16,
                            padding: "2px 4px",
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                          title="Dismiss from briefing"
                        >×</button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </Section>
      )}

      {/* Weather */}
      <Section
        title={`Weather · ${d.weather?.location || "El Monte, CA"}`}
        delay={450}
        loaded={loaded}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <p
            style={{
              fontSize: 13.5,
              color: "#94a3b8",
              margin: "0 0 14px 0",
              lineHeight: 1.5,
            }}
          >
            {d.weather.summary}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {d.weather.hourly.map((h, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}
                >
                  {h.time}
                </div>
                <div style={{ fontSize: 18 }}>{h.icon}</div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#e2e8f0",
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  {h.temp}°
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Calendar */}
      <Section title="Today's Schedule" delay={500} loaded={loaded}>
        {d.calendar?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.calendar.map((event, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background:
                    event.flag === "Conflict"
                      ? "rgba(239,68,68,0.06)"
                      : "rgba(255,255,255,0.02)",
                  border: `1px solid ${event.flag === "Conflict" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: 10,
                  opacity: event.passed ? 0.4 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 36,
                    borderRadius: 2,
                    background: event.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 72 }}>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}
                  >
                    {event.time}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {event.duration}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: "#e2e8f0",
                      textDecoration: event.passed ? "line-through" : "none",
                    }}
                  >
                    {event.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {event.source}
                  </div>
                </div>
                {event.passed && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: "#64748b",
                      background: "rgba(255,255,255,0.05)",
                      padding: "4px 8px",
                      borderRadius: 6,
                    }}
                  >
                    Done
                  </div>
                )}
                {!event.passed && event.flag && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: event.flag === "Conflict" ? "#fca5a5" : "#fcd34d",
                      background:
                        event.flag === "Conflict"
                          ? "rgba(239,68,68,0.12)"
                          : "rgba(245,158,11,0.1)",
                      padding: "4px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {event.flag}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: "20px 16px",
              textAlign: "center",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            No events today
          </div>
        )}
      </Section>

      {/* Deadlines (non-academic) — omit if none */}
      {d.deadlines?.length > 0 && (
        <Section title="Other Deadlines" delay={600} loaded={loaded}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.deadlines.map((dl, i) => {
              const dateStr = dl.due_date || dl.due;
              const s = urgencyStyles[dl.urgency] || urgencyStyles.low;
              // Match canvas/academic deadlines to CTM entries by title
              const ctmMatch =
                (dl.source === "canvas" || dl.type === "academic") &&
                !dl.email_id
                  ? (d.ctm?.upcoming || []).find(
                      (t) =>
                        dl.title.includes(t.title) ||
                        t.title.includes(dl.title),
                    )
                  : null;
              const isClickable = !!(dl.email_id || ctmMatch);
              const handleDeadlineClick = () => {
                if (ctmMatch) {
                  setExpandedTask(ctmMatch.id);
                  ctmSectionRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  return;
                }
                if (!dl.email_id) return;
                // Find which account and email this deadline links to
                const accIdx = emailAccounts.findIndex((acc) =>
                  acc.important?.some((e) => e.id === dl.email_id),
                );
                if (accIdx === -1) return;
                const email = emailAccounts[accIdx].important.find(
                  (e) => e.id === dl.email_id,
                );
                if (!email) return;
                setActiveAccount(accIdx);
                setSelectedEmail(email);
              };
              return (
                <div
                  key={i}
                  onClick={handleDeadlineClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    background: s.bg,
                    border: `1px solid ${s.border}22`,
                    borderRadius: 10,
                    cursor: isClickable ? "pointer" : "default",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (isClickable)
                      e.currentTarget.style.background = s.bg
                        .replace("0.1", "0.18")
                        .replace("0.08", "0.14");
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = s.bg;
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: s.dot,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: "#e2e8f0",
                      }}
                    >
                      {dl.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {dl.source}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: s.text }}>
                    {formatRelativeDate(dateStr)}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Email Overview */}
      <div ref={emailSectionRef} />
      <Section title="Email Overview" delay={700} loaded={loaded}>
        <p style={{ fontSize: 13.5, color: "#94a3b8", margin: "0 0 16px 0" }}>
          {d.emails?.summary || "No email accounts connected."}
        </p>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {emailAccounts.map((acc, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveAccount(i);
                setSelectedEmail(null);
                requestAnimationFrame(() => {
                  emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
              style={{
                background:
                  activeAccount === i
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.03)",
                border: `1px solid ${activeAccount === i ? acc.color + "66" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s ease",
                color: activeAccount === i ? "#f1f5f9" : "#94a3b8",
              }}
              onMouseEnter={(e) => {
                if (activeAccount !== i) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.color = "#e2e8f0";
                }
              }}
              onMouseLeave={(e) => {
                if (activeAccount !== i) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#94a3b8";
                }
              }}
            >
              <span style={{ fontSize: 15 }}>{acc.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>
                {acc.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: acc.color + "22",
                  color: acc.color,
                  padding: "2px 7px",
                  borderRadius: 20,
                }}
              >
                {acc.unread}
              </span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {currentAccount.important.map((email, i) => {
            const s = urgencyStyles[email.urgency] || urgencyStyles.low;
            const isOpen = selectedEmail?.id === email.id;
            const isCarriedOver = (email.seenCount || 1) >= 2;
            return (
              <div
                key={i}
                data-email-id={email.id}
                onClick={(e) => {
                  // Only toggle on header clicks — not expanded content area
                  // Check if click target is within the expanded body (stopPropagation covers most,
                  // but padding gaps in the parent div can still trigger this)
                  if (isOpen && !e.target.closest('[data-email-header]')) return;
                  setSelectedEmail(isOpen ? null : email);
                }}
                style={{
                  background: isOpen
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? currentAccount.color + "33" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isOpen)
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  const btn = e.currentTarget.querySelector(".dismiss-btn");
                  if (btn) btn.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  if (!isOpen)
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  const btn = e.currentTarget.querySelector(".dismiss-btn");
                  if (btn && !isCarriedOver) btn.style.opacity = "0";
                }}
              >
                <div
                  data-email-header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    opacity: isCarriedOver ? 0.6 : 1,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        {email.from}
                      </span>
                      {isCarriedOver && (
                        <span style={{ fontSize: 10, color: "#64748b", opacity: 0.7 }}>↩ From previous</span>
                      )}
                      {email.hasBill && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            color: "#818cf8",
                            background: "rgba(99,102,241,0.12)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            textTransform: "uppercase",
                          }}
                        >
                          💳 Bill
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: "#e2e8f0",
                        marginTop: 2,
                      }}
                    >
                      {email.subject}
                    </div>
                    {!isOpen && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {email.preview}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    {confirmDismissId === email.id ? (
                      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          className="dismiss-confirm-btn"
                          onClick={() => { handleDismiss(email.id); setConfirmDismissId(null); }}
                          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#fca5a5", fontSize: 10, fontWeight: 600, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s ease" }}
                        >Dismiss</button>
                        <button
                          className="dismiss-cancel-btn"
                          onClick={() => setConfirmDismissId(null)}
                          style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1, transition: "color 0.15s ease" }}
                        >×</button>
                      </div>
                    ) : (
                      <button
                        className="dismiss-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCarriedOver) handleDismiss(email.id);
                          else setConfirmDismissId(email.id);
                        }}
                        style={{
                          opacity: isCarriedOver ? 1 : 0,
                          transition: "opacity 0.15s, color 0.15s",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#64748b",
                          fontSize: 16,
                          padding: "2px 4px",
                          lineHeight: 1,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                        title="Dismiss from briefing"
                      >×</button>
                    )}
                    {email.action && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: 0.3,
                          color: s.text,
                          background: s.bg,
                          border: `1px solid ${s.border}33`,
                          padding: "4px 8px",
                          borderRadius: 6,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {email.action}
                      </div>
                    )}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transition: "transform 0.2s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
                {isOpen && (
                  <div onClick={(e) => e.stopPropagation()}>
                  <EmailBody
                    email={email}
                    model={d.model}
                    onLoaded={() => {
                      setLoadingBillId(null);
                      const row = document.querySelector(
                        `[data-email-id="${email.id}"]`,
                      );
                      if (!row) return;
                      const maxScroll =
                        document.documentElement.scrollHeight -
                        window.innerHeight;
                      const rowTop =
                        row.getBoundingClientRect().top + window.scrollY;
                      if (maxScroll < rowTop) {
                        row.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      } else {
                        window.scrollTo({
                          top: document.documentElement.scrollHeight,
                          behavior: "smooth",
                        });
                      }
                    }}
                  />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <div
        style={{
          textAlign: "center",
          padding: "32px 0 16px",
          opacity: loaded ? 0.4 : 0,
          transition: "opacity 1s ease 1.2s",
        }}
      >
        <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1 }}>
          TAP REFRESH FOR DATA · HOLD FOR AI ANALYSIS
        </div>
      </div>
    </div>
  );
}
