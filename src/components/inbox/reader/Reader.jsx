import { useEffect, useRef, useState } from "react";
import {
  Mail, Trash2, Pin, Clock,
  Sparkles, X, Reply, ArrowUp, ArrowDown, ArrowLeft, ChevronDown, ChevronUp,
  CreditCard, ExternalLink, MailOpen,
} from "lucide-react";
import { getEmailBody, peekEmailBody } from "../../../api";
import { getGmailUrl } from "../../../lib/email-links";
import { timeSince, timeClock } from "../helpers";
import { Kbd, Avatar, QuickAction } from "../primitives";
import SnoozePicker from "../SnoozePicker";
import BillBadge from "../../bills/BillBadge";
import TriagePanel from "./TriagePanel";
import EmailBodyPane from "./EmailBodyPane";
import DraftReply from "./DraftReply";

function MobileSection({ title, accent, open, onToggle, children, testId }) {
  return (
    <div
      data-testid={testId}
      style={{
        margin: "14px 16px 0",
        borderRadius: 12,
        background: "rgba(24,24,37,0.72)",
        border: `1px solid ${accent}22`,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          border: "none",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {title}
        </span>
        <span style={{ flex: 1 }} />
        {open ? <ChevronUp size={16} color="rgba(205,214,244,0.6)" /> : <ChevronDown size={16} color="rgba(205,214,244,0.6)" />}
      </button>
      {open && <div style={{ padding: "0 0 14px" }}>{children}</div>}
    </div>
  );
}

export default function Reader({
  email,
  account,
  accent,
  pinned,
  onAction,
  onClose,
  showTriage,
  showDraft,
  billOpen,
  setBillOpen,
  trashHoldProgress = 0,
  snoozeHoldProgress = 0,
  isMobile = false,
}) {
  const snoozeBtnRef = useRef(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  // Parent re-keys this component on email.id change so `drafting` resets
  // automatically — no setState-in-effect reconciliation needed.
  const [drafting, setDrafting] = useState(showDraft);
  // Lazy-mount the bill form. Once the user has opened it for this email we
  // keep it mounted (the form state + Actual metadata is cheap to hold) so
  // the drawer can close-animate smoothly without the content flashing out.
  const [billMounted, setBillMounted] = useState(billOpen);
  useEffect(() => {
    if (billOpen) setBillMounted(true);
  }, [billOpen]);
  const emailKey = email?.uid || email?.id;
  // Seed from cache (or props) so flipping back to a previously-viewed email
  // renders the body synchronously instead of flashing the spinner. The
  // cache lives in api.js with a 5-minute TTL.
  const [bodyState, setBodyState] = useState(() => {
    if (!email) return { loading: false, body: null, error: null };
    if (email.fullBody) return { loading: false, body: email.fullBody, error: null };
    const cached = peekEmailBody(emailKey);
    if (cached) {
      return { loading: false, body: cached.html_body || cached.body || "", error: null };
    }
    return { loading: true, body: null, error: null };
  });

  // Intentionally NOT depending on the whole `email` object — when
  // markEmailRead flips `read` to true, the parent rebuilds the email object
  // (deep clone), which would re-fire this effect and re-fetch the body
  // (causing the load-twice flicker the user reported). Keying off uid/id
  // and the synchronously-known fullBody flag is enough.
  const hasFullBody = !!email?.fullBody;
  useEffect(() => {
    if (!emailKey) return undefined;
    if (hasFullBody) {
      setBodyState({ loading: false, body: email.fullBody, error: null });
      return undefined;
    }
    const cached = peekEmailBody(emailKey);
    if (cached) {
      setBodyState({ loading: false, body: cached.html_body || cached.body || "", error: null });
      return undefined;
    }
    let cancelled = false;
    setBodyState({ loading: true, body: null, error: null });
    getEmailBody(emailKey)
      .then((res) => {
        if (cancelled) return;
        setBodyState({ loading: false, body: res.html_body || res.body || "", error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setBodyState({ loading: false, body: null, error: err.message || "Failed to load email" });
      });
    return () => { cancelled = true; };
    // email.fullBody captured via hasFullBody flag; full email object
    // intentionally omitted to avoid re-fetch on read-state mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailKey, hasFullBody]);

  if (!email) {
    return (
      <div
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 10,
          color: "rgba(205,214,244,0.35)",
          background: "rgba(22,22,30,0.5)",
        }}
      >
        <Mail size={32} color="rgba(205,214,244,0.15)" />
        <div style={{ fontSize: 12 }}>Select an email</div>
        <div style={{ fontSize: 10, color: "rgba(205,214,244,0.3)" }}>
          <Kbd>J</Kbd> <Kbd>K</Kbd> to navigate
        </div>
      </div>
    );
  }

  if (isMobile) {
    const gmailUrl = getGmailUrl(email);
    return (
      <div
        data-testid="inbox-mobile-reader"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "rgba(22,22,30,0.72)",
        }}
      >
        <div
          style={{
            padding: "12px 14px 10px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(11,11,19,0.86)",
            backdropFilter: "blur(14px)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Back to inbox"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(205,214,244,0.8)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: accent,
              }}
            >
              {account?.name || account?.email || "Inbox"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(205,214,244,0.6)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {timeSince(email.date)}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}>
          <div style={{ padding: "18px 16px 8px" }}>
            <h1
              className="ea-display"
              style={{
                margin: 0,
                fontSize: 24,
                lineHeight: 1.12,
                fontWeight: 500,
                letterSpacing: -0.4,
                color: "#fff",
              }}
            >
              {email.subject}
            </h1>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar
                name={email.from}
                email={email.fromEmail}
                color={account?.color || accent}
                size={34}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {email.from}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(205,214,244,0.5)",
                    marginTop: 2,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{timeClock(email.date)}</span>
                  <span style={{ opacity: 0.35 }}>·</span>
                  <span>{timeSince(email.date)}</span>
                  {account?.name && (
                    <>
                      <span style={{ opacity: 0.35 }}>·</span>
                      <span style={{ color: account.color || accent }}>{account.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              <QuickAction
                icon={email.read ? Mail : MailOpen}
                label={email.read ? "Unread" : "Read"}
                onClick={() => onAction("toggle-read")}
                accent={accent}
              />
              <QuickAction
                icon={Pin}
                label={pinned ? "Pinned" : "Pin"}
                onClick={() => onAction("pin")}
                accent={accent}
              />
              <QuickAction
                icon={Clock}
                label="Snooze"
                buttonRef={snoozeBtnRef}
                onClick={() => setSnoozeOpen((v) => !v)}
                accent={accent}
                holdProgress={snoozeHoldProgress}
                holdColor="#f97316"
              />
              {gmailUrl && (
                <QuickAction
                  icon={ExternalLink}
                  label="Gmail"
                  onClick={() => window.open(gmailUrl, "_blank", "noopener,noreferrer")}
                  accent={accent}
                />
              )}
              <QuickAction
                icon={Trash2}
                label="Trash"
                danger
                onClick={() => onAction("trash")}
                accent={accent}
                holdProgress={trashHoldProgress}
                holdColor="#f38ba8"
              />
            </div>
            {snoozeOpen && (
              <SnoozePicker
                anchorRef={snoozeBtnRef}
                onSelect={(untilTs) => onAction("snooze", untilTs)}
                onClose={() => setSnoozeOpen(false)}
              />
            )}
          </div>

          {showTriage && email.claude && (
            <div style={{ flexShrink: 0 }}>
              <TriagePanel email={email} accent={accent} />
            </div>
          )}

          {email._untriaged && (
            <div
              style={{
                margin: "16px 16px 0",
                borderRadius: 12,
                padding: "12px 14px",
                background: "linear-gradient(135deg, rgba(137,180,250,0.08), rgba(137,180,250,0.03))",
                border: "1px dashed rgba(137,180,250,0.28)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: "#89b4fa",
                }}
              >
                Live · not yet triaged
              </div>
              <div
                className="ea-display"
                style={{
                  fontSize: 12,
                  color: "rgba(205,214,244,0.72)",
                  marginTop: 5,
                  fontStyle: "italic",
                  lineHeight: 1.5,
                }}
              >
                Arrived after your last briefing. Claude hasn&apos;t weighed in yet.
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <EmailBodyPane state={bodyState} fallback={email.body || email.preview} isMobile />
          </div>

          {(email._untriaged || email.hasBill) && (
            <MobileSection
              title={billOpen ? "Bill pay open" : "Pay bill"}
              accent="#a6e3a1"
              open={billOpen}
              onToggle={() => setBillOpen((v) => !v)}
              testId="inbox-mobile-bill-section"
            >
              <div style={{ padding: "0 14px" }}>
                <BillBadge
                  layout="mobile"
                  bill={email.extractedBill || {
                    payee: "",
                    amount: null,
                    due_date: "",
                    type: "expense",
                  }}
                  model={email.billModel}
                  emailSubject={email.subject}
                  emailFrom={email.from}
                  emailBody={email.body || email.preview}
                />
              </div>
            </MobileSection>
          )}

          {email.claude?.draftReply && (
            <MobileSection
              title={drafting ? "Draft reply open" : "Claude draft reply"}
              accent={accent}
              open={drafting}
              onToggle={() => setDrafting((v) => !v)}
              testId="inbox-mobile-draft-section"
            >
              <DraftReply
                key={email.id}
                email={email}
                accent={accent}
                onSend={() => { setDrafting(false); onAction("trash"); }}
                onDiscard={() => setDrafting(false)}
              />
            </MobileSection>
          )}

          <div style={{ height: 20 }} />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1.3, minWidth: 0,
        display: "flex", flexDirection: "column",
        background: "rgba(22,22,30,0.5)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}
      >
        <QuickAction icon={ArrowUp} hint="K" onClick={() => onAction("prev")} accent={accent} />
        <QuickAction icon={ArrowDown} hint="J" onClick={() => onAction("next")} accent={accent} />
        <span style={{ flex: 1 }} />
        {(email._untriaged || email.hasBill) && (
          <QuickAction
            icon={CreditCard}
            label={billOpen ? "Hide bill" : "Pay bill"}
            primary={!billOpen}
            onClick={() => setBillOpen((v) => !v)}
            accent="#a6e3a1"
          />
        )}
        <QuickAction
          icon={email.read ? Mail : MailOpen}
          label={email.read ? "Mark unread" : "Mark read"}
          hint="U"
          onClick={() => onAction("toggle-read")}
          accent={accent}
        />
        <QuickAction
          icon={Pin}
          label={pinned ? "Pinned" : "Pin"}
          hint="P"
          onClick={() => onAction("pin")}
          accent={accent}
        />
        <QuickAction
          icon={Clock}
          label="Snooze"
          hint="S"
          buttonRef={snoozeBtnRef}
          onClick={() => setSnoozeOpen((v) => !v)}
          accent={accent}
          holdProgress={snoozeHoldProgress}
          holdColor="#f97316"
        />
        {snoozeOpen && (
          <SnoozePicker
            anchorRef={snoozeBtnRef}
            onSelect={(untilTs) => onAction("snooze", untilTs)}
            onClose={() => setSnoozeOpen(false)}
          />
        )}
        {(() => {
          const url = getGmailUrl(email);
          if (!url) return null;
          return (
            <QuickAction
              icon={ExternalLink}
              label="Open in Gmail"
              hint="O"
              title="Open in Gmail"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              accent={accent}
            />
          );
        })()}
        <QuickAction
          icon={Trash2}
          label="Trash"
          hint="E"
          danger
          onClick={() => onAction("trash")}
          accent={accent}
          holdProgress={trashHoldProgress}
          holdColor="#f38ba8"
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(205,214,244,0.5)", padding: 4, borderRadius: 4,
            display: "inline-flex", fontFamily: "inherit",
          }}
        >
          <X size={12} />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "22px 24px 8px", flexShrink: 0 }}>
          <h1
            className="ea-display"
            style={{
              margin: 0, fontSize: 21, fontWeight: 500, color: "#fff",
              lineHeight: 1.2, letterSpacing: -0.3,
            }}
          >
            {email.subject}
          </h1>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar
              name={email.from}
              email={email.fromEmail}
              color={account?.color || accent}
              size={34}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                {email.from}
                {email.fromEmail && (
                  <span
                    style={{
                      fontSize: 11, color: "rgba(205,214,244,0.45)",
                      fontWeight: 400, marginLeft: 6,
                    }}
                  >
                    &lt;{email.fromEmail}&gt;
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11, color: "rgba(205,214,244,0.5)", marginTop: 2,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span>to me</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{timeClock(email.date)}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{timeSince(email.date)}</span>
                {account?.name && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ color: account.color }}>{account.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {showTriage && email.claude && (
          <div style={{ flexShrink: 0 }}>
            <TriagePanel email={email} accent={accent} />
          </div>
        )}

        {email._untriaged && (
          <div
            style={{
              margin: "16px 20px 0",
              borderRadius: 12, padding: "10px 14px",
              background: "linear-gradient(135deg, rgba(137,180,250,0.06), rgba(137,180,250,0.02))",
              border: "1px dashed rgba(137,180,250,0.28)",
              display: "flex", alignItems: "center", gap: 10,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "relative", display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(137,180,250,0.12)",
              }}
            >
              <span
                style={{
                  position: "absolute", inset: 4, borderRadius: 999,
                  background: "#89b4fa", opacity: 0.3,
                  animation: "livepulse 2s ease-out infinite",
                }}
              />
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "#89b4fa", boxShadow: "0 0 6px #89b4fa", position: "relative" }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 2,
                  textTransform: "uppercase", color: "#89b4fa",
                }}
              >
                Live · not yet triaged
              </div>
              <div
                className="ea-display"
                style={{
                  fontSize: 11, color: "rgba(205,214,244,0.7)", marginTop: 3,
                  fontStyle: "italic",
                }}
              >
                Arrived after your last briefing. Claude hasn't weighed in.
              </div>
            </div>
          </div>
        )}

        {/* Body split: email fills remaining space on the left; when the user
           opens Pay bill, the drawer slides in from the right via a max-width
           transition on its outer wrapper so the email iframe visibly
           narrows alongside the drawer's reveal (no jump). The inner aside
           stays at a fixed 360px width; the wrapper's overflow:hidden clips
           it while max-width animates. */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <EmailBodyPane state={bodyState} fallback={email.body || email.preview} />
          </div>
          <div
            style={{
              maxWidth: billOpen ? 360 : 0,
              flexShrink: 0,
              overflow: "hidden",
              transition: "max-width 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {billMounted && (
              <aside
                style={{
                  width: 360,
                  height: "100%",
                  display: "flex", flexDirection: "column",
                  borderLeft: "1px solid rgba(203,166,218,0.12)",
                  background: "rgba(22,22,30,0.55)",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  isolation: "isolate",
                  opacity: billOpen ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              >
                <div
                  style={{
                    padding: "11px 16px",
                    display: "flex", alignItems: "center", gap: 8,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 2,
                      textTransform: "uppercase", color: "#cba6da",
                    }}
                  >
                    Pay bill
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setBillOpen(false)}
                    aria-label="Close bill pay"
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "rgba(205,214,244,0.5)", padding: 4, borderRadius: 4,
                      display: "inline-flex", fontFamily: "inherit",
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div style={{ padding: "14px 16px 18px" }}>
                  <BillBadge
                    layout="drawer"
                    bill={email.extractedBill || {
                      payee: "",
                      amount: null,
                      due_date: "",
                      type: "expense",
                    }}
                    model={email.billModel}
                    emailSubject={email.subject}
                    emailFrom={email.from}
                    emailBody={email.body || email.preview}
                  />
                </div>
              </aside>
            )}
          </div>
        </div>

        {showDraft && email.claude?.draftReply && (
          <div style={{ flexShrink: 0, maxHeight: "45%", overflowY: "auto" }}>
            <DraftReply
              key={email.id}
              email={email}
              accent={accent}
              onSend={() => { setDrafting(false); onAction("trash"); }}
              onDiscard={() => setDrafting(false)}
            />
          </div>
        )}
      </div>

      {!drafting && !showDraft && email.claude?.draftReply && (
        <div
          style={{
            padding: "10px 20px", flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(24,24,37,0.8)",
          }}
        >
          <Sparkles size={11} color={accent} />
          <span style={{ fontSize: 11, color: "rgba(205,214,244,0.7)", flex: 1 }}>
            Claude drafted a reply.{" "}
            <span style={{ color: "rgba(205,214,244,0.45)" }}>
              Press <Kbd>R</Kbd> to review.
            </span>
          </span>
          <QuickAction icon={Reply} label="Review reply" primary onClick={() => setDrafting(true)} hint="R" accent={accent} />
        </div>
      )}
    </div>
  );
}
