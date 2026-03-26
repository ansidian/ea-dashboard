import { useState, useEffect, useRef } from "react";
import { getLatestBriefing, triggerGeneration, quickRefresh, pollStatus, checkInProgress, getEmailBody, sendToActualBudget, getActualAccounts, getSettings } from "../api";

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

function parseDueDate(dateStr) {
  // Handle both "2026-03-30" and "2026-03-30T06:59:59Z" formats
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDueDate(dateStr);
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `${diff} days`;
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

function getDueUrgency(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDueDate(dateStr);
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
              {task.description && <div className="ctm-desc" dangerouslySetInnerHTML={{ __html: task.description }} />}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {task.url && (
                  <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{
                    fontSize: 12, color: "#818cf8", display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none",
                    background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
                    padding: "6px 12px", borderRadius: 6, fontWeight: 500, transition: "all 0.2s ease",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.18)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.35)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.08)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.15)"; e.currentTarget.style.transform = "none"; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Open in Canvas
                  </a>
                )}
              </div>
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
    </div>
  );
}

// Shared Actual Budget accounts cache — fetched once across all BillBadge instances
let _accountsCache = null;
let _accountsFetching = false;
let _accountsListeners = [];

function ensureAccountsLoaded(setAccounts) {
  if (_accountsCache) { setAccounts(_accountsCache); return; }
  _accountsListeners.push(setAccounts);
  if (_accountsFetching) return;
  _accountsFetching = true;
  getActualAccounts()
    .then(list => { _accountsCache = list; _accountsListeners.forEach(fn => fn(list)); })
    .catch(() => { _accountsListeners.forEach(fn => fn([])); })
    .finally(() => { _accountsFetching = false; _accountsListeners = []; });
}

function SearchableDropdown({ options, value, onChange, placeholder = "Select..." }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => o.id === value);
  const filtered = search
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Auto-select first match on type
  useEffect(() => {
    if (search && filtered.length > 0) onChange(filtered[0].id);
  }, [search]);

  return (
    <div ref={ref} style={{ position: "relative" }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button
        onClick={() => { setOpen(!open); setSearch(""); }}
        style={{
          width: "100%", textAlign: "left", fontSize: 13, color: "#e2e8f0",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 6, padding: "6px 10px", cursor: "pointer", display: "flex",
          justifyContent: "space-between", alignItems: "center",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)"; }}
      >
        <span style={{ fontWeight: 500 }}>{selected?.name || placeholder}</span>
        <span style={{ color: "#64748b", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: "100%", fontSize: 12, color: "#e2e8f0", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "5px 8px",
                outline: "none",
              }}
              onFocus={e => { e.target.style.borderColor = "rgba(99,102,241,0.4)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (filtered.length) { onChange(filtered[0].id); } setOpen(false); setSearch(""); } else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setSearch(""); } }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "#64748b" }}>No matches</div>
            )}
            {filtered.map(o => (
              <div
                key={o.id}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                onClick={e => { e.stopPropagation(); onChange(o.id); setOpen(false); setSearch(""); }}
                style={{
                  padding: "8px 12px", fontSize: 13, cursor: "pointer",
                  color: o.id === value ? "#818cf8" : "#e2e8f0",
                  background: o.id === value ? "rgba(129,140,248,0.1)" : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (o.id !== value) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (o.id !== value) e.currentTarget.style.background = o.id === value ? "rgba(129,140,248,0.1)" : "transparent"; }}
              >
                {o.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatModelName(model) {
  if (!model) return "Claude";
  // Extract family and version: "claude-sonnet-4-6" → "Sonnet 4.6"
  const match = model.match(/(opus|sonnet|haiku)-(\d+)-?(\d+)?/i);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const version = match[3] ? `${match[2]}.${match[3]}` : match[2];
    return `${family} ${version}`;
  }
  return "Claude";
}

function BillBadge({ bill, model }) {
  const modelDisplayName = formatModelName(model);
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [editPayee, setEditPayee] = useState(bill.payee || "");
  const [editAmount, setEditAmount] = useState(bill.amount != null ? String(bill.amount) : "");
  const [editDue, setEditDue] = useState(bill.due_date || "");
  const [accounts, setAccounts] = useState(_accountsCache || []);
  const [editAccount, setEditAccount] = useState("");
  const typeInfo = typeLabels[bill.type] || typeLabels.expense;

  useEffect(() => { ensureAccountsLoaded(setAccounts); }, []);

  const handleSend = (e) => {
    e.stopPropagation();
    setState("sending");
    const edited = { ...bill, payee: editPayee, amount: parseFloat(editAmount) || 0, due_date: editDue, account_id: editAccount || undefined };
    sendToActualBudget(edited)
      .then(() => setState("sent"))
      .catch(() => setState("error"));
  };

  const inputStyle = {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 6, padding: "6px 10px", fontSize: 13, fontWeight: 500,
    color: "#e2e8f0", outline: "none", width: "100%", transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  };
  const focusStyle = (e) => { e.target.style.borderColor = "rgba(99,102,241,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; };
  const blurStyle = (e) => { e.target.style.borderColor = "rgba(99,102,241,0.2)"; e.target.style.boxShadow = "none"; };

  const canSend = editPayee.trim() && editAmount.trim() && editDue && editAccount;

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
      borderRadius: 10, padding: "12px 14px", marginTop: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: typeInfo.color, background: typeInfo.color + "18", padding: "3px 8px", borderRadius: 5 }}>{typeInfo.icon} {typeInfo.label}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>detected by {modelDisplayName}</span>
      </div>

      {(state === "idle" || state === "error") && (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Payee</div>
              <input value={editPayee} onChange={e => setEditPayee(e.target.value)} placeholder="e.g. Da Vien" style={inputStyle}
                onFocus={focusStyle} onBlur={blurStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Amount</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#64748b", pointerEvents: "none" }}>$</span>
                <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" style={{ ...inputStyle, paddingLeft: 22 }}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Due</div>
              <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }}
                onFocus={focusStyle} onBlur={blurStyle}
              />
            </div>
          </div>
          {accounts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Account</div>
              <SearchableDropdown options={accounts} value={editAccount} onChange={setEditAccount} placeholder="Select account..." />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {state === "error" && <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 6 }}>Failed to send — check fields and try again.</div>}
            <button onClick={handleSend} disabled={!canSend} className="bill-send-btn" style={{ background: canSend ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(99,102,241,0.2)", color: canSend ? "#fff" : "#64748b", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center", transition: "all 0.2s ease" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Send to Actual Budget</button>
          </div>
        </>
      )}

      {state === "sending" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 16px", marginTop: 10, background: "rgba(99,102,241,0.1)", borderRadius: 8 }}><div style={{ width: 14, height: 14, border: "2px solid rgba(99,102,241,0.3)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 12, color: "#a5b4fc" }}>Syncing with Actual Budget…</span></div>}
      {state === "sent" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", marginTop: 10, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg><span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>Added to Actual Budget</span></div>}
    </div>
  );
}

function EmailIframe({ html }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    function resize() {
      try {
        const h = iframe.contentDocument?.documentElement?.scrollHeight;
        if (h && h > 50) setHeight(Math.min(h + 16, window.innerHeight * 0.7));
      } catch { /* cross-origin */ }
    }
    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [html]);

  // Sanitize then wrap in a full document so the email's own styles apply
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["style", "link", "meta", "img", "center"],
    ADD_ATTR: ["src", "alt", "width", "height", "style", "class", "align", "valign", "bgcolor", "cellpadding", "cellspacing", "border", "role"],
    WHOLE_DOCUMENT: true,
  });

  return (
    <iframe
      ref={iframeRef}
      className="email-iframe"
      style={{ height }}
      sandbox="allow-same-origin"
      srcDoc={sanitized}
      title="Email content"
    />
  );
}

