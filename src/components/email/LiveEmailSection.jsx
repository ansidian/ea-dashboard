import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import EmailBody from "./EmailBody";
import BillBadge from "../bills/BillBadge";
import { MotionExpand, MotionChevron, MotionList, MotionItem } from "../ui/motion-wrappers";
import { markEmailAsRead, markAllEmailsAsRead } from "../../api";
import { CheckCheck } from "lucide-react";

const getGmailUrl = (email) => {
  if (!email.message_id) return null;
  const idx = email.gmail_index ?? 0;
  return `https://mail.google.com/mail/u/${idx}/#search/rfc822msgid:${encodeURIComponent(email.message_id)}`;
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getTimestampColor(dateStr) {
  if (!dateStr) return "inherit";
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

export default function LiveEmailSection({ emails, briefingGeneratedAt, loaded, delay, className, embedded, onRefreshLive }) {
  const [selectedId, setSelectedId] = useState(null);
  const [markedRead, setMarkedRead] = useState(() => new Set());
  const [billPayId, setBillPayId] = useState(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const emailRowRefs = useRef({});

  const hasUnread = emails?.some(e => !e.read && !markedRead.has(e.uid));

  const handleMarkAllRead = async () => {
    const uids = emails.map(e => e.uid);
    if (!uids.length) return;
    setMarkingAllRead(true);
    try {
      await markAllEmailsAsRead(uids);
      setMarkedRead(prev => {
        const next = new Set(prev);
        uids.forEach(id => next.add(id));
        return next;
      });
      onRefreshLive?.();
    } catch {
      // silently fail
    }
    setMarkingAllRead(false);
  };

  const sectionTitle = getSectionTitle(briefingGeneratedAt);

  if (!emails?.length) {
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
    ? formatRelativeTime(briefingGeneratedAt + "Z")
    : null;

  const content = (
    <>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
          style={{ background: "rgba(99,102,241,0.1)", color: "rgba(99,102,241,0.8)" }}
        >
          {emails.length}
        </span>
        <span className="text-[12px] text-muted-foreground/50">
          new email{emails.length !== 1 ? "s" : ""}
          {briefingTime && ` · briefing ${briefingTime}`}
        </span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse ml-1"
          style={{ background: "rgba(99,102,241,0.6)" }}
        />
      </div>

      {/* Batch actions */}
      {emails.length > 0 && (
        <div className="mb-3 flex items-center gap-1.5">
          <button
            onClick={handleMarkAllRead}
            disabled={markingAllRead || !hasUnread}
            className={cn(
              "text-[10px] font-medium rounded-md px-2.5 py-1.5 cursor-pointer transition-all duration-150 font-[inherit]",
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
        {emails.map((email) => {
          const isOpen = selectedId === email.uid;
          const isBillPayOpen = billPayId === email.uid;
          const isRead = email.read || markedRead.has(email.uid);
          return (
            <MotionItem key={email.uid}>
              <div
                ref={(el) => { emailRowRefs.current[email.uid] = el; }}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (isOpen && !e.target.closest("[data-email-header]")) return;
                  const opening = !isOpen;
                  setSelectedId(opening ? email.uid : null);
                  if (opening && !markedRead.has(email.uid)) {
                    setMarkedRead(prev => new Set(prev).add(email.uid));
                    markEmailAsRead(email.uid).catch(() => {});
                  }
                }}
                className={cn(
                  "group relative rounded-lg cursor-pointer transition-all duration-150 py-3.5 px-4",
                  isRead && !isOpen && "opacity-50",
                )}
                style={{
                  background: isOpen ? "rgba(36,36,58,0.6)" : "rgba(36,36,58,0.4)",
                  border: isOpen
                    ? "1px solid rgba(99,102,241,0.2)"
                    : "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Important sender accent */}
                {email.isImportantSender && (
                  <div
                    className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                    style={{ background: "#f97316", opacity: 0.7, boxShadow: "0 0 6px rgba(249,115,22,0.3)" }}
                  />
                )}

                {!isOpen && (
                  <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />
                )}

                <div
                  data-email-header
                  className="relative flex justify-between items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
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
                      <span className="text-[11px] text-muted-foreground/50">
                        {email.from}
                      </span>
                      {email.isImportantSender && (
                        <span className="text-[9px] text-orange-400/80 font-semibold tracking-wide">
                          ★
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] font-medium text-foreground/90 mt-0.5">
                      {email.subject}
                    </div>
                    {email.urgentFlag && (
                      <div
                        className="text-[9px] font-semibold tracking-wide rounded-md whitespace-nowrap px-2 py-1 mt-1 inline-flex items-center gap-1 w-fit"
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
                    {!isOpen && email.body_preview && (
                      <div className="text-[11px] text-muted-foreground/40 mt-1 leading-relaxed overflow-hidden text-ellipsis whitespace-nowrap">
                        {email.body_preview}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] text-muted-foreground/30 tabular-nums"
                      style={getTimestampColor(email.date) ? { color: getTimestampColor(email.date) } : undefined}
                    >
                      {formatRelativeTime(email.date)}
                    </span>
                    {/* Bill pay toggle */}
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
                    {getGmailUrl(email) && (
                      <a
                        href={getGmailUrl(email)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in Gmail"
                        className="opacity-0 group-hover:opacity-100 transition-all duration-150 text-muted-foreground/20 hover:text-muted-foreground/60 hover:bg-white/[0.04] p-1 rounded leading-none inline-flex"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </a>
                    )}
                    <MotionChevron isOpen={isOpen} className="text-muted-foreground/40" />
                  </div>
                </div>

                {/* Bill pay panel — opens inline below header */}
                <MotionExpand isOpen={isBillPayOpen}>
                  <div onClick={(e) => e.stopPropagation()} className="mt-3 pt-3 border-t border-white/[0.06]">
                    <BillBadge bill={{}} model={null} />
                  </div>
                </MotionExpand>

                {/* Email body */}
                <MotionExpand isOpen={isOpen}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <EmailBody
                      email={email}
                      model={null}
                      onDismiss={() => {}}
                      onLoaded={() => {
                        const row = emailRowRefs.current[email.uid];
                        if (!row) return;
                        const rect = row.getBoundingClientRect();
                        // only scroll if the bottom of the expanded row is below the viewport
                        if (rect.bottom > window.innerHeight) {
                          row.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    </>
  );

  if (embedded) return content;

  return (
    <Section title={sectionTitle} delay={delay} loaded={loaded} className={className}>
      {content}
    </Section>
  );
}
