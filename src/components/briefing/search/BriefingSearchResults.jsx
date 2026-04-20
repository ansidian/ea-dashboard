import { cn } from "@/lib/utils";
import useBrowserBackDismiss from "@/hooks/useBrowserBackDismiss";
import { DollarSign } from "lucide-react";
import BottomSheet from "../../ui/BottomSheet";
import EmailReader from "../../email/EmailReader";
import SearchFilterBar from "./SearchFilterBar";
import EmptyState from "./EmptyState";
import EmailResultsList from "./EmailResultsList";
import BriefingResultsList from "./BriefingResultsList";
import { AnalysisResult, AnalyzeButton } from "./AnalysisPanel";
import { BackArrowIcon, MailIcon, SearchEmptyIcon } from "./Icons";

function SearchResultsBody({
  isMobile,
  inputRef,
  scrollRef,
  isEmailQuery,
  rawEmailHasResults,
  emailFilter,
  totalUnread,
  onFilterChange,
  error,
  searching,
  results,
  emailResults,
  hasResults,
  query,
  emailHasResults,
  filteredEmailResults,
  flatEmails,
  focusedIdx,
  openEmailUid,
  relevant,
  grouped,
  sortedDates,
  expandedId,
  expandedCtx,
  loadingCtx,
  analysis,
  analyzing,
  onAnalyze,
  onFocusChange,
  onOpenEmail,
  onExpand,
  onEmailClick,
}) {
  return (
    <>
      {isEmailQuery && rawEmailHasResults && (
        <SearchFilterBar
          emailFilter={emailFilter}
          totalUnread={totalUnread}
          onFilterChange={onFilterChange}
        />
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain min-h-0"
        onTouchStart={isMobile ? () => inputRef.current?.blur() : undefined}
      >
        {error && (
          <div className="px-5 py-4 text-[11px] text-destructive text-center leading-relaxed">
            {error}
          </div>
        )}

        {searching && !results && !emailResults && (
          <div className="py-10 px-5 text-center">
            <div className="w-4 h-4 border-2 border-white/[0.06] border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <div className="text-[11px] text-muted-foreground">
              {isEmailQuery ? "Searching emails..." : "Searching briefings..."}
            </div>
          </div>
        )}

        {!isEmailQuery && !hasResults && results !== null && !searching && (
          <EmptyState
            icon={<SearchEmptyIcon size={20} strokeWidth={1.5} />}
            message={<>No results for &ldquo;{query}&rdquo;</>}
          />
        )}

        {isEmailQuery && !emailHasResults && emailResults !== null && !searching && (
          <EmptyState
            icon={<MailIcon size={20} strokeWidth={1.5} />}
            message={
              emailFilter === "unread" && rawEmailHasResults
                ? `No unread emails matching "${query}"`
                : `No emails matching "${query}"`
            }
          />
        )}

        {isEmailQuery && emailHasResults && (
          <EmailResultsList
            accounts={filteredEmailResults.accounts}
            flatEmails={flatEmails}
            focusedIdx={focusedIdx}
            openEmailUid={openEmailUid}
            onFocusChange={onFocusChange}
            onOpenEmail={onOpenEmail}
          />
        )}

        <BriefingResultsList
          relevant={relevant}
          grouped={grouped}
          sortedDates={sortedDates}
          focusedIdx={focusedIdx}
          expandedId={expandedId}
          expandedCtx={expandedCtx}
          loadingCtx={loadingCtx}
          onExpand={onExpand}
          onFocusChange={onFocusChange}
          onEmailClick={onEmailClick}
        />

        <AnalysisResult analysis={analysis} />
      </div>

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
            <AnalyzeButton analyzing={analyzing} onClick={onAnalyze} />
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
}

export function BriefingSearchMobileSheet({
  openEmail,
  setOpen,
  setOpenEmail,
  inputRef,
  showBillForm,
  setShowBillForm,
  onMarkedRead,
  onMarkedUnread,
  children,
}) {
  const dismissSheet = useBrowserBackDismiss({
    enabled: true,
    historyKey: "eaBriefingSearchSheet",
    onDismiss: () => {
      setOpenEmail(null);
      setOpen(false);
      inputRef.current?.blur();
    },
  });
  const dismissOpenEmail = useBrowserBackDismiss({
    enabled: !!openEmail,
    historyKey: "eaBriefingSearchEmail",
    onDismiss: () => setOpenEmail(null),
  });

  return (
    <BottomSheet
      open
      onClose={openEmail ? dismissOpenEmail : dismissSheet}
      title={openEmail ? undefined : "Search Results"}
      {...(openEmail ? { height: "92vh" } : {})}
    >
      {openEmail ? (
        <div className="flex flex-col h-full min-h-0">
          <button
            onClick={dismissOpenEmail}
            className="flex items-center gap-2 px-4 py-3 text-[12px] text-foreground/70 hover:text-foreground shrink-0 min-h-[44px]"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <BackArrowIcon size={14} />
            Back to search
          </button>
          <EmailReader
            email={openEmail}
            onMarkedRead={onMarkedRead}
            onMarkedUnread={onMarkedUnread}
            showManualBillForm={showBillForm}
            onClose={dismissOpenEmail}
            headerActions={
              <button
                type="button"
                onClick={() => setShowBillForm((value) => !value)}
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
        children
      )}
    </BottomSheet>
  );
}

export default function BriefingSearchResults(props) {
  return <SearchResultsBody {...props} />;
}
