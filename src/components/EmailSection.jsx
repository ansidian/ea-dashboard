import Section from "./Section";
import { urgencyStyles } from "../lib/dashboard-helpers";
import EmailBody from "./EmailBody";

export default function EmailSection({
  summary, emailAccounts, currentAccount,
  activeAccount, setActiveAccount,
  selectedEmail, setSelectedEmail,
  confirmDismissId, setConfirmDismissId, onDismiss,
  setLoadingBillId,
  emailSectionRef, model, loaded, delay, style,
}) {
  return (
    <>
      <div ref={emailSectionRef} />
      <Section title="Email Overview" delay={delay} loaded={loaded} style={style}>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 16px 0" }}>
          {summary || "No email accounts connected."}
        </p>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {emailAccounts.map((acc, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveAccount(i);
                setSelectedEmail(null);
                requestAnimationFrame(() => {
                  emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
              style={{
                background:
                  activeAccount === i
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.03)",
                border: `1px solid ${activeAccount === i ? acc.color + "66" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8,
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s ease",
                color: activeAccount === i ? "#f1f5f9" : "#94a3b8",
              }}
              onMouseEnter={(e) => {
                if (activeAccount !== i) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.color = "#e2e8f0";
                }
              }}
              onMouseLeave={(e) => {
                if (activeAccount !== i) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#94a3b8";
                }
              }}
            >
              <span style={{ fontSize: 15 }}>{acc.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                {acc.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: acc.color + "22",
                  color: acc.color,
                  padding: "2px 7px",
                  borderRadius: 20,
                }}
              >
                {acc.unread}
              </span>
            </button>
          ))}
        </div>
        {(() => {
          const carriedOver = currentAccount.important.filter(e => (e.seenCount || 1) >= 2);
          if (!carriedOver.length) return null;
          return (
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => carriedOver.forEach(e => onDismiss(e.id))}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#64748b",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.color = "#94a3b8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#64748b";
                }}
              >
                Dismiss {carriedOver.length} carried-over
              </button>
            </div>
          );
        })()}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {currentAccount.important.map((email, i) => {
            const s = urgencyStyles[email.urgency] || urgencyStyles.low;
            const isOpen = selectedEmail?.id === email.id;
            const isCarriedOver = (email.seenCount || 1) >= 2;
            return (
              <div
                key={i}
                data-email-id={email.id}
                onClick={(e) => {
                  if (isOpen && !e.target.closest("[data-email-header]")) return;
                  setSelectedEmail(isOpen ? null : email);
                }}
                style={{
                  background: isOpen
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? currentAccount.color + "33" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 8,
                  padding: "14px 16px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isOpen)
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  const btn = e.currentTarget.querySelector(".dismiss-btn");
                  if (btn) btn.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  if (!isOpen)
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  const btn = e.currentTarget.querySelector(".dismiss-btn");
                  if (btn && !isCarriedOver) btn.style.opacity = "0";
                }}
              >
                <div
                  data-email-header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    opacity: isCarriedOver ? 0.6 : 1,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        {email.from}
                      </span>
                      {isCarriedOver && (
                        <span style={{ fontSize: 10, color: "#64748b", opacity: 0.7 }}>
                          ↩ From previous
                        </span>
                      )}
                      {email.hasBill && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            color: "#818cf8",
                            background: "rgba(99,102,241,0.12)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            textTransform: "uppercase",
                          }}
                        >
                          💳 Bill
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#e2e8f0",
                        marginTop: 2,
                      }}
                    >
                      {email.subject}
                    </div>
                    {!isOpen && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {email.preview}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    {confirmDismissId === email.id ? (
                      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          className="dismiss-confirm-btn"
                          onClick={() => { onDismiss(email.id); setConfirmDismissId(null); }}
                          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#fca5a5", fontSize: 10, fontWeight: 600, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s ease" }}
                        >Dismiss</button>
                        <button
                          className="dismiss-cancel-btn"
                          onClick={() => setConfirmDismissId(null)}
                          style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1, transition: "color 0.15s ease" }}
                        >×</button>
                      </div>
                    ) : (
                      <button
                        className="dismiss-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCarriedOver) onDismiss(email.id);
                          else setConfirmDismissId(email.id);
                        }}
                        style={{
                          opacity: isCarriedOver ? 1 : 0,
                          transition: "opacity 0.15s, color 0.15s",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#64748b",
                          fontSize: 16,
                          padding: "2px 4px",
                          lineHeight: 1,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                        title="Dismiss from briefing"
                      >×</button>
                    )}
                    {email.action && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: 0.3,
                          color: s.text,
                          background: s.bg,
                          border: `1px solid ${s.border}33`,
                          padding: "4px 8px",
                          borderRadius: 6,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {email.action}
                      </div>
                    )}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transition: "transform 0.2s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
                {isOpen && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <EmailBody
                      email={email}
                      model={model}
                      onLoaded={() => {
                        setLoadingBillId(null);
                        const row = document.querySelector(
                          `[data-email-id="${email.id}"]`,
                        );
                        if (!row) return;
                        const maxScroll =
                          document.documentElement.scrollHeight -
                          window.innerHeight;
                        const rowTop =
                          row.getBoundingClientRect().top + window.scrollY;
                        if (maxScroll < rowTop) {
                          row.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        } else {
                          window.scrollTo({
                            top: document.documentElement.scrollHeight,
                            behavior: "smooth",
                          });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
