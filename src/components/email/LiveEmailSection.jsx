import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import EmailRow from "./EmailRow";
import BillBadge from "../bills/BillBadge";
import { MotionExpand, MotionList, MotionItem } from "../ui/motion-wrappers";
import { timeAgo } from "../../lib/dashboard-helpers";
import { CheckCheck } from "lucide-react";


function getTimestampColor(dateStr) {
  if (!dateStr) return undefined;
  const mins = (Date.now() - new Date(dateStr).getTime()) / 60000;
  if (mins < 30) return "rgba(99,102,241,0.6)";
  if (mins < 120) return undefined;
  return "rgba(245,158,11,0.6)";
}

function getSectionTitle(briefingGeneratedAt) {
  if (!briefingGeneratedAt) return "Since This Morning";
  const hour = new Date(briefingGeneratedAt + "Z").toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  });
  const h = parseInt(hour, 10);
  if (h >= 17) return "Since This Evening";
  if (h >= 12) return "Since This Afternoon";
  return "Since This Morning";
}

export default function LiveEmailSection({ briefingGeneratedAt, loaded, delay, className, embedded, onRefreshLive, liveState }) {
  const {
    visibleEmails,
    unreadCount,
    hasUnread,
    isRead,
    markRead,
    dismiss,
    markAllRead,
    markingAllRead,
  } = liveState;

  const [selectedId, setSelectedId] = useState(null);
  const [billPayId, setBillPayId] = useState(null);
  const emailRowRefs = useRef({});

  const handleMarkAllRead = async () => {
    await markAllRead();
    onRefreshLive?.();
  };

  const sectionTitle = getSectionTitle(briefingGeneratedAt);

  if (!visibleEmails.length) {
    if (!briefingGeneratedAt) return null;
    const emptyMsg = <p className="text-[12px] text-muted-foreground/40 m-0">No new emails since the last fetch.</p>;
    if (embedded) return emptyMsg;
    return (
      <Section title={sectionTitle} delay={delay} loaded={loaded} className={className}>
        {emptyMsg}
      </Section>
    );
  }

  const briefingTime = briefingGeneratedAt
    ? timeAgo(briefingGeneratedAt + "Z", { compact: true })
    : null;

  const content = (
    <>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-[10px] max-sm:text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
          style={{ background: "rgba(99,102,241,0.1)", color: "rgba(99,102,241,0.8)" }}
        >
          {visibleEmails.length}
        </span>
        <span className="text-[12px] text-muted-foreground/50">
          email{visibleEmails.length !== 1 ? "s" : ""}
          {unreadCount > 0 && unreadCount < visibleEmails.length && ` · ${unreadCount} unread`}
          {briefingTime && ` · briefing ${briefingTime}`}
        </span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse ml-1"
          style={{ background: "rgba(99,102,241,0.6)" }}
        />
      </div>

      {/* Batch actions */}
      {visibleEmails.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5">
          <button
            onClick={handleMarkAllRead}
            disabled={markingAllRead || !hasUnread}
            className={cn(
              "text-[10px] max-sm:text-xs font-medium rounded-md px-2.5 py-1.5 cursor-pointer transition-all duration-150 font-[inherit]",
              hasUnread
                ? "text-primary bg-primary/[0.08] border border-primary/20 hover:bg-primary/[0.15] hover:border-primary/30"
                : "text-muted-foreground/40 bg-white/[0.02] border border-white/[0.06]",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            <CheckCheck size={11} className="inline -mt-px" />
            {markingAllRead ? " Marking…" : " Mark all read"}
          </button>
        </div>
      )}

      <MotionList className="flex flex-col gap-1.5" loaded={loaded} delay={delay + 100} stagger={0.04}>
        {[...visibleEmails].sort((a, b) => (b.isImportantSender ? 1 : 0) - (a.isImportantSender ? 1 : 0) || new Date(b.date) - new Date(a.date)).map((email) => {
          const isOpen = selectedId === email.uid;
          const isBillPayOpen = billPayId === email.uid;
          const rowIsRead = isRead(email);
          const tsColor = getTimestampColor(email.date);
          return (
            <MotionItem key={email.uid}>
              <EmailRow
                email={email}
                isOpen={isOpen}
                dimmed={rowIsRead}
                onToggle={(opening) => setSelectedId(opening ? email.uid : null)}
                onMarkRead={rowIsRead ? undefined : () => markRead(email.uid)}
                rowRef={(el) => { emailRowRefs.current[email.uid] = el; }}
                preview={email.body_preview}
                accentBar={email.isImportantSender ? (
                  <div
                    className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                    style={{ background: "#f97316", opacity: 0.7, boxShadow: "0 0 6px rgba(249,115,22,0.3)" }}
                  />
                ) : null}
                desktopMeta={
                  <>
                    {email.account_icon && (
                      <span className="text-[10px]">{email.account_icon}</span>
                    )}
                    {email.account_label && (
                      <span className="text-[10px] text-muted-foreground/35">{email.account_label}</span>
                    )}
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: email.account_color || "#6366f1" }}
                    />
                  </>
                }
                desktopAfterFrom={email.isImportantSender ? (
                  <span className="text-[9px] text-orange-400/80 font-semibold tracking-wide">
                    ★
                  </span>
                ) : null}
                mobileBeforeFrom={email.account_icon ? (
                  <span className="text-xs">{email.account_icon}</span>
                ) : null}
                mobileMeta={
                  <>
                    {email.isImportantSender && (
                      <span className="text-xs text-orange-400/80 font-semibold">★</span>
                    )}
                    <span className="text-xs text-muted-foreground/30 tabular-nums" style={tsColor ? { color: tsColor } : undefined}>
                      · {timeAgo(email.date, { compact: true })}
                    </span>
                  </>
                }
                mobileActions={
                  <button
                    className={cn(
                      "transition-all duration-150 bg-transparent border-none cursor-pointer p-0.5 leading-none rounded shrink-0",
                      isBillPayOpen
                        ? "text-green-400/80"
                        : "text-muted-foreground/25",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBillPayId(isBillPayOpen ? null : email.uid);
                    }}
                    title="Send to Actual Budget"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                    </svg>
                  </button>
                }
                desktopActions={
                  <>
                    <span
                      className="text-[10px] text-muted-foreground/30 tabular-nums"
                      style={tsColor ? { color: tsColor } : undefined}
                    >
                      {timeAgo(email.date, { compact: true })}
                    </span>
                    <button
                      className={cn(
                        "transition-all duration-150 bg-transparent border-none cursor-pointer p-1 leading-none rounded",
                        isBillPayOpen
                          ? "text-green-400/80 bg-green-400/[0.08]"
                          : "text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-green-400/60 hover:bg-white/[0.04]",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBillPayId(isBillPayOpen ? null : email.uid);
                      }}
                      title="Send to Actual Budget"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                      </svg>
                    </button>
                  </>
                }
                extraExpanded={
                  <MotionExpand isOpen={isBillPayOpen}>
                    <div onClick={(e) => e.stopPropagation()} className="mt-3 pt-3 border-t border-white/[0.06]">
                      <BillBadge bill={{}} model={null} />
                    </div>
                  </MotionExpand>
                }
                emailBodyProps={{
                  model: null,
                  onDismiss: (uid) => {
                    dismiss(uid);
                    setSelectedId(null);
                  },
                  onLoaded: () => {
                    const row = emailRowRefs.current[email.uid];
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
    </>
  );

  if (embedded) return content;

  return (
    <Section title={sectionTitle} delay={delay} loaded={loaded} className={className}>
      {content}
    </Section>
  );
}
