import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import { urgencyStyles } from "../../lib/dashboard-helpers";
import EmailBody from "./EmailBody";
import EmailRow from "./EmailRow";
import { MotionExpand, MotionChevron, MotionList, MotionItem } from "../ui/motion-wrappers";
import { useDashboard } from "../../context/DashboardContext";
import { markAllEmailsAsRead } from "../../api";
import { CheckCheck } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";
import SwipeToReveal from "../ui/SwipeToReveal";

function MaybeSwipe({ isMobile, onAction, children }) {
  if (!isMobile) return children;
  return <SwipeToReveal onAction={onAction}>{children}</SwipeToReveal>;
}

// Reusable ghost button — eliminates duplicated inline hover handlers
function GhostAction({ onClick, disabled, children, className: cls, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-[10px] max-sm:text-xs font-medium rounded-md px-2.5 py-1.5 cursor-pointer transition-all duration-150 font-[inherit]",
        active
          ? "text-primary bg-primary/[0.08] border border-primary/20 hover:bg-primary/[0.15] hover:border-primary/30"
          : "text-muted-foreground/40 bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/10",
        "disabled:opacity-50 disabled:pointer-events-none",
        cls,
      )}
    >
      {children}
    </button>
  );
}

// Inline confirm chip — used for dismiss confirmations
function ConfirmChip({ label, color, onConfirm, onCancel }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
      <button
        className="rounded-md text-[10px] max-sm:text-xs font-semibold px-2.5 py-1 cursor-pointer font-[inherit] transition-all duration-150 hover:brightness-125"
        style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}
        onClick={onConfirm}
      >{label}</button>
      <button
        className="bg-transparent border-none text-muted-foreground/30 cursor-pointer p-1 leading-none rounded transition-colors duration-150 hover:text-muted-foreground/60 hover:bg-white/[0.04]"
        onClick={onCancel}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function EmailSection({ summary, model, loaded, delay, style, className, embedded }) {
  const isMobile = useIsMobile();
  const {
    emailAccounts, currentAccount,
    activeAccount, setActiveAccount,
    selectedEmail, setSelectedEmail,
    confirmDismissId, setConfirmDismissId, handleDismiss: onDismiss,
    markAccountEmailsRead,
    setLoadingBillId, emailSectionRef, totalNoiseCount,
  } = useDashboard();

  const emailRowRefs = useRef({});
  const [markedRead, setMarkedRead] = useState(() => new Set());
  const [noiseExpanded, setNoiseExpanded] = useState(false);
  const [selectedNoiseId, setSelectedNoiseId] = useState(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const hasUnread = currentAccount?.important?.some(e => !e.read && !markedRead.has(e.uid || e.id) && !markedRead.has(e.id));

  const handleMarkAllRead = async () => {
    const uids = currentAccount.important.map(e => e.uid || e.id);
    if (!uids.length) return;
    setMarkingAllRead(true);
    try {
      await markAllEmailsAsRead(uids);
      setMarkedRead(prev => {
        const next = new Set(prev);
        uids.forEach(id => next.add(id));
        return next;
      });
      markAccountEmailsRead();
    } catch {
      // silently fail
    }
    setMarkingAllRead(false);
  };

  const noiseAccounts = emailAccounts.filter(acc => acc.noise?.length);
  const multiNoiseAccounts = noiseAccounts.length > 1;

  const content = (
    <>
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
              }}
              className="rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2 transition-all duration-200"
              style={{
                background: isActive ? `${acc.color}12` : "rgba(255,255,255,0.02)",
                border: isActive ? `1px solid ${acc.color}30` : "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span className="text-sm">{acc.icon}</span>
              <span
                className="text-[11px] max-sm:text-xs font-medium"
                style={{ color: isActive ? `${acc.color}dd` : "rgba(205,214,244,0.5)" }}
              >
                {acc.name}
              </span>
              <span
                className="text-[10px] max-sm:text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums"
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

      {/* Batch actions — contextual row above the email list */}
      {currentAccount.important.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5">
          {(() => {
            const carriedOver = currentAccount.important.filter(e => (e.seenCount || 1) >= 2);
            if (!carriedOver.length) return null;
            return (
              <GhostAction onClick={() => carriedOver.forEach(e => onDismiss(e.id))}>
                Dismiss {carriedOver.length} carried-over
              </GhostAction>
            );
          })()}
          <GhostAction onClick={handleMarkAllRead} disabled={markingAllRead} active={hasUnread}>
            <CheckCheck size={11} className="inline -mt-px" />
            {markingAllRead ? " Marking…" : " Mark all read"}
          </GhostAction>
        </div>
      )}

      <MotionList className="flex flex-col gap-1.5" loaded={loaded} delay={delay + 100} stagger={0.04}>
        {currentAccount.important.map((email) => {
          const s = urgencyStyles[email.urgency] || urgencyStyles.low;
          const isOpen = selectedEmail?.id === email.id;
          const isCarriedOver = (email.seenCount || 1) >= 2;
          return (
            <MotionItem key={email.id}>
              <EmailRow
                email={email}
                isOpen={isOpen}
                dimmed={isCarriedOver}
                onToggle={(opening) => setSelectedEmail(opening ? email : null)}
                onMarkRead={!markedRead.has(email.id) ? () => setMarkedRead(prev => new Set(prev).add(email.id)) : undefined}
                rowRef={(el) => { emailRowRefs.current[email.id] = el; }}
                borderColor={`${currentAccount.color}25`}
                preview={email.preview}
                accentBar={
                  <div
                    className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                    style={{
                      background: s.dot,
                      opacity: isCarriedOver ? 0.3 : 0.7,
                      boxShadow: isCarriedOver ? "none" : `0 0 6px ${s.dot}30`,
                    }}
                  />
                }
                desktopAfterFrom={
                  <>
                    {isCarriedOver && (
                      <span className="text-[10px] text-muted-foreground/40">
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
                  </>
                }
                mobileMeta={
                  <>
                    {isCarriedOver && (
                      <span className="text-xs text-muted-foreground/40">↩</span>
                    )}
                    {email.hasBill && (
                      <span className="text-xs font-bold" style={{ color: "#a6e3a1cc" }}>💳</span>
                    )}
                    {email.action && (
                      <span
                        className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded-md"
                        style={{ color: s.text, background: s.bg }}
                      >
                        {email.action}
                      </span>
                    )}
                  </>
                }
                desktopActions={
                  <>
                    {confirmDismissId === email.id ? (
                      <ConfirmChip
                        label="Dismiss"
                        color="#a6adc8"
                        onConfirm={() => { onDismiss(email.id); setConfirmDismissId(null); }}
                        onCancel={() => setConfirmDismissId(null)}
                      />
                    ) : (
                      <button
                        className={cn(
                          "transition-all duration-150 bg-transparent border-none cursor-pointer text-muted-foreground/20 p-1 leading-none rounded hover:text-muted-foreground/60 hover:bg-white/[0.04]",
                          isCarriedOver ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCarriedOver) onDismiss(email.id);
                          else setConfirmDismissId(email.id);
                        }}
                        title="Dismiss from briefing"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    {email.urgentFlag && (
                      <div
                        className="text-[9px] font-semibold tracking-wide rounded-md whitespace-nowrap px-2 py-1 flex items-center gap-1"
                        style={{
                          color: "#f97316",
                          background: "rgba(249,115,22,0.08)",
                          border: "1px solid rgba(249,115,22,0.2)",
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {email.urgentFlag.label}
                      </div>
                    )}
                  </>
                }
                hideUrgentFlag
                wrapper={isMobile ? (props) => <MaybeSwipe isMobile={true} onAction={() => onDismiss(email.id)}>{props.children}</MaybeSwipe> : undefined}
                emailBodyProps={{
                  model,
                  onDismiss,
                  onLoaded: () => {
                    setLoadingBillId(null);
                    const row = emailRowRefs.current[email.id];
                    if (!row) return;
                    const rect = row.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight) {
                      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }
                  },
                }}
              />
            </MotionItem>
          );
        })}
      </MotionList>

      {/* Noise drawer */}
      {totalNoiseCount > 0 && (
        <div className="mt-3">
          <GhostAction
            onClick={() => setNoiseExpanded(!noiseExpanded)}
            className="w-full flex items-center justify-between"
          >
            <span>{totalNoiseCount} email{totalNoiseCount !== 1 ? "s" : ""} filtered as noise</span>
            <MotionChevron isOpen={noiseExpanded} className="text-muted-foreground/25" />
          </GhostAction>
          <MotionExpand isOpen={noiseExpanded}>
            <div
              className="rounded-lg mt-1.5 py-3 px-4"
              style={{ background: "rgba(36,36,58,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              {noiseAccounts.map((acc, i) => (
                <div key={i} className={i > 0 ? "mt-3 pt-3 border-t border-white/[0.04]" : ""}>
                  {multiNoiseAccounts && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: acc.color, opacity: 0.7 }}
                      />
                      <span className="text-[10px] max-sm:text-xs font-medium text-muted-foreground/40">{acc.name}</span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    {acc.noise.map((noiseEmail, j) => {
                      const noiseId = noiseEmail.id || `noise-${i}-${j}`;
                      const isNoiseOpen = selectedNoiseId === noiseId;
                      return (
                        <div key={noiseId}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedNoiseId(isNoiseOpen ? null : noiseId)}
                            className="flex items-center gap-2 min-w-0 py-1.5 px-1 rounded cursor-pointer hover:bg-white/[0.04] transition-colors duration-150"
                          >
                            <span className="text-[11px] max-sm:text-xs text-muted-foreground/35 shrink-0 min-w-[80px] max-w-[140px] truncate">{noiseEmail.from}</span>
                            <span className="text-[11px] max-sm:text-xs text-muted-foreground/55 truncate flex-1">{noiseEmail.subject}</span>
                            <MotionChevron isOpen={isNoiseOpen} className="text-muted-foreground/20 shrink-0" />
                          </div>
                          <MotionExpand isOpen={isNoiseOpen}>
                            <div onClick={(e) => e.stopPropagation()} className="pb-2">
                              <EmailBody
                                email={{ ...noiseEmail, uid: noiseEmail.id }}
                                model={model}
                                onDismiss={() => {}}
                                onLoaded={() => {}}
                              />
                            </div>
                          </MotionExpand>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </MotionExpand>
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <>
      <div ref={emailSectionRef} />
      <Section title="Email Overview" delay={delay} loaded={loaded} style={style} className={className}>
        {content}
      </Section>
    </>
  );
}
