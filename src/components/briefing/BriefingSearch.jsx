import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import useIsMobile from "../../hooks/useIsMobile";
import useSearch from "../../hooks/briefing/useSearch";
import useEmailNavigation from "../../hooks/briefing/useEmailNavigation";
import useSearchAnalysis from "../../hooks/briefing/useSearchAnalysis";
import useBriefingSearchPanel from "./useBriefingSearchPanel";
import SearchModeToggle from "./search/SearchModeToggle";
import {
  CloseIcon,
  SearchIcon,
} from "./search/Icons";
import BriefingSearchResults, {
  BriefingSearchMobileSheet,
} from "./search/BriefingSearchResults";
import BriefingSearchDesktopPanel from "./search/BriefingSearchDesktopPanel";

const isMac =
  typeof navigator !== "undefined"
  && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

export default function BriefingSearch({ onNavigateToEmail }) {
  const isMobile = useIsMobile();
  const search = useSearch();
  const emailNav = useEmailNavigation({ setEmailResults: search.setEmailResults });
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

  const {
    open,
    setOpen: setPanelOpen,
    pos,
    showBillForm,
    setShowBillForm,
    inputRef,
    inputWrapRef,
    panelRef,
    scrollRef,
  } = useBriefingSearchPanel({
    isMobile,
    openEmail,
    setOpenEmail,
  });

  const closeSearch = useCallback(() => setPanelOpen(false), [setPanelOpen]);
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

  useEffect(() => {
    function handleKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        inputRef.current?.focus();
        setPanelOpen(true);
      }
      if (event.key === "Escape" && open) {
        if (openEmail) {
          setOpenEmail(null);
        } else if (expandedId) {
          setExpandedId(null);
          setExpandedCtx(null);
        } else {
          setPanelOpen(false);
          inputRef.current?.blur();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expandedId, inputRef, open, openEmail, setExpandedCtx, setExpandedId, setOpenEmail, setPanelOpen]);

  const isEmailQuery = searchMode === "emails";
  const flatEmails = emailHasResults
    ? filteredEmailResults.accounts.flatMap((account) =>
      account.results.map((result) => ({ ...result, _acct: account })))
    : [];
  const hasResults = relevant.length > 0 || emailHasResults;
  const showDropdown = open && (results !== null || emailResults !== null || searching || error);

  function handleKeyDown(event) {
    if (!open) return;
    if (showBillForm && event.key === "Enter") return;
    if (isMobile && event.key === "Enter") {
      event.preventDefault();
      if (query.trim()) search.doSearch(query, searchMode);
      inputRef.current?.blur();
      return;
    }

    const list = isEmailQuery ? flatEmails : relevant;
    if (!list.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(focusedIdx + 1, list.length - 1);
      setFocusedIdx(next);
      if (isEmailQuery && emailNav.openEmail && next >= 0) {
        const result = list[next];
        emailNav.handleOpenEmail(result, result._acct);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(focusedIdx - 1, -1);
      setFocusedIdx(next);
      if (isEmailQuery && emailNav.openEmail && next >= 0) {
        const result = list[next];
        emailNav.handleOpenEmail(result, result._acct);
      }
    } else if (event.key === "Enter" && focusedIdx >= 0) {
      if (isEmailQuery) {
        const result = list[focusedIdx];
        emailNav.handleOpenEmail(result, result._acct);
      } else {
        handleExpand(list[focusedIdx]);
      }
    }
  }

  const dropdownContent = (
    <BriefingSearchResults
      isMobile={isMobile}
      inputRef={inputRef}
      scrollRef={scrollRef}
      isEmailQuery={isEmailQuery}
      rawEmailHasResults={rawEmailHasResults}
      emailFilter={emailFilter}
      totalUnread={totalUnread}
      onFilterChange={search.handleEmailFilterChange}
      error={error}
      searching={searching}
      results={results}
      emailResults={emailResults}
      hasResults={hasResults}
      query={query}
      emailHasResults={emailHasResults}
      filteredEmailResults={filteredEmailResults}
      flatEmails={flatEmails}
      focusedIdx={focusedIdx}
      openEmailUid={emailNav.openEmail?.uid}
      relevant={relevant}
      grouped={grouped}
      sortedDates={sortedDates}
      expandedId={expandedId}
      expandedCtx={expandedCtx}
      loadingCtx={loadingCtx}
      analysis={analysis}
      analyzing={analyzing}
      onAnalyze={handleAnalyze}
      onFocusChange={setFocusedIdx}
      onOpenEmail={emailNav.handleOpenEmail}
      onExpand={handleExpand}
      onEmailClick={handleEmailClick}
    />
  );

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
            onChange={(event) => {
              setPanelOpen(true);
              clearAnalysis();
              const value = event.target.value;
              if (isMobile) {
                search.setQuery(value);
                if (!value.trim()) {
                  search.setResults(null);
                  search.setEmailResults(null);
                }
              } else {
                search.handleInputChange(value);
              }
            }}
            onFocus={() => setPanelOpen(true)}
            onKeyDown={handleKeyDown}
            enterKeyHint="search"
            placeholder={searchMode === "emails" ? "Search emails..." : "Search briefings..."}
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
                setPanelOpen(false);
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

      {showDropdown && (
        isMobile ? (
          <BriefingSearchMobileSheet
            openEmail={emailNav.openEmail}
            setOpen={setPanelOpen}
            setOpenEmail={emailNav.setOpenEmail}
            inputRef={inputRef}
            showBillForm={showBillForm}
            setShowBillForm={setShowBillForm}
            onMarkedRead={emailNav.handleMarkedRead}
            onMarkedUnread={emailNav.handleMarkedUnread}
          >
            {dropdownContent}
          </BriefingSearchMobileSheet>
        ) : (
          <BriefingSearchDesktopPanel
            panelRef={panelRef}
            pos={pos}
            openEmail={emailNav.openEmail}
            setOpenEmail={emailNav.setOpenEmail}
            showBillForm={showBillForm}
            setShowBillForm={setShowBillForm}
            onMarkedRead={emailNav.handleMarkedRead}
            onMarkedUnread={emailNav.handleMarkedUnread}
          >
            {dropdownContent}
          </BriefingSearchDesktopPanel>
        )
      )}
    </>
  );
}
