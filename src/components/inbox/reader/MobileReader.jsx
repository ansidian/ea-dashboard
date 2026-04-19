import {
  ArrowLeft,
  Clock,
  CreditCard,
  ExternalLink,
  Mail,
  MailOpen,
  Pin,
  Trash2,
} from "lucide-react";
import { getGmailUrl } from "../../../lib/email-links";
import { timeClock, timeSince } from "../helpers";
import { Avatar, QuickAction } from "../primitives";
import SnoozePicker from "../SnoozePicker";
import BillBadge from "../../bills/BillBadge";
import TriagePanel from "./TriagePanel";
import EmailBodyPane from "./EmailBodyPane";
import DraftReply from "./DraftReply";
import { MobileSection } from "./ReaderShared";

export default function MobileReader({
  email,
  account,
  accent,
  pinned,
  onAction,
  onClose,
  showTriage,
  billOpen,
  setBillOpen,
  trashHoldProgress,
  snoozeHoldProgress,
  snoozeBtnRef,
  snoozeOpen,
  setSnoozeOpen,
  bodyState,
  drafting,
  setDrafting,
}) {
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
              onClick={() => setSnoozeOpen((value) => !value)}
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
            onToggle={() => setBillOpen((value) => !value)}
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
            onToggle={() => setDrafting((value) => !value)}
            testId="inbox-mobile-draft-section"
          >
            <DraftReply
              key={email.id}
              email={email}
              accent={accent}
              onSend={() => {
                setDrafting(false);
                onAction("trash");
              }}
              onDiscard={() => setDrafting(false)}
            />
          </MobileSection>
        )}

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}
