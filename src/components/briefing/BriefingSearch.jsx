import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { searchBriefings, analyzeSearchResults, getBriefingById, searchEmails } from "../../api";
import { transformBriefing } from "../../transform";
import { cn } from "@/lib/utils";
import useIsMobile from "../../hooks/useIsMobile";
import BottomSheet from "../ui/BottomSheet";
import EmailSearchBody from "../email/EmailSearchBody";
import { SECTION_META, DEBOUNCE_MS, MIN_RELEVANCE } from "./search/constants";
import extractRelatedContext from "./search/extractRelatedContext";
import { formatBriefingDate } from "./search/formatDate";
import SearchModeToggle from "./search/SearchModeToggle";
import FilterChip from "./search/FilterChip";
import EmailResultCard from "./search/EmailResultCard";

// --- Component ---

export default function BriefingSearch({ onNavigateToEmail }) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [emailResults, setEmailResults] = useState(null);
  const [emailFilter, setEmailFilter] = useState("all"); // 'all' | 'unread'
  const [searchMode, setSearchMode] = useState("emails"); // 'emails' | 'briefings'
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [pos, setPos] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedCtx, setExpandedCtx] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(null);
  const [openEmail, setOpenEmail] = useState(null);
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
    window.addEventListener("resize", updatePos);
    return () => window.removeEventListener("resize", updatePos);
  }, [open, updatePos]);

  // Lock body scroll while panel is open so the panel can't chase the input.
  // Skip on mobile — BottomSheet handles its own scroll containment.
  useEffect(() => {
    if (!open || isMobile) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, isMobile]);

  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        if (openEmail) { setOpenEmail(null); }
        else if (expandedId) { setExpandedId(null); setExpandedCtx(null); }
        else { setOpen(false); inputRef.current?.blur(); }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, expandedId, openEmail]);

  useEffect(() => {
    // On mobile the panel renders inside BottomSheet, which handles its own
    // backdrop-click and drag-to-dismiss. panelRef is never attached in that
    // path, so a global pointerdown listener would close the sheet as soon as
    // the user touches it to scroll.
    if (isMobile) return;
    function handleClick(e) {
      if (inputWrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
      setOpenEmail(null);
    }
    if (open) document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open, isMobile]);

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

  const isEmailQuery = searchMode === "emails";

  const doSearch = useCallback(async (q, mode) => {
    const term = q.trim();
    if (!term) { setResults(null); setEmailResults(null); setAnalysis(null); return; }
    setSearching(true);
    setError(null);
    setAnalysis(null);
    setExpandedId(null);
    setExpandedCtx(null);

    if (mode === "emails") {
      setResults(null);
      if (term.length < 2) { setEmailResults(null); setSearching(false); return; }
      try {
        const data = await searchEmails(term);
        setEmailResults(data);
        setFocusedIdx(-1);
      } catch (err) {
        setError(err.message);
        setEmailResults(null);
      } finally {
        setSearching(false);
      }
    } else {
      setEmailResults(null);
      try {
        const data = await searchBriefings(term);
        setResults(data.results || []);
        setFocusedIdx(-1);
      } catch (err) {
        setError(err.message);
        setResults(null);
      } finally {
        setSearching(false);
      }
    }
  }, []);

  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, searchMode), DEBOUNCE_MS);
  }

  function handleModeChange(next) {
    if (next === searchMode) return;
    setSearchMode(next);
    setFocusedIdx(-1);
    setEmailFilter("all");
    setOpenEmail(null);
    // Re-run the current query in the new mode immediately (no debounce —
    // the user explicitly switched, so a snappy response feels right).
    clearTimeout(debounceRef.current);
    if (query.trim()) {
      doSearch(query, next);
    } else {
      // Clear stale results from the other mode so the dropdown isn't lying.
      setResults(null);
      setEmailResults(null);
    }
  }

  function handleEmailFilterChange(next) {
    if (next === emailFilter) return;
    setEmailFilter(next);
    setFocusedIdx(-1);
  }

  function handleOpenEmail(email, acct) {
    setOpenEmail({
      ...email,
      account_id: acct.account_id,
      account_label: acct.account_label,
      account_email: acct.account_email,
      account_color: acct.account_color,
      account_icon: acct.account_icon,
    });
  }

  function handleEmailMarkedRead(uid) {
    setEmailResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        accounts: prev.accounts.map((a) => ({
          ...a,
          results: a.results.map((r) => (r.uid === uid ? { ...r, read: true } : r)),
        })),
      };
    });
  }

  function handleEmailMarkedUnread(uid) {
    setEmailResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        accounts: prev.accounts.map((a) => ({
          ...a,
          results: a.results.map((r) => (r.uid === uid ? { ...r, read: false } : r)),
        })),
      };
    });
  }

  function handleKeyDown(e) {
    if (!open) return;
    const inEmailMode = isEmailQuery;
    const list = inEmailMode ? flatEmails : relevant;
    if (!list.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusedIdx + 1, list.length - 1);
      setFocusedIdx(next);
      if (inEmailMode && openEmail && next >= 0) {
        const r = list[next];
        handleOpenEmail(r, r._acct);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(focusedIdx - 1, -1);
      setFocusedIdx(next);
      if (inEmailMode && openEmail && next >= 0) {
        const r = list[next];
        handleOpenEmail(r, r._acct);
      }
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      if (inEmailMode) {
        const r = list[focusedIdx];
        handleOpenEmail(r, r._acct);
      } else {
        handleExpand(list[focusedIdx]);
      }
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

  const rawEmailHasResults = emailResults?.accounts?.length > 0;
  const totalUnread = rawEmailHasResults
    ? emailResults.accounts.reduce(
        (n, a) => n + a.results.filter((r) => !r.read).length,
        0,
      )
    : 0;
  // Apply the active filter to email results, dropping accounts that end up
  // with zero matching messages so the renderer doesn't show empty headers.
  const filteredEmailResults =
    rawEmailHasResults && emailFilter === "unread"
      ? {
          ...emailResults,
          accounts: emailResults.accounts
            .map((a) => ({ ...a, results: a.results.filter((r) => !r.read) }))
            .filter((a) => a.results.length > 0),
        }
      : emailResults;
  const emailHasResults = filteredEmailResults?.accounts?.length > 0;
  const showDropdown = open && (results !== null || emailResults !== null || searching || error);
  const hasResults = relevant.length > 0 || emailHasResults;
  // Flat list of email results in render order, with their owning account
  // attached, so keyboard nav and active-state lookups work uniformly.
  const flatEmails = emailHasResults
    ? filteredEmailResults.accounts.flatMap((a) =>
        a.results.map((r) => ({ ...r, _acct: a })),
      )
    : [];

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
          <SearchModeToggle mode={searchMode} onChange={handleModeChange} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={searchMode === "emails" ? "Search emails..." : "Search briefings..."}
            className="flex-1 bg-transparent border-none outline-none text-foreground text-[13px] max-sm:text-[16px] font-[inherit] placeholder:text-muted-foreground/40"
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
                setEmailResults(null);
                setAnalysis(null);
                setOpen(false);
                setExpandedId(null);
                setOpenEmail(null);
                setEmailFilter("all");
                setFocusedIdx(-1);
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

      {showDropdown && (() => {
        const dropdownContent = (
          <>
          {/* Email filter chip row — only in email mode with raw results */}
          {isEmailQuery && rawEmailHasResults && (
            <div
              className="shrink-0 flex items-center gap-1 px-3 py-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <FilterChip
                label="All"
                active={emailFilter === "all"}
                onClick={() => handleEmailFilterChange("all")}
              />
              <FilterChip
                label="Unread"
                count={totalUnread}
                active={emailFilter === "unread"}
                onClick={() => handleEmailFilterChange("unread")}
              />
            </div>
          )}
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
              {searching && !results && !emailResults && (
                <div className="py-10 px-5 text-center">
                  <div className="w-4 h-4 border-2 border-white/[0.06] border-t-primary rounded-full animate-spin mx-auto mb-3" />
                  <div className="text-[11px] text-muted-foreground">
                    {isEmailQuery ? "Searching emails..." : "Searching briefings..."}
                  </div>
                </div>
              )}

              {/* Empty state — briefing search */}
              {!isEmailQuery && !hasResults && results !== null && !searching && (
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

              {/* Empty state — email search */}
              {isEmailQuery && !emailHasResults && emailResults !== null && !searching && (
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
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <div className="text-[11px] text-muted-foreground/60">
                    {emailFilter === "unread" && rawEmailHasResults
                      ? `No unread emails matching "${query}"`
                      : `No emails matching "${query}"`}
                  </div>
                </div>
              )}

              {/* Email search results */}
              {isEmailQuery && emailHasResults && filteredEmailResults.accounts.map((acct) => {
                const acctUnread = acct.results.filter((r) => !r.read).length;
                return (
                <div key={acct.account_id}>
                  <div
                    className="sticky top-0 z-[5] flex items-center gap-2 px-5 py-1.5"
                    style={{
                      background: "rgba(28,28,42, 0.92)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <span className="text-[12px] shrink-0">{acct.account_icon}</span>
                    <span className="text-[10px] font-semibold tracking-[1.5px] uppercase text-foreground/75 truncate">
                      {acct.account_label}
                    </span>
                    <div className="ml-auto flex items-center gap-2.5 shrink-0">
                      {acctUnread > 0 && (
                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: "#cba6da" }}>
                          {acctUnread} unread
                        </span>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground/45">
                        {acct.results.length}
                      </span>
                    </div>
                  </div>
                  {acct.results.map((r) => {
                    const flatIdx = flatEmails.findIndex((f) => f.uid === r.uid);
                    return (
                      <EmailResultCard
                        key={r.uid}
                        r={r}
                        acctColor={acct.account_color}
                        isActive={openEmail?.uid === r.uid}
                        isFocused={flatIdx === focusedIdx}
                        onMouseEnter={() => setFocusedIdx(flatIdx)}
                        onOpen={() => handleOpenEmail(r, acct)}
                      />
                    );
                  })}
                </div>
                );
              })}

              {/* Results grouped by date */}
              {sortedDates.map((date, di) => (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 px-5 pt-3.5 pb-1.5">
                    <span className="text-[10px] tracking-[1.5px] uppercase text-muted-foreground/60 font-semibold whitespace-nowrap">
                      {formatBriefingDate(date)}
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
                          style={{ padding: "12px 16px" }}
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
                {isEmailQuery ? (
                  <span className="text-[10px] text-muted-foreground/40 italic">
                    Sorted by relevance + recency
                  </span>
                ) : (
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
                )}
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                  {isEmailQuery
                    ? `${flatEmails.length} result${flatEmails.length !== 1 ? "s" : ""}`
                    : `${relevant.length} result${relevant.length !== 1 ? "s" : ""}`
                  }
                </span>
              </div>
            )}
          </>
        );

        if (isMobile) {
          return (
            <BottomSheet
              open
              onClose={() => {
                if (openEmail) { setOpenEmail(null); return; }
                setOpen(false);
                inputRef.current?.blur();
              }}
              title={openEmail ? undefined : "Search Results"}
            >
              {openEmail ? (
                <div className="flex flex-col h-full min-h-0">
                  <button
                    onClick={() => setOpenEmail(null)}
                    className="flex items-center gap-2 px-4 py-3 text-[12px] text-foreground/70 hover:text-foreground shrink-0 min-h-[44px]"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to search
                  </button>
                  <EmailSearchBody email={openEmail} onMarkedRead={handleEmailMarkedRead} onMarkedUnread={handleEmailMarkedUnread} />
                </div>
              ) : dropdownContent}
            </BottomSheet>
          );
        }

        if (!pos) return null;

        // Master-detail expansion: when an email is open, the results column
        // shrinks to a compact fixed width and the email reader gets the rest.
        // The panel recenters horizontally if it would clip the viewport edge.
        const RESULTS_COLLAPSED_WIDTH = 380; // compact list width when expanded
        const EMAIL_PANE_WIDTH = 720; // reader pane width contribution
        const VIEWPORT_MARGIN = 16;
        const baseWidth = pos.width;
        const resultsWidth = openEmail
          ? Math.min(baseWidth, RESULTS_COLLAPSED_WIDTH)
          : baseWidth;
        // Panel must always be at least as wide as the search input so the
        // dropdown stays visually anchored. If the desired expansion is
        // narrower (wide-screen edge case), snap to baseWidth and let the
        // flex-1 email pane absorb the extra room.
        const expandedWidth = openEmail
          ? Math.min(
              Math.max(baseWidth, resultsWidth + EMAIL_PANE_WIDTH),
              window.innerWidth - VIEWPORT_MARGIN * 2,
            )
          : baseWidth;
        const maxLeft = window.innerWidth - expandedWidth - VIEWPORT_MARGIN;
        const finalLeft = Math.max(VIEWPORT_MARGIN, Math.min(pos.left, maxLeft));
        const expandedMaxHeight = openEmail
          ? `calc(100vh - ${pos.top + VIEWPORT_MARGIN}px)`
          : `min(480px, calc(100vh - ${pos.top + VIEWPORT_MARGIN}px))`;

        return createPortal(
          <div
            ref={panelRef}
            className="z-[9999] isolate flex flex-row animate-in fade-in slide-in-from-top-1 duration-200"
            style={{
              position: "fixed",
              top: pos.top,
              left: finalLeft,
              width: expandedWidth,
              maxHeight: expandedMaxHeight,
              background: "linear-gradient(180deg, #24243a 0%, #1e1e2e 100%)",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
              transition: "width 200ms ease, left 200ms ease, max-height 200ms ease",
              overflow: "hidden",
            }}
          >
            {/* Results column */}
            <div
              className="flex flex-col min-h-0 shrink-0"
              style={{
                width: resultsWidth,
                transition: "width 200ms ease",
              }}
            >
              {dropdownContent}
            </div>

            {/* Email reader pane */}
            {openEmail && (
              <div
                className="relative flex flex-col min-h-0 flex-1 animate-in fade-in duration-150"
                style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}
              >
                <EmailSearchBody
                  email={openEmail}
                  onMarkedRead={handleEmailMarkedRead}
                  onMarkedUnread={handleEmailMarkedUnread}
                  onClose={() => setOpenEmail(null)}
                />
              </div>
            )}
          </div>,
          document.body,
        );
      })()}
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
