import { cn } from "@/lib/utils";
import EmailBody from "./EmailBody";
import { MotionExpand, MotionChevron } from "../ui/motion-wrappers";
import { markEmailAsRead } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";

const getGmailUrl = (email) => {
  if (!email.message_id) return null;
  const idx = email.gmail_index ?? 0;
  return `https://mail.google.com/mail/u/${idx}/#search/rfc822msgid:${encodeURIComponent(email.message_id)}`;
};

// Gmail external link — shared across email row variants
function GmailLink({ email }) {
  const url = getGmailUrl(email);
  if (!url) return null;
  return (
    <a
      href={url}
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
  );
}

// Urgent flag badge — shared across email row variants
function UrgentFlag({ email, size = "desktop" }) {
  if (!email.urgentFlag) return null;
  const mobile = size === "mobile";
  return (
    <div
      className={cn(
        "font-semibold tracking-wide rounded-md whitespace-nowrap px-2 py-1 flex items-center gap-1",
        mobile
          ? "text-xs mt-0.5 w-fit"
          : "text-[9px] tracking-wider w-fit",
      )}
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
  );
}

/**
 * Shared email row component used by both EmailSection and LiveEmailSection.
 *
 * Props:
 * - email          — email data object
 * - isOpen         — whether the row is expanded
 * - dimmed         — whether the row should appear faded (e.g. read, carried-over)
 * - onToggle       — called when user clicks to expand/collapse
 * - onMarkRead     — called when the row is opened for the first time
 * - rowRef         — ref callback for scroll-into-view
 * - accentBar      — ReactNode for the left accent bar (or null)
 * - desktopMeta    — ReactNode for items before the from line on desktop (account icons, dots)
 * - desktopAfterFrom — ReactNode for items after the from line on desktop (badges, labels)
 * - mobileBeforeFrom — ReactNode rendered before the from line on mobile (account icons)
 * - mobileMeta     — ReactNode for items after the from line on mobile (stars, timestamps)
 * - desktopActions — ReactNode for the right-side action buttons on desktop
 * - mobileActions  — ReactNode for extra mobile-only action buttons in the meta row
 * - preview        — preview text to show when collapsed
 * - extraExpanded  — ReactNode for extra expanded content (e.g. BillBadge panel) rendered before EmailBody
 * - hideUrgentFlag — suppress built-in UrgentFlag rendering (parent handles it in desktopActions)
 * - borderColor    — open-state border color (default: rgba(99,102,241,0.2))
 * - emailBodyProps — additional props passed to EmailBody (model, onDismiss, onLoaded)
 * - wrapper        — optional wrapper component (e.g. MaybeSwipe)
 * - className      — extra classes on the outer container
 */
export default function EmailRow({
  email,
  isOpen,
  dimmed,
  onToggle,
  onMarkRead,
  rowRef,
  accentBar,
  desktopMeta,
  desktopAfterFrom,
  mobileBeforeFrom,
  mobileMeta,
  desktopActions,
  mobileActions,
  preview,
  extraExpanded,
  hideUrgentFlag,
  borderColor = "rgba(99,102,241,0.2)",
  emailBodyProps,
  wrapper: Wrapper,
  className: cls,
}) {
  const isMobile = useIsMobile();

  const handleClick = (e) => {
    if (isOpen && !e.target.closest("[data-email-header]")) return;
    const opening = !isOpen;
    onToggle(opening);
    if (opening && onMarkRead) {
      onMarkRead();
      markEmailAsRead(email.uid || email.id).catch(() => {});
    }
  };

  const row = (
    <div
      ref={rowRef}
      data-email-id={email.uid || email.id}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      className={cn(
        "group relative rounded-lg cursor-pointer transition-all duration-150 py-3.5 px-4",
        accentBar && "pl-5",
        dimmed && !isOpen && "opacity-50",
        cls,
      )}
      style={{
        background: isOpen ? "rgba(36,36,58,0.6)" : "rgba(36,36,58,0.4)",
        border: isOpen
          ? `1px solid ${borderColor}`
          : "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {accentBar}

      {/* Hover bg */}
      {!isOpen && (
        <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />
      )}

      <div
        data-email-header
        className={cn(
          "relative",
          isMobile ? "flex flex-col gap-1" : "flex justify-between items-start gap-3",
        )}
      >
        {isMobile ? (
          <>
            <div className="text-[13px] font-medium text-foreground/90">
              {email.subject}
            </div>
            <div className="flex items-center gap-1.5">
              {mobileBeforeFrom}
              <span className="text-xs text-muted-foreground/50 truncate">
                {email.from}
              </span>
              {mobileMeta}
              {mobileActions}
            </div>
            {!hideUrgentFlag && <UrgentFlag email={email} size="mobile" />}
            {!isOpen && preview && (
              <div className="text-xs text-muted-foreground/40 leading-relaxed overflow-hidden text-ellipsis whitespace-nowrap">
                {preview}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {desktopMeta}
                <span className="text-[11px] text-muted-foreground/50">
                  {email.from}
                </span>
                {desktopAfterFrom}
              </div>
              <div className="text-[13px] font-medium text-foreground/90 mt-0.5">
                {email.subject}
              </div>
              {!hideUrgentFlag && <UrgentFlag email={email} size="desktop" />}
              {!isOpen && preview && (
                <div className="text-[11px] text-muted-foreground/40 mt-1 leading-relaxed overflow-hidden text-ellipsis whitespace-nowrap">
                  {preview}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {desktopActions}
              <GmailLink email={email} />
              <MotionChevron isOpen={isOpen} className="text-muted-foreground/40" />
            </div>
          </>
        )}
      </div>

      {extraExpanded}

      <MotionExpand isOpen={isOpen}>
        <div onClick={(e) => e.stopPropagation()}>
          <EmailBody
            email={email}
            {...emailBodyProps}
          />
        </div>
      </MotionExpand>
    </div>
  );

  if (Wrapper) return <Wrapper>{row}</Wrapper>;
  return row;
}
