import { useState, useEffect, useRef } from "react";
import { getEmailBody } from "../../api";
import EmailIframe from "./EmailIframe";
import BillBadge from "../bills/BillBadge";
function useEmailBody(email) {
  const emailKey = email.uid || email.id;
  // Track which key the result belongs to
  const [result, setResult] = useState({
    key: null,
    body: null,
    loading: false,
  });

  useEffect(() => {
    if (email.fullBody) return;
    let cancelled = false;
    getEmailBody(emailKey)
      .then((res) => {
        if (!cancelled)
          setResult({ key: emailKey, body: res.html_body, loading: false });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ key: emailKey, body: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [emailKey, email.fullBody]);

  if (email.fullBody) return { body: email.fullBody, loading: false };
  // If result is for a different key, we're loading
  if (result.key !== emailKey) return { body: null, loading: true };
  return { body: result.body, loading: false };
}

export default function EmailBody({ email, model, onLoaded }) {
  const { body, loading: loadingBody } = useEmailBody(email);
  const isHtml = body && /<[a-z!/]/i.test(body);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!loadingBody && !notifiedRef.current) {
      notifiedRef.current = true;

      setTimeout(() => onLoaded?.(), 75);
    }
  }, [loadingBody, onLoaded]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="animate-in fade-in border-t border-white/[0.04] mt-3 pt-3.5"
    >
      {email.preview && (
        <div
          className="flex items-start gap-2 mb-3 p-2.5 px-3 rounded-lg"
          style={{
            background: "rgba(203,166,218,0.04)",
            border: "1px solid rgba(203,166,218,0.08)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cba6da" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ opacity: 0.6 }}>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span className="text-[12px] text-foreground/70 leading-relaxed">
            {email.preview}
          </span>
        </div>
      )}
      {loadingBody ? (
        <div className="flex items-center gap-2 py-3">
          <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
          <span className="text-[11px] text-muted-foreground/50">
            Loading email...
          </span>
        </div>
      ) : body ? (
        isHtml ? (
          <EmailIframe html={body} />
        ) : (
          <pre className="font-sans text-[13px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words m-0 max-h-[70vh] overflow-y-auto">{body}</pre>
        )
      ) : (
        <div className="text-[11px] text-muted-foreground/40 py-2">
          Email body unavailable
        </div>
      )}
      {email.hasBill && email.extractedBill && (
        <div className="mt-3">
          <BillBadge bill={email.extractedBill} model={model} />
        </div>
      )}
    </div>
  );
}
