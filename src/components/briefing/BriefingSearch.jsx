import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { searchBriefings, analyzeSearchResults, getBriefingById } from "../../api";
import { transformBriefing } from "../../transform";
import { cn } from "@/lib/utils";

const SECTION_META = {
  bills: { icon: "💰", color: "#a6e3a1", label: "Bills" },
  emails: { icon: "📧", color: "#89b4fa", label: "Emails" },
  insights: { icon: "💡", color: "#cba6da", label: "Insights" },
  calendar: { icon: "📅", color: "#f9e2af", label: "Calendar" },
  deadlines: { icon: "⏰", color: "#fab387", label: "Deadlines" },
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
            "flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 transition-all duration-200",
            open
              ? "bg-[#24243a] border border-primary/25 shadow-[0_0_0_3px_rgba(203,166,218,0.06)]"
              : "bg-input-bg border border-white/[0.06] hover:border-white/[0.1]",
          )}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "shrink-0 transition-colors duration-200",
              searching
                ? "text-primary animate-pulse"
                : open
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50",
            )}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (query) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search briefings..."
            className="flex-1 bg-transparent border-none outline-none text-foreground text-[13px] font-[inherit] placeholder:text-muted-foreground/40"
          />
          {!query && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <kbd className="text-[10px] text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-1 font-mono leading-none min-w-[20px] text-center">
                Ctrl
              </kbd>
              <kbd className="text-[10px] text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-1 font-mono leading-none min-w-[20px] text-center">
                K
              </kbd>
            </div>
          )}
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults(null);
                setAnalysis(null);
                setOpen(false);
                setExpandedId(null);
              }}
              className="bg-transparent border-none text-muted-foreground/40 cursor-pointer p-0.5 rounded transition-colors hover:text-muted-foreground hover:bg-white/[0.06]"
              aria-label="Clear search"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showDropdown &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="z-[9999] isolate flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: `min(480px, calc(100vh - ${pos.top + 16}px))`,
              background: "linear-gradient(180deg, #24243a 0%, #1e1e2e 100%)",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Scrollable results */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain min-h-0"
            >
              {/* Error state */}
              {error && (
                <div className="px-5 py-4 text-[11px] text-destructive text-center leading-relaxed">
                  {error}
                </div>
              )}

              {/* Searching state */}
              {searching && !results && (
                <div className="py-10 px-5 text-center">
                  <div className="w-4 h-4 border-2 border-white/[0.06] border-t-primary rounded-full animate-spin mx-auto mb-3" />
                  <div className="text-[11px] text-muted-foreground">
                    Searching briefings...
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!hasResults && results !== null && !searching && (
                <div className="py-10 px-5 text-center">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mx-auto mb-2.5 text-muted-foreground/30"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                  <div className="text-[11px] text-muted-foreground/60">
                    No results for &ldquo;{query}&rdquo;
                  </div>
                </div>
              )}

              {/* Results grouped by date */}
              {sortedDates.map((date, di) => (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 px-5 pt-3.5 pb-1.5">
                    <span className="text-[10px] tracking-[1.5px] uppercase text-muted-foreground/60 font-semibold whitespace-nowrap">
                      {formatDate(date)}
                    </span>
                    {di > 0 && <div className="flex-1 h-px bg-white/[0.04]" />}
                  </div>

                  {grouped[date].map((r, i) => {
                    const globalIdx = relevant.indexOf(r);
                    const key = `${r.briefing_id}-${r.id}`;
                    const isExpanded = expandedId === key;
                    const isFocused = globalIdx === focusedIdx;
                    const meta = SECTION_META[r.section_type] || {
                      icon: "📋",
                      color: "#b4befe",
                      label: r.section_type,
                    };

                    return (
                      <div key={r.id || `${date}-${i}`}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleExpand(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ")
                              handleExpand(r);
                          }}
                          onMouseEnter={() => setFocusedIdx(globalIdx)}
                          className={cn(
                            "group relative flex gap-3 items-start mx-2 rounded-lg cursor-pointer transition-all duration-150",
                            isExpanded && "bg-white/[0.04]",
                          )}
                          style={{ padding: "10px 14px" }}
                        >
                          {/* Hover/focus bg */}
                          {!isExpanded && (
                            <div
                              className={cn(
                                "absolute inset-0 rounded-lg transition-colors duration-150",
                                isFocused
                                  ? "bg-white/[0.04]"
                                  : "bg-transparent group-hover:bg-white/[0.03]",
                              )}
                            />
                          )}

                          {/* Section icon */}
                          <span className="relative text-sm shrink-0 mt-px">
                            {meta.icon}
                          </span>

                          <div className="relative flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {/* Section badge — color-coded */}
                              <span
                                className="text-[9px] tracking-wider uppercase font-semibold px-1.5 py-px rounded"
                                style={{
                                  color: meta.color,
                                  background: `${meta.color}12`,
                                }}
                              >
                                {meta.label}
                              </span>
                              {/* Relevance indicator */}
                              {r.score != null && (
                                <div className="flex items-center gap-1">
                                  <div className="w-[32px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-300"
                                      style={{
                                        width: `${Math.min(r.score * 100, 100)}%`,
                                        background:
                                          r.score > 0.6
                                            ? meta.color
                                            : "rgba(255,255,255,0.2)",
                                        opacity: r.score > 0.6 ? 0.7 : 0.4,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            <div
                              className="text-[12px] text-foreground/80 leading-relaxed overflow-hidden whitespace-pre-wrap"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: isExpanded ? 999 : 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {r.chunk_text}
                            </div>
                          </div>

                          {/* Expand chevron — SVG */}
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={cn(
                              "relative shrink-0 mt-1 transition-all duration-200",
                              isExpanded
                                ? "text-primary rotate-90"
                                : "text-muted-foreground/30 group-hover:text-muted-foreground/50",
                            )}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>

                        {/* Expanded context */}
                        {isExpanded && (
                          <ContextCard
                            ctx={expandedCtx}
                            loading={loadingCtx === key}
                            sectionType={r.section_type}
                            onEmailClick={(emailData) =>
                              handleEmailClick(emailData, r.briefing_id)
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* AI Analysis result */}
              {analysis && (
                <div
                  className="mx-3 mb-3 rounded-lg overflow-hidden"
                  style={{
                    background: "rgba(203,166,218,0.04)",
                    border: "1px solid rgba(203,166,218,0.1)",
                  }}
                >
                  <div className="px-4 pt-3 pb-0.5 flex items-center gap-2">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#cba6da"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <span className="text-[10px] tracking-wider uppercase text-[#cba6da] font-semibold">
                      Analysis
                    </span>
                  </div>
                  <div className="px-4 pt-1.5 pb-3 text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                    {analysis}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {hasResults && (
              <div
                className="shrink-0 flex items-center justify-between"
                style={{
                  padding: "8px 16px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.015)",
                  borderRadius: "0 0 12px 12px",
                }}
              >
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium font-[inherit] transition-all duration-200",
                    analyzing
                      ? "bg-primary/[0.06] text-muted-foreground cursor-not-allowed border border-white/[0.04]"
                      : "bg-primary/[0.08] text-[#cba6da] cursor-pointer border border-primary/15 hover:bg-primary/[0.14] hover:border-primary/25",
                  )}
                >
                  {analyzing ? (
                    <div className="w-3 h-3 border-[1.5px] border-primary/20 border-t-primary rounded-full animate-spin" />
                  ) : (
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
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  )}
                  {analyzing ? "Analyzing..." : "Analyze"}
                  {!analyzing && (
                    <span className="text-[9px] text-muted-foreground/40 font-normal ml-0.5">
                      Haiku
                    </span>
                  )}
                </button>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
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

function ContextCard({ ctx, loading, sectionType, onEmailClick }) {
  const meta = SECTION_META[sectionType] || { color: "#b4befe" };

  if (loading) {
    return (
      <div className="py-2.5 pl-[52px] pr-5 flex items-center gap-2">
        <div className="w-3 h-3 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
        <span className="text-[11px] text-muted-foreground/50">
          Loading context...
        </span>
      </div>
    );
  }
  if (!ctx) return null;

  const hasPrimary = ctx.primary?.length > 0;
  const hasRelated = ctx.related?.length > 0;

  if (!hasPrimary && !hasRelated) {
    return (
      <div className="py-2 pl-[52px] pr-5 pb-3 text-muted-foreground/40 text-[11px] italic">
        No additional context found
      </div>
    );
  }

  return (
    <div
      className="mx-4 ml-[52px] mb-3 rounded-lg overflow-hidden"
      style={{
        background: "rgba(30,30,46,0.6)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {hasPrimary && (
        <div className="p-2.5 px-3">
          <div
            className="text-[9px] tracking-[1.2px] uppercase font-semibold mb-1.5"
            style={{ color: `${meta.color}99` }}
          >
            {sectionType === "bills"
              ? "Matched Transactions"
              : sectionType === "emails"
                ? "Matched Emails"
                : sectionType === "deadlines"
                  ? "Matched Deadlines"
                  : sectionType === "calendar"
                    ? "Matched Events"
                    : "Matched Insights"}
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
        <div
          className={cn(
            "p-2.5 px-3",
            hasPrimary && "border-t border-white/[0.04]",
          )}
        >
          <div className="text-[9px] tracking-[1.2px] uppercase text-muted-foreground/50 font-semibold mb-1.5">
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
      onKeyDown={
        isEmail
          ? (e) => {
              if (e.key === "Enter" || e.key === " ")
                onEmailClick(item.emailData);
            }
          : undefined
      }
      className={cn(
        "flex gap-1.5 items-start py-1 px-1 text-[11px] text-muted-foreground rounded transition-colors",
        isEmail && "cursor-pointer hover:bg-white/[0.04]",
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="leading-relaxed flex-1">{item.text}</span>
      {isEmail && (
        <span className="text-primary text-[10px] shrink-0 mt-px opacity-60">
          view →
        </span>
      )}
    </div>
  );
}

// --- Primary item renderers ---

function PrimaryItem({ item, sectionType, onEmailClick }) {
  const isClickableEmail =
    (sectionType === "emails" || sectionType === "bills") &&
    item.id &&
    item.accountName;
  const clickableClass = isClickableEmail
    ? "cursor-pointer px-1 rounded hover:bg-white/[0.04]"
    : "";

  if (sectionType === "bills" && item.extractedBill) {
    const bill = item.extractedBill;
    return (
      <div
        role={isClickableEmail ? "button" : undefined}
        tabIndex={isClickableEmail ? 0 : undefined}
        onClick={isClickableEmail ? () => onEmailClick(item) : undefined}
        onKeyDown={
          isClickableEmail
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onEmailClick(item);
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-2 py-1 text-[11px] transition-colors",
          clickableClass,
        )}
      >
        <span className="text-success font-semibold min-w-[60px] tabular-nums">
          ${bill.amount.toFixed(2)}
        </span>
        <span className="text-foreground/80">{bill.payee}</span>
        {bill.due_date && (
          <span className="text-muted-foreground/50">due {bill.due_date}</span>
        )}
        {bill.type && (
          <span
            className="text-[9px] font-medium px-1 py-px rounded"
            style={{ color: "#a6e3a199", background: "#a6e3a10d" }}
          >
            {bill.type}
          </span>
        )}
        {bill.category_name && (
          <span className="text-muted-foreground/40">
            [{bill.category_name}]
          </span>
        )}
        {isClickableEmail && (
          <span className="text-primary/50 text-[10px] ml-auto shrink-0">
            view →
          </span>
        )}
      </div>
    );
  }

  if (sectionType === "emails") {
    const urgColors = { high: "#f38ba8", medium: "#f9e2af", low: "#6c7086" };
    return (
      <div
        role={isClickableEmail ? "button" : undefined}
        tabIndex={isClickableEmail ? 0 : undefined}
        onClick={isClickableEmail ? () => onEmailClick(item) : undefined}
        onKeyDown={
          isClickableEmail
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onEmailClick(item);
              }
            : undefined
        }
        className={cn("py-1 text-[11px] transition-colors", clickableClass)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-foreground/90 font-medium">{item.from}</span>
          {item.urgency && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: urgColors[item.urgency] || "#6c7086" }}
            />
          )}
          {item.action && item.action !== "FYI" && (
            <span className="text-warning text-[10px]">{item.action}</span>
          )}
          {isClickableEmail && (
            <span className="text-primary/50 text-[10px] ml-auto shrink-0">
              view →
            </span>
          )}
        </div>
        <div className="text-muted-foreground mt-px">{item.subject}</div>
      </div>
    );
  }

  if (sectionType === "deadlines") {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="text-foreground/90 font-medium">{item.title}</span>
        {item.due_date && (
          <span className="text-muted-foreground/50">due {item.due_date}</span>
        )}
        {item.class_name && (
          <span style={{ color: "#fab387" }}>{item.class_name}</span>
        )}
        {item.points_possible > 0 && (
          <span className="text-muted-foreground/40 tabular-nums">
            {item.points_possible}pts
          </span>
        )}
      </div>
    );
  }

  if (sectionType === "calendar") {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="text-foreground/70 tabular-nums">{item.time}</span>
        <span className="text-foreground/80 font-medium">{item.title}</span>
        {item.duration && (
          <span className="text-muted-foreground/40">{item.duration}</span>
        )}
        {item.flag && (
          <span className="text-warning text-[10px]">[{item.flag}]</span>
        )}
      </div>
    );
  }

  // Insights
  if (item.text) {
    return (
      <div className="flex gap-1.5 items-start py-1 text-[11px] text-foreground/75">
        <span className="shrink-0">{item.icon}</span>
        <span className="leading-relaxed">{item.text}</span>
      </div>
    );
  }

  return null;
}
