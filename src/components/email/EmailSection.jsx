import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import { urgencyStyles } from "../../lib/dashboard-helpers";
import EmailBody from "./EmailBody";
import { useDashboard } from "../../context/DashboardContext";

export default function EmailSection({ summary, model, loaded, delay, style, className }) {
  const {
    emailAccounts, currentAccount,
    activeAccount, setActiveAccount,
    selectedEmail, setSelectedEmail,
    confirmDismissId, setConfirmDismissId, handleDismiss: onDismiss,
    setLoadingBillId, emailSectionRef,
  } = useDashboard();

  const emailRowRefs = useRef({});
  const getRowRef = useCallback((emailId) => {
    if (!emailRowRefs.current[emailId]) {
      emailRowRefs.current[emailId] = { current: null };
    }
    return emailRowRefs.current[emailId];
  }, []);

  return (
    <>
      <div ref={emailSectionRef} />
      <Section title="Email Overview" delay={delay} loaded={loaded} style={style} className={className}>
        <p className="text-sm text-text-secondary m-0 mb-4">
          {summary || "No email accounts connected."}
        </p>
        <div className="flex gap-1.5 mb-4 flex-wrap">
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
              className={cn(
                "rounded px-3.5 py-2.5 cursor-pointer flex items-center gap-2 transition-all duration-200 border",
                activeAccount === i
                  ? "bg-white/10 text-text-primary"
                  : "bg-white/[0.03] border-border text-text-secondary hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-text-body",
              )}
              style={activeAccount === i ? { borderColor: acc.color + "66" } : undefined}
            >
              <span className="text-[15px]">{acc.icon}</span>
              <span className="text-xs font-medium">
                {acc.name}
              </span>
              <span
                className="text-[10px] font-bold px-[7px] py-0.5 rounded-full"
                style={{
                  background: acc.color + "22",
                  color: acc.color,
                }}
              >
                {acc.unread}
              </span>
            </button>
          ))}
        </div>
        {(() => {
          const carriedOver = currentAccount.important.filter(e => (e.seenCount || 1) >= 2);
          if (!carriedOver.length) return null;
          return (
            <div className="mb-2">
              <button
                onClick={() => carriedOver.forEach(e => onDismiss(e.id))}
                className="text-[11px] font-medium text-text-muted bg-white/[0.03] border border-border rounded px-3 py-1.5 cursor-pointer transition-all duration-150 font-[inherit] hover:bg-white/[0.06] hover:border-white/10 hover:text-text-secondary"
              >
                Dismiss {carriedOver.length} carried-over
              </button>
            </div>
          );
        })()}
        <div className="flex flex-col gap-1.5">
          {currentAccount.important.map((email, i) => {
            const s = urgencyStyles[email.urgency] || urgencyStyles.low;
            const isOpen = selectedEmail?.id === email.id;
            const isCarriedOver = (email.seenCount || 1) >= 2;
            const rowRef = getRowRef(email.id);
            return (
              <div
                key={i}
                ref={(el) => { rowRef.current = el; }}
                data-email-id={email.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (isOpen && !e.target.closest("[data-email-header]")) return;
                  setSelectedEmail(isOpen ? null : email);
                }}
                className={cn(
                  "group rounded cursor-pointer transition-all duration-150 py-3.5 px-4",
                  isOpen
                    ? "bg-white/[0.04]"
                    : "bg-surface hover:bg-surface-hover",
                )}
                style={{
                  border: `1px solid ${isOpen ? currentAccount.color + "33" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div
                  data-email-header
                  className={cn(
                    "flex justify-between items-start gap-3 transition-opacity duration-150",
                    isCarriedOver && "opacity-60",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">
                        {email.from}
                      </span>
                      {isCarriedOver && (
                        <span className="text-[10px] text-text-muted opacity-70">
                          ↩ From previous
                        </span>
                      )}
                      {email.hasBill && (
                        <span className="text-[9px] font-bold tracking-wide text-accent-light bg-accent/[0.12] px-1.5 py-0.5 rounded-sm uppercase">
                          💳 Bill
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-text-body mt-0.5">
                      {email.subject}
                    </div>
                    {!isOpen && (
                      <div className="text-xs text-text-muted mt-1 leading-relaxed overflow-hidden text-ellipsis whitespace-nowrap">
                        {email.preview}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {confirmDismissId === email.id ? (
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        <button
                          className="bg-danger/15 border border-danger/30 rounded-sm text-[#fca5a5] text-[10px] font-semibold px-2 py-0.5 cursor-pointer font-[inherit] transition-all duration-150"
                          onClick={() => { onDismiss(email.id); setConfirmDismissId(null); }}
                        >Dismiss</button>
                        <button
                          className="bg-transparent border-none text-text-muted text-sm cursor-pointer px-1 py-0.5 leading-none transition-colors duration-150 hover:text-text-secondary"
                          onClick={() => setConfirmDismissId(null)}
                        >×</button>
                      </div>
                    ) : (
                      <button
                        className={cn(
                          "transition-all duration-150 bg-transparent border-none cursor-pointer text-text-muted text-base px-1 py-0.5 leading-none hover:text-danger",
                          isCarriedOver ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCarriedOver) onDismiss(email.id);
                          else setConfirmDismissId(email.id);
                        }}
                        title="Dismiss from briefing"
                      >×</button>
                    )}
                    {email.action && (
                      <div
                        className="text-[10px] font-semibold tracking-wide rounded-md whitespace-nowrap px-2 py-1"
                        style={{
                          color: s.text,
                          background: s.bg,
                          border: `1px solid ${s.border}33`,
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
                      className={cn(
                        "transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
                {isOpen && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <EmailBody
                      email={email}
                      model={model}
                      onLoaded={() => {
                        setLoadingBillId(null);
                        const row = rowRef.current;
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
    </>
  );
}
