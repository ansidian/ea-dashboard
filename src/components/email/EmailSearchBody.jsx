import { useState, useEffect, useRef } from "react";
import { getEmailBody, markEmailAsRead } from "../../api";
import EmailIframe from "./EmailIframe";

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
// Loads the body lazily, fires mark-as-read once on successful load.
// Wrapper is responsible for close/back chrome.
export default function EmailSearchBody({ email, onMarkedRead }) {
  // result.key tracks which uid the loaded body belongs to.
  // If result.key !== email.uid, we're still loading the new uid.
  const [result, setResult] = useState({ key: null, body: null, error: null });
  const markedRef = useRef(null);

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

  // Auto mark-as-read once after successful body load (per uid)
  useEffect(() => {
    if (loading || error || markedRef.current === email.uid || email.read) return;
    markedRef.current = email.uid;
    markEmailAsRead(email.uid)
      .then(() => onMarkedRead?.(email.uid))
      .catch((err) => console.error("Failed to mark email read:", err.message));
  }, [loading, error, email.uid, email.read, onMarkedRead]);

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
          {email.web_url && (
            <a
              href={email.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary transition-colors px-2 py-1 rounded-default hover:bg-white/[0.04]"
              style={{ borderRadius: 8 }}
            >
              Open in Gmail
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          )}
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
