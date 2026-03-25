import { useState, useEffect } from "react";
import { getLatestBriefing, triggerGeneration, quickRefresh, pollStatus, getEmailBody, sendToActualBudget } from "../api";
import { transformBriefing } from "../transform";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ErrorState from "../components/ErrorState";
import RefreshBanner from "../components/RefreshBanner";
import BriefingHistoryPanel from "../components/BriefingHistoryPanel";
import DOMPurify from "dompurify";

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

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `${diff} days`;
}

function getDueUrgency(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "high";
  if (diff <= 2) return "medium";
  return "low";
}

function CTMCard({ task, expanded, onToggle }) {
  const daysLabel = getDaysUntil(task.due_date);
  const urg = getDueUrgency(task.due_date);
  const s = urgencyStyles[urg];
  const isCanvas = task.source === "canvas";

  return (
    <div onClick={onToggle} style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s ease",
    }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 4, height: 40, borderRadius: 2, background: task.class_color, flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: task.class_color, fontWeight: 500 }}>{task.class_name}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
              color: isCanvas ? "#fb923c" : "#a78bfa",
              background: isCanvas ? "rgba(251,146,42,0.1)" : "rgba(167,139,250,0.1)",
              padding: "2px 6px", borderRadius: 4,
            }}>
              {isCanvas ? "Canvas" : "Todoist"}
            </span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "#e2e8f0", marginTop: 3 }}>{task.title}</div>
          {expanded && (
            <div style={{ animation: "fadeIn 0.2s ease", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>{task.description}</p>
              {task.url && (
                <a href={task.url} target="_blank" rel="noopener noreferrer" style={{
                  marginTop: 10, fontSize: 12, color: "#818cf8", display: "flex", alignItems: "center", gap: 4, textDecoration: "none",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Open in Canvas
                </a>
              )}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: s.text }}>{daysLabel}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{task.due_time}</div>
          {task.points_possible && (
            <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", marginTop: 4, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>
              {task.points_possible} pts
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}

function BillBadge({ bill }) {
  const [state, setState] = useState("idle");
  const typeInfo = typeLabels[bill.type] || typeLabels.expense;
  const handleClick = (e) => { e.stopPropagation(); if (state === "idle") setState("confirm"); };
  const handleConfirm = (e) => {
    e.stopPropagation();
    setState("sending");
    sendToActualBudget(bill)
      .then(() => setState("sent"))
      .catch(() => setState("error"));
  };
  const handleCancel = (e) => { e.stopPropagation(); setState("idle"); };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
      borderRadius: 10, padding: "12px 14px", marginTop: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: typeInfo.color, background: typeInfo.color + "18", padding: "3px 8px", borderRadius: 5 }}>{typeInfo.icon} {typeInfo.label}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>detected by Haiku</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 10 }}>
        <div><div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Payee</div><div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{bill.payee}</div></div>
        <div><div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Amount</div><div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>${bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
        <div><div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Due</div><div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{new Date(bill.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div></div>
      </div>
      <div style={{ marginTop: 12 }}>
        {state === "idle" && <button onClick={handleClick} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Send to Actual Budget</button>}
        {state === "confirm" && <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: 12 }}><div style={{ fontSize: 12, color: "#c7d2fe", marginBottom: 10, lineHeight: 1.5 }}>{bill.type === "transfer" ? `Schedule payment: $${bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} from Checking → ${bill.payee} on ${new Date(bill.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}?` : `Add ${typeInfo.label.toLowerCase()}: $${bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} to ${bill.payee} due ${new Date(bill.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}?`}</div><div style={{ display: "flex", gap: 8 }}><button onClick={handleConfirm} style={{ flex: 1, background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Confirm</button><button onClick={handleCancel} style={{ flex: 1, background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button></div></div>}
        {state === "sending" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 16px", background: "rgba(99,102,241,0.1)", borderRadius: 8 }}><div style={{ width: 14, height: 14, border: "2px solid rgba(99,102,241,0.3)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 12, color: "#a5b4fc" }}>Syncing with Actual Budget…</span></div>}
        {state === "sent" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg><span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>Added to Actual Budget</span></div>}
        {state === "error" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8 }}><span style={{ fontSize: 12, color: "#fca5a5" }}>Failed to send.</span><button onClick={() => setState("idle")} style={{ fontSize: 12, color: "#818cf8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Retry</button></div>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmailDetail({ email, onBack, accountColor }) {
  const [body, setBody] = useState(null);
  const [loadingBody, setLoadingBody] = useState(true);

  useEffect(() => {
    if (email.fullBody) {
      setBody(email.fullBody);
      setLoadingBody(false);
      return;
    }
    getEmailBody(email.uid || email.id)
      .then(res => setBody(res.html_body))
      .catch(() => setBody("Failed to load email body."))
      .finally(() => setLoadingBody(false));
  }, [email.uid, email.id]);

  const isHtml = body && body.trim().startsWith("<");

  return (
    <div style={{ animation: "slideIn 0.25s ease-out" }}>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(12px); } to { opacity:1; transform:translateX(0); } }`}</style>
      <button onClick={onBack} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 14px", color: "#94a3b8", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontWeight: 500 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Back to inbox
      </button>
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 4, height: 32, borderRadius: 2, background: accountColor, flexShrink: 0 }} />
            <div><div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>{email.from}</div><div style={{ fontSize: 11, color: "#64748b" }}>{email.fromEmail || email.from_email}</div></div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>{email.date}</div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#e2e8f0", marginTop: 8 }}>{email.subject}</div>
        </div>
        <div style={{ background: "rgba(251,191,36,0.04)", borderBottom: "1px solid rgba(251,191,36,0.1)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12 }}>✨</span><span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 500 }}>Haiku Summary</span><span style={{ fontSize: 12.5, color: "#cbd5e1" }}>{email.preview}</span>
        </div>
        <div style={{ padding: "18px 20px" }}>
          {loadingBody ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 0" }}>
              <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13, color: "#64748b" }}>Loading email...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : isHtml ? (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }} style={{ fontSize: 13.5, lineHeight: 1.7, color: "#94a3b8" }} />
          ) : (
            <pre style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.7, color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{body}</pre>
          )}
        </div>
        {email.hasBill && email.extractedBill && <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px" }}><BillBadge bill={email.extractedBill} /></div>}
      </div>
    </div>
  );
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
  const [expandedTask, setExpandedTask] = useState(null);
  const [ctmView, setCtmView] = useState("timeline");
  const [holdConfirm, setHoldConfirm] = useState(false); // show "Generate fresh AI briefing?" confirm
  const [cooldownMsg, setCooldownMsg] = useState(null); // transient cooldown notice
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingPast, setViewingPast] = useState(null); // { id, generated_at } when viewing a past briefing
  const [latestBriefing, setLatestBriefing] = useState(null); // preserved so "Back to latest" is instant
  const holdTimerRef = { current: null };

  useEffect(() => {
    getLatestBriefing()
      .then(res => {
        const transformed = transformBriefing(res.briefing);
        setBriefing(transformed);
        setLatestBriefing(transformed);
      })
      .catch(err => setError(err.message))
      .finally(() => {
        setLoading(false);
        setTimeout(() => setLoaded(true), 100);
      });
  }, []);

  // Quick refresh: tap — raw data only, no Haiku
  async function handleQuickRefresh() {
    if (refreshing || generating) return;
    setRefreshing(true);
    try {
      const result = await quickRefresh();
      const transformed = transformBriefing(result.briefingJson);
      setBriefing(transformed);
      setLatestBriefing(transformed);
      setViewingPast(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  // Full generation: hold → confirm → Haiku call
  async function handleFullGeneration() {
    setHoldConfirm(false);
    setGenerating(true);
    try {
      const genResult = await triggerGeneration();

      // Cooldown: Haiku was called too recently, show message instead
      if (genResult.status === "cooldown") {
        setGenerating(false);
        setCooldownMsg(genResult.message);
        setTimeout(() => setCooldownMsg(null), 5000);
        return;
      }

      const { id } = genResult;
      const poll = setInterval(async () => {
        try {
          const { status, error_message } = await pollStatus(id);
          if (status === "ready") {
            clearInterval(poll);
            const res = await getLatestBriefing();
            const transformed = transformBriefing(res.briefing);
            setBriefing(transformed);
            setLatestBriefing(transformed);
            setViewingPast(null);
            setGenerating(false);
          } else if (status === "error") {
            clearInterval(poll);
            setError(error_message);
            setGenerating(false);
          }
        } catch {
          clearInterval(poll);
          setError("Lost connection while generating briefing.");
          setGenerating(false);
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
      setGenerating(false);
    }
  }

  // Long press handlers for the refresh button
  function onPointerDown() {
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = "fired";
      setHoldConfirm(true);
    }, 600);
  }
  function onPointerUp() {
    if (holdTimerRef.current === "fired") {
      // Long press was handled, don't quick refresh
      holdTimerRef.current = null;
      return;
    }
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    handleQuickRefresh();
  }
  function onPointerLeave() {
    if (holdTimerRef.current && holdTimerRef.current !== "fired") {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  if (loading) return <LoadingSkeleton />;
  if (error && !briefing) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const d = briefing;
  const billEmails = d.emails.accounts.flatMap(acc => acc.important.filter(e => e.hasBill).map(e => ({ ...e, accountColor: acc.color })));
  const totalBills = billEmails.reduce((sum, e) => sum + (e.extractedBill?.amount || 0), 0);

  const classesSummary = {};
  d.ctm.upcoming.forEach(t => {
    if (!classesSummary[t.class_name]) classesSummary[t.class_name] = { color: t.class_color, tasks: [] };
    classesSummary[t.class_name].tasks.push(t);
  });

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)", color: "#e2e8f0", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {generating && <RefreshBanner />}

      {/* Cooldown notice */}
      {cooldownMsg && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12, padding: '12px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadeIn 0.2s ease',
        }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ fontSize: 13, color: '#fcd34d' }}>{cooldownMsg}</span>
        </div>
      )}

      {/* Full generation confirm dialog */}
      {holdConfirm && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 12, padding: '14px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
          animation: 'fadeIn 0.2s ease',
        }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c7d2fe' }}>Generate fresh AI briefing?</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Re-analyzes all data with Claude Haiku (~10s, uses an API call)</div>
          </div>
          <button onClick={handleFullGeneration} style={{
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Generate</button>
          <button onClick={() => setHoldConfirm(false)} style={{
            background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      )}

      {/* Header */}
      <div style={{ opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(12px)", transition: "all 0.6s cubic-bezier(0.16,1,0.3,1)", marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#64748b", marginBottom: 8, fontWeight: 600 }}>Morning Briefing</div>
            <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 36, fontWeight: 400, margin: 0, color: "#f8fafc", lineHeight: 1.1 }}>Good morning.</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                {d.dataUpdatedAt ? `Data updated ${timeAgo(d.dataUpdatedAt)}` : d.generatedAt}
                {d.aiGeneratedAt && ` · AI analysis from ${formatShortTime(d.aiGeneratedAt)}`}
              </p>
              <button
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                disabled={refreshing || generating}
                title="Tap to refresh data · Hold to regenerate AI briefing"
                style={{
                  background: refreshing ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${refreshing ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 6, padding: "4px 10px", fontSize: 11, color: refreshing ? "#a5b4fc" : "#94a3b8",
                  cursor: (refreshing || generating) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                  opacity: (refreshing || generating) ? 0.7 : 1, fontWeight: 500,
                  transition: "all 0.2s ease", userSelect: "none", touchAction: "none",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {refreshing ? "Updating..." : "Refresh"}
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  style={{
                    background: historyOpen ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${historyOpen ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 6, padding: "4px 10px", fontSize: 11,
                    color: historyOpen ? "#a5b4fc" : "#94a3b8",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                    fontWeight: 500, transition: "all 0.2s ease",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  History
                </button>
                {historyOpen && (
                  <BriefingHistoryPanel
                    activeId={viewingPast?.id}
                    onSelect={(briefing, meta) => {
                      setBriefing(briefing);
                      setViewingPast(meta);
                      setHistoryOpen(false);
                    }}
                    onClose={() => setHistoryOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 20px", textAlign: "center", minWidth: 100 }}>
            <div style={{ fontSize: 36, lineHeight: 1 }}>☀️</div>
            <div style={{ fontSize: 28, fontWeight: 300, color: "#f8fafc", marginTop: 4 }}>{d.weather.temp}°</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{d.weather.high}° / {d.weather.low}°</div>
          </div>
        </div>
      </div>

      {/* Viewing past briefing banner */}
      {viewingPast && (
        <div style={{
          background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
          borderRadius: 10, padding: "10px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 8,
          animation: "fadeIn 0.2s ease",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: 12, color: "#a5b4fc", flex: 1 }}>
            Viewing briefing from {(() => {
              const d = new Date(viewingPast.generated_at + "Z");
              const today = new Date(); today.setHours(0,0,0,0);
              const itemDate = new Date(d); itemDate.setHours(0,0,0,0);
              const dayLabel = itemDate.getTime() === today.getTime() ? "Today" :
                itemDate.getTime() === today.getTime() - 86400000 ? "Yesterday" :
                d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return `${dayLabel} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
            })()}
          </span>
          <button
            onClick={() => {
              setBriefing(latestBriefing);
              setViewingPast(null);
            }}
            style={{
              background: "none", border: "none", color: "#818cf8",
              fontSize: 12, fontWeight: 500, cursor: "pointer", padding: 0,
              textDecoration: "underline", textUnderlineOffset: 2,
            }}
          >
            Back to latest
          </button>
        </div>
      )}

      {/* AI Insights */}
      <Section title="Claude's Take" delay={200} loaded={loaded}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {d.aiInsights.map((insight, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.6, color: "#cbd5e1", display: "flex", gap: 12, alignItems: "flex-start", opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(8px)", transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${300 + i * 80}ms` }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{insight.icon}</span>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* CTM Assignments */}
      <Section title="Assignments & Deadlines" delay={300} loaded={loaded}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
            <div><span style={{ fontSize: 24, fontWeight: 600, color: "#f8fafc" }}>{d.ctm.stats.pending}</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>pending</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 600, color: "#fca5a5" }}>{d.ctm.stats.dueToday}</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>due today</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 600, color: "#fcd34d" }}>{d.ctm.stats.dueThisWeek}</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>this week</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 600, color: "#94a3b8" }}>{d.ctm.stats.totalPoints}</span><span style={{ fontSize: 12, color: "#64748b", marginLeft: 6 }}>total pts</span></div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {["timeline", "byClass"].map(v => (
                <button key={v} onClick={() => setCtmView(v)} style={{
                  background: ctmView === v ? "rgba(255,255,255,0.1)" : "transparent",
                  border: `1px solid ${ctmView === v ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer",
                  color: ctmView === v ? "#e2e8f0" : "#64748b",
                }}>
                  {v === "timeline" ? "Timeline" : "By Class"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {ctmView === "timeline" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.ctm.upcoming.map(task => (
              <CTMCard key={task.id} task={task} expanded={expandedTask === task.id} onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(classesSummary).map(([className, data]) => (
              <div key={className}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: data.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#e2e8f0" }}>{className}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{data.tasks.length} item{data.tasks.length > 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.tasks.map(task => (
                    <CTMCard key={task.id} task={task} expanded={expandedTask === task.id} onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Bills */}
      <Section title="Bills Detected" delay={400} loaded={loaded}>
        <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: "#a5b4fc", fontWeight: 500 }}>{billEmails.length} payments found</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>${totalBills.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {billEmails.map((email, i) => {
              const typeInfo = typeLabels[email.extractedBill.type];
              return (
                <div key={i} onClick={() => { const accIdx = d.emails.accounts.findIndex(a => a.color === email.accountColor); setActiveAccount(accIdx); setSelectedEmail(email); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, cursor: "pointer", transition: "background 0.15s ease" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
                  <div style={{ width: 3, height: 24, borderRadius: 2, background: email.accountColor }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", flex: 1 }}>{email.extractedBill.payee}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: typeInfo.color, background: typeInfo.color + "15", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{typeInfo.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1", minWidth: 80, textAlign: "right" }}>${email.extractedBill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ fontSize: 11, color: "#64748b", minWidth: 50, textAlign: "right" }}>{new Date(email.extractedBill.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Weather */}
      <Section title="Weather · Monrovia, CA" delay={450} loaded={loaded}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px" }}>
          <p style={{ fontSize: 13.5, color: "#94a3b8", margin: "0 0 14px 0", lineHeight: 1.5 }}>{d.weather.summary}</p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {d.weather.hourly.map((h, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{h.time}</div>
                <div style={{ fontSize: 18 }}>{h.icon}</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 4, fontWeight: 500 }}>{h.temp}°</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Calendar */}
      <Section title="Today's Schedule" delay={500} loaded={loaded}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {d.calendar.map((event, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: event.flag === "Conflict" ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${event.flag === "Conflict" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`, borderRadius: 10 }}>
              <div style={{ width: 3, height: 36, borderRadius: 2, background: event.color, flexShrink: 0 }} />
              <div style={{ minWidth: 72 }}><div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{event.time}</div><div style={{ fontSize: 11, color: "#64748b" }}>{event.duration}</div></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 500, color: "#e2e8f0" }}>{event.title}</div><div style={{ fontSize: 11, color: "#64748b" }}>{event.source}</div></div>
              {event.flag && <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: event.flag === "Conflict" ? "#fca5a5" : "#fcd34d", background: event.flag === "Conflict" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.1)", padding: "4px 8px", borderRadius: 6 }}>{event.flag}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* Deadlines (non-academic) */}
      <Section title="Other Deadlines" delay={600} loaded={loaded}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {d.deadlines.map((dl, i) => {
            const s = urgencyStyles[dl.urgency];
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: s.bg, border: `1px solid ${s.border}22`, borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 500, color: "#e2e8f0" }}>{dl.title}</div><div style={{ fontSize: 11, color: "#64748b" }}>{dl.source}</div></div>
                <div style={{ fontSize: 12, fontWeight: 600, color: s.text }}>{dl.due}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Email Overview */}
      <Section title="Email Overview" delay={700} loaded={loaded}>
        <p style={{ fontSize: 13.5, color: "#94a3b8", margin: "0 0 16px 0" }}>{d.emails.summary}</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {d.emails.accounts.map((acc, i) => (
            <button key={i} onClick={() => { setActiveAccount(i); setSelectedEmail(null); }} style={{ background: activeAccount === i ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${activeAccount === i ? acc.color + "66" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s ease", color: activeAccount === i ? "#f1f5f9" : "#94a3b8" }}>
              <span style={{ fontSize: 15 }}>{acc.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{acc.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, background: acc.color + "22", color: acc.color, padding: "2px 7px", borderRadius: 20 }}>{acc.unread}</span>
            </button>
          ))}
        </div>
        {selectedEmail ? (
          <EmailDetail email={selectedEmail} onBack={() => setSelectedEmail(null)} accountColor={d.emails.accounts[activeAccount].color} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {d.emails.accounts[activeAccount].important.map((email, i) => {
              const s = urgencyStyles[email.urgency];
              return (
                <div key={i} onClick={() => setSelectedEmail(email)} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s ease" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{email.from}</span>
                        {email.hasBill && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: "#818cf8", background: "rgba(99,102,241,0.12)", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>💳 Bill</span>}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: "#e2e8f0", marginTop: 2 }}>{email.subject}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>{email.preview}</div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: s.text, background: s.bg, border: `1px solid ${s.border}33`, padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap", flexShrink: 0 }}>{email.action}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div style={{ textAlign: "center", padding: "32px 0 16px", opacity: loaded ? 0.4 : 0, transition: "opacity 1s ease 1.2s" }}>
        <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1 }}>
          TAP REFRESH FOR DATA · HOLD FOR AI ANALYSIS
        </div>
      </div>
    </div>
  );
}
