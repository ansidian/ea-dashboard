import { useRef } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import { urgencyStyles } from "../../lib/dashboard-helpers";
import EmailBody from "./EmailBody";
import { MotionExpand, MotionChevron, MotionList, MotionItem } from "../ui/motion-wrappers";
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

  return (
    <>
      <div ref={emailSectionRef} />
      <Section title="Email Overview" delay={delay} loaded={loaded} style={style} className={className}>
        <p className="text-[12px] text-muted-foreground/60 m-0 mb-4 leading-relaxed">
          {summary || "No email accounts connected."}
        </p>
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {emailAccounts.map((acc, i) => {
            const isActive = activeAccount === i;
            return (
              <button
                key={i}
                onClick={() => {
                  setActiveAccount(i);
                  setSelectedEmail(null);
                  requestAnimationFrame(() => {
                    emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
                className="rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2 transition-all duration-200"
                style={{
                  background: isActive ? `${acc.color}12` : "rgba(255,255,255,0.02)",
                  border: isActive ? `1px solid ${acc.color}30` : "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span className="text-sm">{acc.icon}</span>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: isActive ? `${acc.color}dd` : "rgba(205,214,244,0.5)" }}
                >
                  {acc.name}
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                  style={{
                    background: `${acc.color}15`,
                    color: `${acc.color}${isActive ? "cc" : "80"}`,
                  }}
                >
                  {acc.unread}
                </span>
              </button>
            );
          })}
        </div>
        {(() => {
          const carriedOver = currentAccount.important.filter(e => (e.seenCount || 1) >= 2);
          if (!carriedOver.length) return null;
          return (
            <div className="mb-3">
              <button
                onClick={() => carriedOver.forEach(e => onDismiss(e.id))}
                className="text-[10px] font-medium rounded-md px-2.5 py-1.5 cursor-pointer transition-all duration-150 font-[inherit]"
                style={{
                  color: "rgba(205,214,244,0.4)",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              >
                Dismiss {carriedOver.length} carried-over
              </button>
            </div>
          );
        })()}
        <MotionList className="flex flex-col gap-1.5" loaded={loaded} delay={delay + 100} stagger={0.04}>
          {currentAccount.important.map((email) => {
            const s = urgencyStyles[email.urgency] || urgencyStyles.low;
            const isOpen = selectedEmail?.id === email.id;
            const isCarriedOver = (email.seenCount || 1) >= 2;
            return (
              <MotionItem key={email.id}>
                <div
                  ref={(el) => { emailRowRefs.current[email.id] = el; }}
                  data-email-id={email.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if (isOpen && !e.target.closest("[data-email-header]")) return;
                    setSelectedEmail(isOpen ? null : email);
                  }}
                  className={cn(
                    "group relative rounded-lg cursor-pointer transition-all duration-150 py-3.5 px-4 pl-5",
                    isCarriedOver && !isOpen && "opacity-50",
                  )}
                  style={{
                    background: isOpen ? "rgba(36,36,58,0.6)" : "rgba(36,36,58,0.4)",
                    border: isOpen ? `1px solid ${currentAccount.color}25` : "1px solid rgba(255,255,255,0.04)",
                  }}
              >
                {/* Urgency accent bar */}
                <div
                  className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                  style={{
                    background: s.dot,
                    opacity: isCarriedOver ? 0.2 : 0.6,
                    boxShadow: isCarriedOver ? "none" : `0 0 6px ${s.dot}30`,
                  }}
                />

                {/* Hover bg */}
                {!isOpen && (
                  <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />
                )}

                <div
                  data-email-header
                  className="relative flex justify-between items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground/50">
                        {email.from}
                      </span>
                      {isCarriedOver && (
                        <span className="text-[10px] text-muted-foreground/30">
                          ↩ previous
                        </span>
                      )}
                      {email.hasBill && (
                        <span
                          className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded uppercase"
                          style={{ color: "#a6e3a1cc", background: "rgba(166,227,161,0.08)" }}
                        >
                          💳 Bill
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] font-medium text-foreground/90 mt-0.5">
                      {email.subject}
                    </div>
                    {!isOpen && email.preview && (
                      <div className="text-[11px] text-muted-foreground/40 mt-1 leading-relaxed overflow-hidden text-ellipsis whitespace-nowrap">
                        {email.preview}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {confirmDismissId === email.id ? (
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        <button
                          className="rounded text-[10px] font-semibold px-2 py-0.5 cursor-pointer font-[inherit] transition-all duration-150"
                          style={{ color: "#f38ba8", background: "rgba(243,139,168,0.1)", border: "1px solid rgba(243,139,168,0.2)" }}
                          onClick={() => { onDismiss(email.id); setConfirmDismissId(null); }}
                        >Dismiss</button>
                        <button
                          className="bg-transparent border-none text-muted-foreground/40 cursor-pointer px-1 py-0.5 leading-none transition-colors duration-150 hover:text-muted-foreground"
                          onClick={() => setConfirmDismissId(null)}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        className={cn(
                          "transition-all duration-150 bg-transparent border-none cursor-pointer text-muted-foreground/30 px-1 py-0.5 leading-none hover:text-destructive",
                          isCarriedOver ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCarriedOver) onDismiss(email.id);
                          else setConfirmDismissId(email.id);
                        }}
                        title="Dismiss from briefing"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                    {email.action && (
                      <div
                        className="text-[9px] font-semibold tracking-wider uppercase rounded-md whitespace-nowrap px-2 py-1"
                        style={{
                          color: s.text,
                          background: s.bg,
                          border: `1px solid ${s.border}20`,
                        }}
                      >
                        {email.action}
                      </div>
                    )}
                    <MotionChevron isOpen={isOpen} className="text-muted-foreground/40" />
                  </div>
                </div>
                <MotionExpand isOpen={isOpen}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <EmailBody
                      email={email}
                      model={model}
                      onLoaded={() => {
                        setLoadingBillId(null);
                        const row = emailRowRefs.current[email.id];
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
                </MotionExpand>
                </div>
              </MotionItem>
            );
          })}
        </MotionList>
      </Section>
    </>
  );
}
