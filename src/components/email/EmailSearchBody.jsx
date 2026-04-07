import { useState, useEffect, useRef } from "react";
import { getEmailBody, markEmailAsRead, markEmailAsUnread } from "../../api";
import EmailIframe from "./EmailIframe";

const AUTO_MARK_DELAY_MS = 1500;

function formatFullDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Slim email body viewer used by the search modal/sheet.
// Loads the body lazily, schedules a delayed auto-mark-as-read so quick
// peeks don't burn the unread state. Provides a manual unread toggle.
// Wrapper is responsible for close/back chrome.
export default function EmailSearchBody({ email, onMarkedRead, onMarkedUnread, onClose }) {
  // result.key tracks which uid the loaded body belongs to.
  // If result.key !== email.uid, we're still loading the new uid.
  const [result, setResult] = useState({ key: null, body: null, error: null });
  // Local read state — mirrors email.read but tracks the manual toggle.
  // Reset to email.read whenever the uid changes.
  const [localRead, setLocalRead] = useState(!!email.read);
  const [toggling, setToggling] = useState(false);
  const markedRef = useRef(null);
  const autoMarkTimerRef = useRef(null);

  useEffect(() => {
    setLocalRead(!!email.read);
  }, [email.uid, email.read]);

  useEffect(() => {
    let cancelled = false;
    getEmailBody(email.uid)
      .then((res) => {
        if (cancelled) return;
        setResult({ key: email.uid, body: res.html_body || res.body || "", error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: email.uid, body: null, error: err.message || "Failed to load email" });
      });
    return () => { cancelled = true; };
  }, [email.uid]);

  const loading = result.key !== email.uid;
  const body = loading ? null : result.body;
  const error = loading ? null : result.error;

  // Delayed auto mark-as-read. We wait AUTO_MARK_DELAY_MS after the body
  // loads so a quick peek-and-swap doesn't burn the unread state. The timer
  // is cancelled if the user closes/swaps the email or manually toggles.
  useEffect(() => {
    if (loading || error || email.read || markedRef.current === email.uid) return;
    autoMarkTimerRef.current = setTimeout(() => {
      markedRef.current = email.uid;
      setLocalRead(true);
      markEmailAsRead(email.uid)
        .then(() => onMarkedRead?.(email.uid))
        .catch((err) => console.error("Failed to mark email read:", err.message));
    }, AUTO_MARK_DELAY_MS);
    return () => {
      if (autoMarkTimerRef.current) {
        clearTimeout(autoMarkTimerRef.current);
        autoMarkTimerRef.current = null;
      }
    };
  }, [loading, error, email.uid, email.read, onMarkedRead]);

  async function handleToggleRead() {
    if (toggling) return;
    // Cancel any pending auto-mark — user is taking explicit control
    if (autoMarkTimerRef.current) {
      clearTimeout(autoMarkTimerRef.current);
      autoMarkTimerRef.current = null;
    }
    setToggling(true);
    const next = !localRead;
    setLocalRead(next);
    try {
      if (next) {
        markedRef.current = email.uid;
        await markEmailAsRead(email.uid);
        onMarkedRead?.(email.uid);
      } else {
        markedRef.current = null;
        await markEmailAsUnread(email.uid);
        onMarkedUnread?.(email.uid);
      }
    } catch (err) {
      console.error("Failed to toggle read state:", err.message);
      setLocalRead(!next); // revert
    } finally {
      setToggling(false);
    }
  }

  const isHtml = body && /<[a-z!/]/i.test(body);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header */}
      <div
        className="px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm shrink-0">{email.account_icon || "📧"}</span>
          <span className="text-[11px] font-semibold text-foreground/80">
            {email.account_label}
          </span>
          <span className="text-[10px] text-muted-foreground/40 truncate">
            {email.account_email}
          </span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleToggleRead}
              disabled={toggling}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1 hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderRadius: 8 }}
              title={localRead ? "Mark as unread" : "Mark as read"}
            >
              {localRead ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Mark unread
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  Mark read
                </>
              )}
            </button>
            {email.web_url ? (
              <a
                href={email.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary transition-colors px-2 py-1 hover:bg-white/[0.04]"
                style={{ borderRadius: 8 }}
              >
                Open in Gmail
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </a>
            ) : (
              // iCloud: no deep link available — Message-ID isn't indexed,
              // so we can't build a `message:` URL for Mail.app. Show a
              // disabled affordance so the absence is intentional, not silent.
              <span
                className="flex items-center gap-1 text-[10px] text-muted-foreground/30 px-2 py-1 cursor-not-allowed"
                title="Direct links unavailable for iCloud"
              >
                No web link
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close email"
                className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06] transition-colors"
                style={{ borderRadius: 6 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="text-[13px] font-medium text-foreground truncate">
          {email.from_name || email.from_address}
          {email.from_name && email.from_address && (
            <span className="text-[11px] text-muted-foreground/50 font-normal ml-2">
              {email.from_address}
            </span>
          )}
        </div>
        <div className="text-[12px] text-foreground/80 mt-1 leading-relaxed">
          {email.subject}
        </div>
        <div className="text-[10px] text-muted-foreground/50 mt-1 tabular-nums">
          {formatFullDate(email.email_date)}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && (
          <div className="flex items-center gap-2 py-3">
            <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
            <span className="text-[11px] text-muted-foreground/50">
              Loading email...
            </span>
          </div>
        )}
        {error && (
          <div className="text-[11px] text-destructive py-2">{error}</div>
        )}
        {!loading && !error && body && (
          isHtml ? (
            <EmailIframe html={body} />
          ) : (
            <pre className="font-sans text-[13px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words m-0">{body}</pre>
          )
        )}
        {!loading && !error && !body && (
          <div className="text-[11px] text-muted-foreground/40 py-2">
            Email body unavailable
          </div>
        )}
      </div>
    </div>
  );
}
