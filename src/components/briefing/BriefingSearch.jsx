import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import useIsMobile from "../../hooks/useIsMobile";
import useSearch from "../../hooks/briefing/useSearch";
import useEmailNavigation from "../../hooks/briefing/useEmailNavigation";
import useSearchAnalysis from "../../hooks/briefing/useSearchAnalysis";
import BottomSheet from "../ui/BottomSheet";
import EmailReader from "../email/EmailReader";
import SearchModeToggle from "./search/SearchModeToggle";
import SearchFilterBar from "./search/SearchFilterBar";
import EmptyState from "./search/EmptyState";
import EmailResultsList from "./search/EmailResultsList";
import BriefingResultsList from "./search/BriefingResultsList";
import { AnalysisResult, AnalyzeButton } from "./search/AnalysisPanel";
import {
  SearchIcon,
  SearchEmptyIcon,
  CloseIcon,
  MailIcon,
  BackArrowIcon,
} from "./search/Icons";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

// --- Component ---

export default function BriefingSearch({ onNavigateToEmail }) {
  const isMobile = useIsMobile();
  const search = useSearch();
  const emailNav = useEmailNavigation({ setEmailResults: search.setEmailResults });
  // Destructure stable refs so effect deps can track them individually.
  const { openEmail, setOpenEmail } = emailNav;
  const {
    query,
    results,
    emailResults,
    searching,
    error,
    searchMode,
    emailFilter,
    focusedIdx,
    setFocusedIdx,
    relevant,
    grouped,
    sortedDates,
    rawEmailHasResults,
    totalUnread,
    filteredEmailResults,
    emailHasResults,
  } = search;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const closeSearch = useCallback(() => setOpen(false), []);
  const analysisState = useSearchAnalysis({
    query,
    results,
    onNavigateToEmail,
    onCloseSearch: closeSearch,
  });
  const {
    analysis,
    analyzing,
    expandedId,
    expandedCtx,
    loadingCtx,
    setExpandedId,
    setExpandedCtx,
    handleExpand,
    handleEmailClick,
    handleAnalyze,
    clearAnalysis,
  } = analysisState;
  const inputRef = useRef(null);
  const inputWrapRef = useRef(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);

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
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
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
  }, [open, expandedId, openEmail, setOpenEmail, setExpandedId, setExpandedCtx]);

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
  }, [open, isMobile, setOpenEmail]);

  // Mobile: when an email is opened from the results list, also dismiss the
  // keyboard. Tapping a list item on iOS doesn't blur the focused input on
  // its own, so the reader would otherwise mount behind the keyboard.
  useEffect(() => {
    if (isMobile && openEmail) inputRef.current?.blur();
  }, [isMobile, openEmail]);

  // Reset bill form when the open email changes.
  const [prevOpenUid, setPrevOpenUid] = useState(openEmail?.uid);
  if (prevOpenUid !== openEmail?.uid) {
    setPrevOpenUid(openEmail?.uid);
    setShowBillForm(false);
  }

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

  function handleKeyDown(e) {
    if (!open) return;
    // Don't let the search input consume Enter while the bill form is active —
    // the user is filling in form fields and Enter should stay in that context.
    if (showBillForm && e.key === "Enter") return;
    // Mobile: Enter submits the current query and dismisses the keyboard.
    // Live search is disabled on mobile (see input onChange), so Enter is
    // the only trigger. Runs before the arrow-key nav branch so it fires
    // even when the results list is empty (first search of the session).
    if (isMobile && e.key === "Enter") {
      e.preventDefault();
      if (query.trim()) search.doSearch(query, searchMode);
      inputRef.current?.blur();
      return;
    }
    const inEmailMode = isEmailQuery;
    const list = inEmailMode ? flatEmails : relevant;
    if (!list.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusedIdx + 1, list.length - 1);
      setFocusedIdx(next);
      if (inEmailMode && emailNav.openEmail && next >= 0) {
        const r = list[next];
        emailNav.handleOpenEmail(r, r._acct);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(focusedIdx - 1, -1);
      setFocusedIdx(next);
      if (inEmailMode && emailNav.openEmail && next >= 0) {
        const r = list[next];
        emailNav.handleOpenEmail(r, r._acct);
      }
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      if (inEmailMode) {
        const r = list[focusedIdx];
        emailNav.handleOpenEmail(r, r._acct);
      } else {
        handleExpand(list[focusedIdx]);
      }
    }
  }

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
          <SearchIcon
            size={14}
            className={cn(
              "shrink-0 transition-colors duration-200",
              searching
                ? "text-primary animate-pulse"
                : open
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50",
            )}
          />
          <SearchModeToggle
            mode={searchMode}
            onChange={(next) => {
              clearAnalysis();
              emailNav.setOpenEmail(null);
              search.handleModeChange(next);
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setOpen(true);
              clearAnalysis();
              const val = e.target.value;
              if (isMobile) {
                // Mobile: no live search — just track the query locally and
                // wait for Enter. Clear any stale results when the box is
                // emptied so the old "no results" state doesn't linger.
                search.setQuery(val);
                if (!val.trim()) {
                  search.setResults(null);
                  search.setEmailResults(null);
                }
              } else {
                search.handleInputChange(val);
              }
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            // Let the mobile keyboard show a "Search" submit button and
            // convert Enter into a form-submit style action.
            enterKeyHint="search"
            placeholder={
              searchMode === "emails"
                ? "Search emails..."
                : "Search briefings..."
            }
            className="flex-1 bg-transparent border-none outline-none text-foreground text-[13px] max-sm:text-[16px] font-[inherit] placeholder:text-muted-foreground/40"
          />
          {!query && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <kbd className="text-[10px] text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-1 font-mono leading-none min-w-[20px] text-center">
                {isMac ? "\u2318" : "Ctrl"}
              </kbd>
              <kbd className="text-[10px] text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-1 font-mono leading-none min-w-[20px] text-center">
                F
              </kbd>
            </div>
          )}
          {query && (
            <button
              onClick={() => {
                search.resetQuery();
                clearAnalysis();
                setOpen(false);
                emailNav.setOpenEmail(null);
              }}
              className="bg-transparent border-none text-muted-foreground/40 cursor-pointer p-0.5 rounded transition-colors hover:text-muted-foreground hover:bg-white/[0.06]"
              aria-label="Clear search"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {showDropdown &&
        (() => {
          const dropdownContent = (
            <>
              {/* Email filter chip row — only in email mode with raw results */}
              {isEmailQuery && rawEmailHasResults && (
                <SearchFilterBar
                  emailFilter={emailFilter}
                  totalUnread={totalUnread}
                  onFilterChange={search.handleEmailFilterChange}
                />
              )}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overscroll-contain min-h-0"
                // Mobile: dismiss the keyboard as soon as the user touches the
                // results area. Matches iOS Safari's native behavior — without
                // this, live search fills the screen behind the keyboard and the
                // user has to manually dismiss it to read results.
                onTouchStart={
                  isMobile ? () => inputRef.current?.blur() : undefined
                }
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
                      {isEmailQuery
                        ? "Searching emails..."
                        : "Searching briefings..."}
                    </div>
                  </div>
                )}

                {/* Empty state — briefing search */}
                {!isEmailQuery &&
                  !hasResults &&
                  results !== null &&
                  !searching && (
                    <EmptyState
                      icon={<SearchEmptyIcon size={20} strokeWidth={1.5} />}
                      message={<>No results for &ldquo;{query}&rdquo;</>}
                    />
                  )}

                {/* Empty state — email search */}
                {isEmailQuery &&
                  !emailHasResults &&
                  emailResults !== null &&
                  !searching && (
                    <EmptyState
                      icon={<MailIcon size={20} strokeWidth={1.5} />}
                      message={
                        emailFilter === "unread" && rawEmailHasResults
                          ? `No unread emails matching "${query}"`
                          : `No emails matching "${query}"`
                      }
                    />
                  )}

                {/* Email search results */}
                {isEmailQuery && emailHasResults && (
                  <EmailResultsList
                    accounts={filteredEmailResults.accounts}
                    flatEmails={flatEmails}
                    focusedIdx={focusedIdx}
                    openEmailUid={emailNav.openEmail?.uid}
                    onFocusChange={setFocusedIdx}
                    onOpenEmail={emailNav.handleOpenEmail}
                  />
                )}

                {/* Results grouped by date */}
                <BriefingResultsList
                  relevant={relevant}
                  grouped={grouped}
                  sortedDates={sortedDates}
                  focusedIdx={focusedIdx}
                  expandedId={expandedId}
                  expandedCtx={expandedCtx}
                  loadingCtx={loadingCtx}
                  onExpand={handleExpand}
                  onFocusChange={setFocusedIdx}
                  onEmailClick={handleEmailClick}
                />

                {/* AI Analysis result */}
                <AnalysisResult analysis={analysis} />
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
                    <AnalyzeButton
                      analyzing={analyzing}
                      onClick={handleAnalyze}
                    />
                  )}
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                    {isEmailQuery
                      ? `${flatEmails.length} result${flatEmails.length !== 1 ? "s" : ""}`
                      : `${relevant.length} result${relevant.length !== 1 ? "s" : ""}`}
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
                  if (emailNav.openEmail) {
                    emailNav.setOpenEmail(null);
                    return;
                  }
                  setOpen(false);
                  inputRef.current?.blur();
                }}
                title={emailNav.openEmail ? undefined : "Search Results"}
                // When reading an email, force a definite sheet height so
                // EmailReader's flex-1 / iframe h-full chain resolves. Without
                // it the iframe collapses to its ~150px intrinsic default.
                {...(emailNav.openEmail ? { height: "92vh" } : {})}
              >
                {emailNav.openEmail ? (
                  <div className="flex flex-col h-full min-h-0">
                    <button
                      onClick={() => emailNav.setOpenEmail(null)}
                      className="flex items-center gap-2 px-4 py-3 text-[12px] text-foreground/70 hover:text-foreground shrink-0 min-h-[44px]"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <BackArrowIcon size={14} />
                      Back to search
                    </button>
                    <EmailReader
                      email={emailNav.openEmail}
                      onMarkedRead={emailNav.handleMarkedRead}
                      onMarkedUnread={emailNav.handleMarkedUnread}
                      showManualBillForm={showBillForm}
                      headerActions={
                        <button
                          type="button"
                          onClick={() => setShowBillForm((v) => !v)}
                          className={cn(
                            "flex items-center gap-1 text-[10px] transition-colors px-2 py-1 cursor-pointer font-[inherit]",
                            showBillForm
                              ? "text-[#a6e3a1] bg-[#a6e3a1]/[0.08] hover:bg-[#a6e3a1]/[0.12]"
                              : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]",
                          )}
                          style={{ borderRadius: 8 }}
                          aria-label={showBillForm ? "Hide bill form" : "Add bill"}
                          title={showBillForm ? "Hide bill form" : "Add bill"}
                        >
                          <DollarSign size={11} />
                          <span className="hidden md:inline">{showBillForm ? "Hide bill" : "Add bill"}</span>
                        </button>
                      }
                    />
                  </div>
                ) : (
                  dropdownContent
                )}
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
          const resultsWidth = emailNav.openEmail
            ? Math.min(baseWidth, RESULTS_COLLAPSED_WIDTH)
            : baseWidth;
          // Panel must always be at least as wide as the search input so the
          // dropdown stays visually anchored. If the desired expansion is
          // narrower (wide-screen edge case), snap to baseWidth and let the
          // flex-1 email pane absorb the extra room.
          const expandedWidth = emailNav.openEmail
            ? Math.min(
                Math.max(baseWidth, resultsWidth + EMAIL_PANE_WIDTH),
                window.innerWidth - VIEWPORT_MARGIN * 2,
              )
            : baseWidth;
          const maxLeft = window.innerWidth - expandedWidth - VIEWPORT_MARGIN;
          const finalLeft = Math.max(
            VIEWPORT_MARGIN,
            Math.min(pos.left, maxLeft),
          );
          const expandedHeight = emailNav.openEmail
            ? `calc(100vh - ${pos.top + VIEWPORT_MARGIN}px)`
            : undefined;
          const expandedMaxHeight = emailNav.openEmail
            ? undefined
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
                height: expandedHeight,
                maxHeight: expandedMaxHeight,
                background: "linear-gradient(180deg, #24243a 0%, #1e1e2e 100%)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 8px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
                transition:
                  "width 200ms ease, left 200ms ease, height 200ms ease, max-height 200ms ease",
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
              {emailNav.openEmail && (
                <div
                  className="relative flex flex-col min-h-0 flex-1 animate-in fade-in duration-150"
                  style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <EmailReader
                    email={emailNav.openEmail}
                    onMarkedRead={emailNav.handleMarkedRead}
                    onMarkedUnread={emailNav.handleMarkedUnread}
                    onClose={() => emailNav.setOpenEmail(null)}
                    showManualBillForm={showBillForm}
                    headerActions={
                      <button
                        type="button"
                        onClick={() => setShowBillForm((v) => !v)}
                        className={cn(
                          "flex items-center gap-1 text-[10px] transition-colors px-2 py-1 cursor-pointer font-[inherit]",
                          showBillForm
                            ? "text-[#a6e3a1] bg-[#a6e3a1]/[0.08] hover:bg-[#a6e3a1]/[0.12]"
                            : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]",
                        )}
                        style={{ borderRadius: 8 }}
                        aria-label={showBillForm ? "Hide bill form" : "Add bill"}
                        title={showBillForm ? "Hide bill form" : "Add bill"}
                      >
                        <DollarSign size={11} />
                        <span className="hidden md:inline">{showBillForm ? "Hide bill" : "Add bill"}</span>
                      </button>
                    }
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


