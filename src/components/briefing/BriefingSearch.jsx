import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { searchBriefings, analyzeSearchResults, getBriefingById } from "../../api";
import { transformBriefing } from "../../transform";
import { cn } from "@/lib/utils";

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
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
    const diff = Math.round((new Date(todayStr + "T12:00:00") - d) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  }

  const showDropdown = open && (results !== null || searching || error);
  const hasResults = relevant.length > 0;

  return (
    <>
      <div ref={inputWrapRef} className="relative mb-5">
        <div
          className={cn(
            "flex items-center bg-input-bg border rounded-default px-3 py-2 transition-colors",
            open ? "border-accent-light/30" : "border-white/[0.08]",
          )}
        >
          <span className="text-text-muted text-sm mr-2 shrink-0">
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
            className="flex-1 bg-transparent border-none outline-none text-text-body text-[13px] font-[inherit]"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults(null); setAnalysis(null); setOpen(false); setExpandedId(null); }}
              className="bg-transparent border-none text-text-muted cursor-pointer text-xs px-1 py-0.5 font-[inherit] hover:text-text-secondary"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {showDropdown && pos && createPortal(
        <div
          ref={panelRef}
          className="bg-elevated border border-white/10 rounded-lg shadow-modal z-[9999] isolate flex flex-col"
          style={{
            position: "fixed",
            top: pos.top, left: pos.left, width: pos.width,
            maxHeight: `min(480px, calc(100vh - ${pos.top + 16}px))`,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
          }}
        >
          {/* Scrollable results — this is the actual scroll container */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain min-h-0"
          >
            {error && (
              <div className="px-4 py-3 text-red-300 text-xs">{error}</div>
            )}
            {searching && !results && (
              <div className="p-4 text-text-muted text-xs text-center">Searching...</div>
            )}
            {!hasResults && results !== null && !searching && (
              <div className="p-4 text-text-muted text-xs text-center">No results found</div>
            )}

            {sortedDates.map(date => (
              <div key={date}>
                <div className="px-4 pt-2 pb-1 text-[10px] tracking-[1.5px] uppercase text-text-muted font-semibold border-t border-white/5">
                  {formatDate(date)}
                </div>
                {grouped[date].map((r, i) => {
                  const globalIdx = relevant.indexOf(r);
                  const key = `${r.briefing_id}-${r.id}`;
                  const isExpanded = expandedId === key;
                  return (
                    <div key={r.id || `${date}-${i}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleExpand(r)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleExpand(r); }}
                        className={cn(
                          "px-4 py-2 flex gap-2 items-start cursor-pointer transition-colors",
                          isExpanded
                            ? "bg-accent/[0.08]"
                            : globalIdx === focusedIdx
                              ? "bg-accent/5"
                              : "hover:bg-accent/5",
                        )}
                        onMouseEnter={() => setFocusedIdx(globalIdx)}
                      >
                        <span className="text-sm shrink-0 mt-px">
                          {SECTION_ICONS[r.section_type] || "📋"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] tracking-wider uppercase text-accent-light font-semibold bg-accent-light/10 px-1.5 py-px rounded-sm">
                              {r.section_type}
                            </span>
                            {r.score != null && (
                              <span className="text-[10px] text-text-muted">{Math.round(r.score * 100)}%</span>
                            )}
                          </div>
                          <div
                            className="text-xs text-slate-300 leading-relaxed overflow-hidden whitespace-pre-wrap"
                            style={{
                              display: "-webkit-box",
                              WebkitLineClamp: isExpanded ? 999 : 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {r.chunk_text}
                          </div>
                        </div>
                        <span className={cn(
                          "text-[11px] shrink-0 mt-0.5 transition-all duration-200",
                          isExpanded ? "text-accent-light rotate-90" : "text-text-muted",
                        )}>
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
              <div className="px-4 py-3 border-t border-accent-light/15 bg-accent/[0.04]">
                <div className="text-[10px] tracking-wider uppercase text-accent-light font-semibold mb-1.5">
                  Analysis
                </div>
                <div className="text-xs text-slate-300 leading-normal whitespace-pre-wrap">
                  {analysis}
                </div>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          {hasResults && (
            <div className="px-4 py-2 border-t border-white/[0.08] bg-elevated flex items-center justify-between shrink-0 rounded-b-lg">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className={cn(
                    "border border-accent-light/20 rounded-md px-3 py-1 text-[11px] text-accent-lighter font-medium font-[inherit] transition-all",
                    analyzing
                      ? "bg-accent/[0.08] cursor-not-allowed"
                      : "bg-accent/[0.12] cursor-pointer hover:bg-accent/20 hover:border-accent-light/35",
                  )}
                >
                  {analyzing ? "Analyzing..." : "Analyze with Claude"}
                </button>
                <span className="text-[10px] text-text-muted">Haiku 4.5</span>
              </div>
              <span className="text-[10px] text-text-muted">
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
      <div className="py-2 px-4 pl-[38px] text-text-muted text-[11px]">
        Loading context...
      </div>
    );
  }
  if (!ctx) return null;

  const hasPrimary = ctx.primary?.length > 0;
  const hasRelated = ctx.related?.length > 0;

  if (!hasPrimary && !hasRelated) {
    return (
      <div className="py-2 px-4 pl-[38px] pb-3 text-text-muted text-[11px] italic">
        No additional context found in this briefing
      </div>
    );
  }

  return (
    <div className="mx-3 ml-[38px] mb-2 bg-surface border border-border rounded-default overflow-hidden">
      {hasPrimary && (
        <div className="p-2 px-3">
          <div className="text-[9px] tracking-[1.2px] uppercase text-text-muted font-semibold mb-1.5">
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
        <div className={cn("p-2 px-3", hasPrimary && "border-t border-white/5")}>
          <div className="text-[9px] tracking-[1.2px] uppercase text-text-muted font-semibold mb-1.5">
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
      role={isEmail ? "button" : undefined}
      tabIndex={isEmail ? 0 : undefined}
      onClick={isEmail ? () => onEmailClick(item.emailData) : undefined}
      onKeyDown={isEmail ? (e) => { if (e.key === "Enter" || e.key === " ") onEmailClick(item.emailData); } : undefined}
      className={cn(
        "flex gap-1.5 items-start py-1 text-[11px] text-text-secondary rounded-xs transition-colors",
        isEmail && "cursor-pointer hover:bg-accent/[0.08]",
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="leading-relaxed flex-1">{item.text}</span>
      {isEmail && (
        <span className="text-accent-light text-[10px] shrink-0 mt-px">
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
        role={isClickableEmail ? "button" : undefined}
        tabIndex={isClickableEmail ? 0 : undefined}
        onClick={isClickableEmail ? () => onEmailClick(item) : undefined}
        onKeyDown={isClickableEmail ? (e) => { if (e.key === "Enter" || e.key === " ") onEmailClick(item); } : undefined}
        className={cn(
          "flex items-center gap-2 py-1 text-[11px] rounded-xs transition-colors",
          isClickableEmail && "cursor-pointer hover:bg-accent/[0.08]",
        )}
      >
        <span className="text-success font-semibold min-w-[60px]">
          ${bill.amount.toFixed(2)}
        </span>
        <span className="text-slate-300">{bill.payee}</span>
        {bill.due_date && <span className="text-text-muted">due {bill.due_date}</span>}
        {bill.type && (
          <span className="text-[9px] text-accent-light bg-accent-light/10 px-1 py-px rounded-sm">
            {bill.type}
          </span>
        )}
        {bill.category_name && <span className="text-text-muted">[{bill.category_name}]</span>}
        {isClickableEmail && (
          <span className="text-accent-light text-[10px] ml-auto shrink-0">view →</span>
        )}
      </div>
    );
  }

  if (sectionType === "emails") {
    const urgColors = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
    return (
      <div
        role={isClickableEmail ? "button" : undefined}
        tabIndex={isClickableEmail ? 0 : undefined}
        onClick={isClickableEmail ? () => onEmailClick(item) : undefined}
        onKeyDown={isClickableEmail ? (e) => { if (e.key === "Enter" || e.key === " ") onEmailClick(item); } : undefined}
        className={cn(
          "py-1 text-[11px] rounded-xs transition-colors",
          isClickableEmail && "cursor-pointer hover:bg-accent/[0.08]",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-text-body font-medium">{item.from}</span>
          {item.urgency && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: urgColors[item.urgency] || "#6b7280" }}
            />
          )}
          {item.action && item.action !== "FYI" && (
            <span className="text-warning text-[10px]">{item.action}</span>
          )}
          {isClickableEmail && (
            <span className="text-accent-light text-[10px] ml-auto shrink-0">view →</span>
          )}
        </div>
        <div className="text-text-secondary mt-px">{item.subject}</div>
      </div>
    );
  }

  if (sectionType === "deadlines") {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="text-text-body font-medium">{item.title}</span>
        {item.due_date && <span className="text-text-muted">due {item.due_date}</span>}
        {item.class_name && <span className="text-accent-light">{item.class_name}</span>}
        {item.points_possible > 0 && <span className="text-text-muted">{item.points_possible}pts</span>}
      </div>
    );
  }

  if (sectionType === "calendar") {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="text-text-body">{item.time}</span>
        <span className="text-slate-300 font-medium">{item.title}</span>
        {item.duration && <span className="text-text-muted">{item.duration}</span>}
        {item.flag && <span className="text-warning text-[10px]">[{item.flag}]</span>}
      </div>
    );
  }

  // Insights
  if (item.text) {
    return (
      <div className="flex gap-1.5 items-start py-1 text-[11px] text-slate-300">
        <span className="shrink-0">{item.icon}</span>
        <span className="leading-relaxed">{item.text}</span>
      </div>
    );
  }

  return null;
}
