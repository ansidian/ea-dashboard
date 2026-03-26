import { useState, useEffect, useRef } from "react";
import { getEmailBody } from "../api";
import EmailIframe from "./EmailIframe";
import BillBadge from "./BillBadge";
import "./EmailIframe.css";

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
  }, [emailKey]);

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
  }, [loadingBody]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="email-body-root"
    >
      {email.preview && (
        <div className="email-body-preview">
          <span className="email-body-preview-icon">✨</span>
          <span className="email-body-preview-text">
            {email.preview}
          </span>
        </div>
      )}
      {loadingBody ? (
        <div className="email-body-loading">
          <div className="email-body-spinner" />
          <span className="email-body-loading-text">
            Loading email...
          </span>
        </div>
      ) : body ? (
        isHtml ? (
          <EmailIframe html={body} />
        ) : (
          <pre className="email-text">{body}</pre>
        )
      ) : (
        <div className="email-body-unavailable">
          Email body unavailable
        </div>
      )}
      {email.hasBill && email.extractedBill && (
        <div className="email-body-bill">
          <BillBadge bill={email.extractedBill} model={model} />
        </div>
      )}
    </div>
  );
}
