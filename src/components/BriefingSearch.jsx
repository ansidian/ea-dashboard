import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { searchBriefings, analyzeSearchResults, getBriefingById } from "../api";
import { transformBriefing } from "../transform";

const SECTION_ICONS = {
  bills: "💰",
  emails: "📧",
  insights: "💡",
  calendar: "📅",
  deadlines: "⏰",
};

const DEBOUNCE_MS = 300;
const MIN_RELEVANCE = 0.15;

// --- Context extraction ---

function extractRelatedContext(briefing, sectionType, chunkText) {
  if (!briefing) return null;
  const ctx = { primary: [], related: [] };
  const chunk = chunkText.toLowerCase();

  const allEmails = [];
  for (const acct of briefing.emails?.accounts || []) {
    for (const e of acct.important || []) {
      allEmails.push({ ...e, accountName: acct.name, accountIcon: acct.icon, accountColor: acct.color });
    }
  }
  const allBills = allEmails.filter(e => e.hasBill && e.extractedBill);
  const insights = briefing.aiInsights || [];
  const calendar = briefing.calendar || [];
  const deadlines = [...(briefing.ctm?.upcoming || []), ...(briefing.deadlines || [])];

  if (sectionType === "bills") {
    ctx.primary = allBills.filter(e => {
      const payee = (e.extractedBill.payee || "").toLowerCase();
      return chunk.includes(payee) || payee.includes(chunk.split(":")[0]?.trim()?.toLowerCase());
    });
    const payees = ctx.primary.map(e => (e.extractedBill.payee || "").toLowerCase());
    ctx.related.push(...insights
      .filter(i => payees.some(p => i.text.toLowerCase().includes(p)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
    // Related emails from same senders (navigable)
    ctx.related.push(...allEmails
      .filter(e => !e.hasBill && payees.some(p => (e.from || "").toLowerCase().includes(p)))
      .map(e => ({ type: "email", icon: "📧", text: `${e.from}: "${e.subject}"`, emailData: e })));
  } else if (sectionType === "emails") {
    ctx.primary = allEmails.filter(e => {
      const from = (e.from || "").toLowerCase();
      const subject = (e.subject || "").toLowerCase();
      return chunk.includes(from) || chunk.includes(subject.slice(0, 30));
    });
    const senders = ctx.primary.map(e => (e.from || "").toLowerCase().split(" ")[0]);
    ctx.related.push(...insights
      .filter(i => senders.some(s => s.length > 2 && i.text.toLowerCase().includes(s)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
    ctx.related.push(...allBills
      .filter(e => senders.some(s => (e.from || "").toLowerCase().includes(s)) && !ctx.primary.includes(e))
      .map(e => ({ type: "bill", icon: "💰", text: `${e.extractedBill.payee}: $${e.extractedBill.amount}` })));
  } else if (sectionType === "deadlines") {
    ctx.primary = deadlines.filter(d => {
      const title = (d.title || "").toLowerCase();
      return chunk.includes(title.slice(0, 20));
    });
    const titles = ctx.primary.map(d => (d.title || "").toLowerCase().split(" ")[0]);
    ctx.related.push(...insights
      .filter(i => titles.some(t => t.length > 2 && i.text.toLowerCase().includes(t)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
    ctx.related.push(...calendar
      .filter(e => !e.passed).slice(0, 3)
      .map(e => ({ type: "calendar", icon: "📅", text: `${e.time} — ${e.title}` })));
  } else if (sectionType === "insights") {
    ctx.primary = insights.filter(i => {
      const text = i.text.toLowerCase();
      const words = chunk.split(/\s+/).filter(w => w.length > 4);
      return words.filter(w => text.includes(w)).length >= 2;
    });
    for (const insight of ctx.primary) {
      const iText = insight.text.toLowerCase();
      for (const e of allEmails) {
        if (iText.includes((e.from || "").toLowerCase().split(" ")[0]) && (e.from || "").length > 2) {
          ctx.related.push({ type: "email", icon: "📧", text: `${e.from}: "${e.subject}"`, urgency: e.urgency, emailData: e });
        }
      }
      for (const d of deadlines) {
        if (iText.includes((d.title || "").toLowerCase().slice(0, 15))) {
          ctx.related.push({ type: "deadline", icon: "⏰", text: `${d.title} — due ${d.due_date}` });
        }
      }
    }
  } else if (sectionType === "calendar") {
    ctx.primary = calendar.filter(e => chunk.includes((e.title || "").toLowerCase().slice(0, 15)));
    const titles = ctx.primary.map(e => (e.title || "").toLowerCase().split(" ")[0]);
    ctx.related.push(...insights
      .filter(i => titles.some(t => t.length > 2 && i.text.toLowerCase().includes(t)))
      .map(i => ({ type: "insight", icon: i.icon, text: i.text })));
  }

  // Deduplicate
  const seen = new Set();
  ctx.related = ctx.related.filter(r => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });

  return ctx;
}

// --- Component ---

export default function BriefingSearch({ onNavigateToEmail }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [pos, setPos] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedCtx, setExpandedCtx] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(null);
  const briefingCache = useRef({});
  const inputRef = useRef(null);
  const inputWrapRef = useRef(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const debounceRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!inputWrapRef.current) return;
    const rect = inputWrapRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        if (expandedId) { setExpandedId(null); setExpandedCtx(null); }
        else { setOpen(false); inputRef.current?.blur(); }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, expandedId]);

  useEffect(() => {
    function handleClick(e) {
      if (inputWrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  // Scroll trapping on the SCROLL CONTAINER (not the outer panel)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    function handleWheel(e) {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [open, results, expandedId]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults(null); setAnalysis(null); return; }
    setSearching(true);
    setError(null);
    setAnalysis(null);
    setExpandedId(null);
    setExpandedCtx(null);
    try {
      const data = await searchBriefings(q);
      setResults(data.results || []);
      setFocusedIdx(-1);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), DEBOUNCE_MS);
  }

  function handleKeyDown(e) {
    if (!open || !relevant.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx(i => Math.min(i + 1, relevant.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      handleExpand(relevant[focusedIdx]);
    }
  }

  async function fetchBriefing(briefingId) {
    if (briefingCache.current[briefingId]) return briefingCache.current[briefingId];
    const res = await getBriefingById(briefingId);
    const briefing = transformBriefing(res.briefing);
    briefingCache.current[briefingId] = { briefing, generated_at: res.generated_at };
    return briefingCache.current[briefingId];
  }

  async function handleExpand(r) {
    const key = `${r.briefing_id}-${r.id}`;
    if (expandedId === key) {
      setExpandedId(null);
      setExpandedCtx(null);
      return;
    }
    setExpandedId(key);
    setExpandedCtx(null);
    setLoadingCtx(key);
    try {
      const { briefing } = await fetchBriefing(r.briefing_id);
      setExpandedCtx(extractRelatedContext(briefing, r.section_type, r.chunk_text));
    } catch {
      setExpandedCtx({ primary: [], related: [{ type: "error", icon: "⚠️", text: "Failed to load briefing context" }] });
    } finally {
      setLoadingCtx(null);
    }
  }

  async function handleEmailClick(emailData, briefingId) {
    if (!onNavigateToEmail || !emailData) return;
    try {
      const { briefing, generated_at } = await fetchBriefing(briefingId);
      onNavigateToEmail({ briefing, briefingId, generated_at, emailId: emailData.id, accountName: emailData.accountName });
      setOpen(false);
    } catch (err) {
      console.error("[EA] Navigate to email failed:", err.message);
    }
  }

  async function handleAnalyze() {
    if (!results?.length || analyzing) return;
    setAnalyzing(true);
    try {
      const data = await analyzeSearchResults(query, results);
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalysis(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  const relevant = (results || []).filter(r => r.score == null || r.score >= MIN_RELEVANCE);
  const grouped = {};
  for (const r of relevant) {
    if (!grouped[r.source_date]) grouped[r.source_date] = [];
    grouped[r.source_date].push(r);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function formatDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - d) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const showDropdown = open && (results !== null || searching || error);
  const hasResults = relevant.length > 0;

  return (
    <>
      <div ref={inputWrapRef} style={{ position: "relative", marginBottom: 20 }}>
        <div
          style={{
            display: "flex", alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${open ? "rgba(129,140,248,0.3)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 8, padding: "8px 12px",
            transition: "border-color 0.2s ease",
          }}
        >
          <span style={{ color: "#64748b", fontSize: 14, marginRight: 8, flexShrink: 0 }}>
            {searching ? "⏳" : "🔍"}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (query) setOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Search briefings... (Ctrl+K)"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults(null); setAnalysis(null); setOpen(false); setExpandedId(null); }}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, padding: "2px 4px", fontFamily: "inherit" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {showDropdown && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: pos.top, left: pos.left, width: pos.width,
            background: "#16161e",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            maxHeight: `min(480px, calc(100vh - ${pos.top + 16}px))`,
            display: "flex", flexDirection: "column",
            zIndex: 9999,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
            isolation: "isolate",
          }}
        >
          {/* Scrollable results — this is the actual scroll container */}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}
          >
            {error && (
              <div style={{ padding: "12px 16px", color: "#fca5a5", fontSize: 12 }}>{error}</div>
            )}
            {searching && !results && (
              <div style={{ padding: "16px", color: "#64748b", fontSize: 12, textAlign: "center" }}>Searching...</div>
            )}
            {!hasResults && results !== null && !searching && (
              <div style={{ padding: "16px", color: "#64748b", fontSize: 12, textAlign: "center" }}>No results found</div>
            )}

            {sortedDates.map(date => (
              <div key={date}>
                <div style={{
                  padding: "8px 16px 4px", fontSize: 10, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "#475569", fontWeight: 600,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}>
                  {formatDate(date)}
                </div>
                {grouped[date].map((r, i) => {
                  const globalIdx = relevant.indexOf(r);
                  const key = `${r.briefing_id}-${r.id}`;
                  const isExpanded = expandedId === key;
                  return (
                    <div key={r.id || `${date}-${i}`}>
                      <div
                        onClick={() => handleExpand(r)}
                        style={{
                          padding: "8px 16px",
                          display: "flex", gap: 8, alignItems: "flex-start",
                          background: isExpanded ? "rgba(99,102,241,0.08)" : globalIdx === focusedIdx ? "rgba(99,102,241,0.05)" : "transparent",
                          cursor: "pointer", transition: "background 0.1s ease",
                        }}
                        onMouseEnter={() => setFocusedIdx(globalIdx)}
                      >
                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                          {SECTION_ICONS[r.section_type] || "📋"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{
                              fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                              color: "#818cf8", fontWeight: 600,
                              background: "rgba(129,140,248,0.1)", padding: "1px 5px", borderRadius: 3,
                            }}>
                              {r.section_type}
                            </span>
                            {r.score != null && (
                              <span style={{ fontSize: 10, color: "#475569" }}>{Math.round(r.score * 100)}%</span>
                            )}
                          </div>
                          <div style={{
                            fontSize: 12, color: "#cbd5e1", lineHeight: 1.4,
                            overflow: "hidden", display: "-webkit-box",
                            WebkitLineClamp: isExpanded ? 999 : 2,
                            WebkitBoxOrient: "vertical", whiteSpace: "pre-wrap",
                          }}>
                            {r.chunk_text}
                          </div>
                        </div>
                        <span style={{
                          color: isExpanded ? "#818cf8" : "#475569",
                          fontSize: 11, flexShrink: 0, marginTop: 2,
                          transition: "transform 0.2s ease, color 0.15s ease",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                        }}>
                          ▸
                        </span>
                      </div>

                      {isExpanded && (
                        <ContextCard
                          ctx={expandedCtx}
                          loading={loadingCtx === key}
                          sectionType={r.section_type}
                          briefingId={r.briefing_id}
                          onEmailClick={(emailData) => handleEmailClick(emailData, r.briefing_id)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {analysis && (
              <div style={{
                padding: "12px 16px",
                borderTop: "1px solid rgba(129,140,248,0.15)",
                background: "rgba(99,102,241,0.04)",
              }}>
                <div style={{
                  fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                  color: "#818cf8", fontWeight: 600, marginBottom: 6,
                }}>
                  Analysis
                </div>
                <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {analysis}
                </div>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          {hasResults && (
            <div style={{
              padding: "8px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "#16161e",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0, borderRadius: "0 0 12px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  style={{
                    background: analyzing ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.12)",
                    border: "1px solid rgba(129,140,248,0.2)", borderRadius: 6,
                    padding: "5px 12px", fontSize: 11, color: "#a5b4fc",
                    cursor: analyzing ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontWeight: 500, transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => { if (!analyzing) { e.currentTarget.style.background = "rgba(99,102,241,0.2)"; e.currentTarget.style.borderColor = "rgba(129,140,248,0.35)"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = analyzing ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.12)"; e.currentTarget.style.borderColor = "rgba(129,140,248,0.2)"; }}
                >
                  {analyzing ? "Analyzing..." : "Analyze with Claude"}
                </button>
                <span style={{ fontSize: 10, color: "#475569" }}>Haiku 4.5</span>
              </div>
              <span style={{ fontSize: 10, color: "#475569" }}>
                {relevant.length} result{relevant.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// --- Context card ---

function ContextCard({ ctx, loading, sectionType, briefingId, onEmailClick }) {
  if (loading) {
    return (
      <div style={{ padding: "8px 16px 12px 38px", color: "#64748b", fontSize: 11 }}>
        Loading context...
      </div>
    );
  }
  if (!ctx) return null;

  const hasPrimary = ctx.primary?.length > 0;
  const hasRelated = ctx.related?.length > 0;

  if (!hasPrimary && !hasRelated) {
    return (
      <div style={{ padding: "8px 16px 12px 38px", color: "#475569", fontSize: 11, fontStyle: "italic" }}>
        No additional context found in this briefing
      </div>
    );
  }

  return (
    <div style={{
      margin: "0 12px 8px 38px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 8, overflow: "hidden",
    }}>
      {hasPrimary && (
        <div style={{ padding: "8px 12px" }}>
          <div style={{
            fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
            color: "#64748b", fontWeight: 600, marginBottom: 6,
          }}>
            {sectionType === "bills" ? "Matched Transactions" :
             sectionType === "emails" ? "Matched Emails" :
             sectionType === "deadlines" ? "Matched Deadlines" :
             sectionType === "calendar" ? "Matched Events" : "Matched Insights"}
          </div>
          {ctx.primary.map((item, i) => (
            <PrimaryItem
              key={i}
              item={item}
              sectionType={sectionType}
              onEmailClick={onEmailClick}
            />
          ))}
        </div>
      )}

      {hasRelated && (
        <div style={{
          padding: "8px 12px",
          borderTop: hasPrimary ? "1px solid rgba(255,255,255,0.05)" : "none",
        }}>
          <div style={{
            fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
            color: "#64748b", fontWeight: 600, marginBottom: 6,
          }}>
            Related
          </div>
          {ctx.related.map((item, i) => (
            <RelatedItem key={i} item={item} onEmailClick={onEmailClick} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Related item (email items are clickable) ---

function RelatedItem({ item, onEmailClick }) {
  const isEmail = item.type === "email" && item.emailData;

  return (
    <div
      onClick={isEmail ? () => onEmailClick(item.emailData) : undefined}
      style={{
        display: "flex", gap: 6, alignItems: "flex-start",
        padding: "4px 0", fontSize: 11, color: "#94a3b8",
        cursor: isEmail ? "pointer" : "default",
        borderRadius: 4,
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) => { if (isEmail) e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
      onMouseLeave={(e) => { if (isEmail) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flexShrink: 0 }}>{item.icon}</span>
      <span style={{ lineHeight: 1.4, flex: 1 }}>{item.text}</span>
      {isEmail && (
        <span style={{ color: "#818cf8", fontSize: 10, flexShrink: 0, marginTop: 1 }}>
          view →
        </span>
      )}
    </div>
  );
}

// --- Primary item renderers ---

function PrimaryItem({ item, sectionType, onEmailClick }) {
  // Emails and bills-with-email-data are clickable
  const isClickableEmail = (sectionType === "emails" || sectionType === "bills") && item.id && item.accountName;

  if (sectionType === "bills" && item.extractedBill) {
    const bill = item.extractedBill;
    return (
      <div
        onClick={isClickableEmail ? () => onEmailClick(item) : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 0", fontSize: 11,
          cursor: isClickableEmail ? "pointer" : "default",
          borderRadius: 4, transition: "background 0.1s ease",
        }}
        onMouseEnter={(e) => { if (isClickableEmail) e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
        onMouseLeave={(e) => { if (isClickableEmail) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ color: "#34d399", fontWeight: 600, minWidth: 60 }}>
          ${bill.amount.toFixed(2)}
        </span>
        <span style={{ color: "#cbd5e1" }}>{bill.payee}</span>
        {bill.due_date && <span style={{ color: "#64748b" }}>due {bill.due_date}</span>}
        {bill.type && (
          <span style={{
            fontSize: 9, color: "#818cf8", background: "rgba(129,140,248,0.1)",
            padding: "1px 4px", borderRadius: 3,
          }}>
            {bill.type}
          </span>
        )}
        {bill.category_name && <span style={{ color: "#475569" }}>[{bill.category_name}]</span>}
        {isClickableEmail && (
          <span style={{ color: "#818cf8", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>view →</span>
        )}
      </div>
    );
  }

  if (sectionType === "emails") {
    const urgColors = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
    return (
      <div
        onClick={isClickableEmail ? () => onEmailClick(item) : undefined}
        style={{
          padding: "4px 0", fontSize: 11,
          cursor: isClickableEmail ? "pointer" : "default",
          borderRadius: 4, transition: "background 0.1s ease",
        }}
        onMouseEnter={(e) => { if (isClickableEmail) e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
        onMouseLeave={(e) => { if (isClickableEmail) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{item.from}</span>
          {item.urgency && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: urgColors[item.urgency] || "#6b7280", flexShrink: 0,
            }} />
          )}
          {item.action && item.action !== "FYI" && (
            <span style={{ color: "#f59e0b", fontSize: 10 }}>{item.action}</span>
          )}
          {isClickableEmail && (
            <span style={{ color: "#818cf8", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>view →</span>
          )}
        </div>
        <div style={{ color: "#94a3b8", marginTop: 1 }}>{item.subject}</div>
      </div>
    );
  }

  if (sectionType === "deadlines") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }}>
        <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{item.title}</span>
        {item.due_date && <span style={{ color: "#64748b" }}>due {item.due_date}</span>}
        {item.class_name && <span style={{ color: "#818cf8" }}>{item.class_name}</span>}
        {item.points_possible > 0 && <span style={{ color: "#475569" }}>{item.points_possible}pts</span>}
      </div>
    );
  }

  if (sectionType === "calendar") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }}>
        <span style={{ color: "#e2e8f0" }}>{item.time}</span>
        <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{item.title}</span>
        {item.duration && <span style={{ color: "#64748b" }}>{item.duration}</span>}
        {item.flag && <span style={{ color: "#f59e0b", fontSize: 10 }}>[{item.flag}]</span>}
      </div>
    );
  }

  // Insights
  if (item.text) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "4px 0", fontSize: 11, color: "#cbd5e1" }}>
        <span style={{ flexShrink: 0 }}>{item.icon}</span>
        <span style={{ lineHeight: 1.4 }}>{item.text}</span>
      </div>
    );
  }

  return null;
}