function useEmailBody(email) {
  const emailKey = email.uid || email.id;
  // Track which key the result belongs to
  const [result, setResult] = useState({
    key: null,
    body: null,
    loading: false,
  });

  useEffect(() => {
    if (email.fullBody) return;
    let cancelled = false;
    getEmailBody(emailKey)
      .then((res) => {
        if (!cancelled)
          setResult({ key: emailKey, body: res.html_body, loading: false });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key: emailKey, body: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [emailKey]);

  if (email.fullBody) return { body: email.fullBody, loading: false };
  // If result is for a different key, we're loading
  if (result.key !== emailKey) return { body: null, loading: true };
  return { body: result.body, loading: false };
}

function EmailBody({ email, model, onLoaded }) {
  const { body, loading: loadingBody } = useEmailBody(email);
  const isHtml = body && /<[a-z!\/]/i.test(body);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!loadingBody && !notifiedRef.current) {
      notifiedRef.current = true;

      setTimeout(() => onLoaded?.(), 75);
    }
  }, [loadingBody]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        animation: "fadeIn 0.2s ease",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        marginTop: 12,
        paddingTop: 14,
      }}
    >
      {email.preview && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            marginBottom: 12,
            padding: "10px 12px",
            background: "rgba(251,191,36,0.04)",
            borderRadius: 8,
            border: "1px solid rgba(251,191,36,0.08)",
          }}
        >
          <span style={{ fontSize: 11, marginTop: 1 }}>✨</span>
          <span style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.6 }}>
            {email.preview}
          </span>
        </div>
      )}
      {loadingBody ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 0",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              border: "2px solid rgba(255,255,255,0.1)",
              borderTopColor: "#818cf8",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Loading email...
          </span>
        </div>
      ) : body ? (
        isHtml ? (
          <EmailIframe html={body} />
        ) : (
          <pre className="email-text">{body}</pre>
        )
      ) : (
        <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
          Email body unavailable
        </div>
      )}
      {email.hasBill && email.extractedBill && (
        <div style={{ marginTop: 10 }}>
          <BillBadge bill={email.extractedBill} model={model} />
        </div>
      )}
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
  const [holdConfirm, setHoldConfirm] = useState(false); // show "Generate fresh AI briefing?" confirm
  const [modelLabel, setModelLabel] = useState("Claude");
  const [genProgress, setGenProgress] = useState(null); // progress text from server
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingPast, setViewingPast] = useState(null); // { id, generated_at } when viewing a past briefing
  const [latestBriefing, setLatestBriefing] = useState(null); // preserved so "Back to latest" is instant
  const [latestId, setLatestId] = useState(null); // id of the most recent briefing
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
          background:
            "linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)",
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
        background:
          "linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)",
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
              <button
                className="btn-header"
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                disabled={refreshing || generating}
                title="Tap to refresh data · Hold to regenerate AI briefing · Hotkey: R"
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
                  transition:
                    "color 0.2s ease, opacity 0.2s ease, border-color 0.2s ease",
                  userSelect: "none",
                  touchAction: "none",
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
            }}
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
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setActiveAccount(email._accIdx);
                        const original = emailAccounts[
                          email._accIdx
                        ]?.important?.find((e) => e.id === email.id);
                        setSelectedEmail(original || email);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.02)",
                        borderRadius: 8,
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.05)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.02)")
                      }
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
            return (
              <div
                key={i}
                data-email-id={email.id}
                onClick={() => setSelectedEmail(isOpen ? null : email)}
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
                }}
                onMouseLeave={(e) => {
                  if (!isOpen)
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        {email.from}
                      </span>
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
                  <EmailBody
                    email={email}
                    model={d.model}
                    onLoaded={() => {
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
