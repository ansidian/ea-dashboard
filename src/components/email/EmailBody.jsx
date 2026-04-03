import { useState, useEffect, useRef } from "react";
import { getEmailBody, trashEmail } from "../../api";
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

export default function EmailBody({ email, model, onLoaded, onDismiss }) {
  const { body, loading: loadingBody } = useEmailBody(email);
  const isHtml = body && /<[a-z!/]/i.test(body);
  const notifiedRef = useRef(false);
  const [trashState, setTrashState] = useState("idle"); // idle | confirm | trashing

  useEffect(() => {
    if (!loadingBody && !notifiedRef.current) {
      notifiedRef.current = true;

      setTimeout(() => onLoaded?.(), 75);
    }
  }, [loadingBody, onLoaded]);

  const trashAction = (
    <div className="flex items-center">
      {trashState === "idle" && (
        <button
          onClick={() => setTrashState("confirm")}
          className="flex items-center gap-1.5 text-[10px] max-sm:text-xs font-medium text-muted-foreground/30 bg-transparent border-none cursor-pointer p-0 font-[inherit] transition-colors duration-150 hover:text-[#f38ba8]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
          Trash
        </button>
      )}
      {trashState === "confirm" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] max-sm:text-xs text-muted-foreground/40">Move to trash?</span>
          <button
            onClick={async () => {
              setTrashState("trashing");
              try {
                await trashEmail(email.uid || email.id);
                onDismiss?.(email.uid || email.id);
              } catch {
                setTrashState("idle");
              }
            }}
            className="text-[10px] max-sm:text-xs font-semibold rounded-md px-2.5 py-1 cursor-pointer font-[inherit] transition-all duration-150 hover:brightness-125"
            style={{ color: "#f38ba8", background: "rgba(243,139,168,0.1)", border: "1px solid rgba(243,139,168,0.2)" }}
          >
            Trash
          </button>
          <button
            onClick={() => setTrashState("idle")}
            className="text-[10px] max-sm:text-xs text-muted-foreground/40 bg-transparent border-none cursor-pointer p-0 font-[inherit] transition-colors duration-150 hover:text-muted-foreground/60"
          >
            Cancel
          </button>
        </div>
      )}
      {trashState === "trashing" && (
        <span className="text-[10px] max-sm:text-xs text-muted-foreground/30">Moving to trash…</span>
      )}
    </div>
  );

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
          <span className="text-[12px] text-foreground/70 leading-relaxed flex-1">
            {email.preview}
          </span>
          {trashAction}
        </div>
      )}
      {!email.preview && <div className="mb-3">{trashAction}</div>}
      {loadingBody ? (
        <div className="flex items-center gap-2 py-3">
          <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
          <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">
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
        <div className="text-[11px] max-sm:text-xs text-muted-foreground/40 py-2">
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
