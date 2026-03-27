import Section from "./Section";
import { typeLabels } from "../lib/dashboard-helpers";

export default function BillsSection({
  billEmails, totalBills, emailAccounts,
  selectedEmail, setSelectedEmail,
  setActiveAccount, loadingBillId, setLoadingBillId,
  confirmDismissId, setConfirmDismissId, onDismiss,
  loaded, delay, style,
}) {
  if (!billEmails.length) return null;

  return (
    <Section title="Bills Detected" delay={delay} loaded={loaded} style={style}>
      <div
        style={{
          background: "rgba(99,102,241,0.04)",
          border: "1px solid rgba(99,102,241,0.12)",
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, color: "#a5b4fc", fontWeight: 500 }}>
            {billEmails.length} payment{billEmails.length !== 1 ? "s" : ""} found
          </span>
          {totalBills > 0 && (
            <span style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>
              ${totalBills.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {billEmails
            .filter((e) => e.extractedBill)
            .map((email, i) => {
              const typeInfo = typeLabels[email.extractedBill.type] || typeLabels.expense;
              const billCarriedOver = (email.seenCount || 1) >= 2;
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (selectedEmail?.id === email.id) {
                      setSelectedEmail(null);
                      setLoadingBillId(null);
                      return;
                    }
                    setActiveAccount(email._accIdx);
                    const original = emailAccounts[email._accIdx]?.important?.find(
                      (e) => e.id === email.id,
                    );
                    setSelectedEmail(original || email);
                    setLoadingBillId(email.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "background 0.15s ease, opacity 0.15s ease",
                    opacity: billCarriedOver ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    const btn = e.currentTarget.querySelector(".dismiss-btn");
                    if (btn) btn.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    const btn = e.currentTarget.querySelector(".dismiss-btn");
                    if (btn && !billCarriedOver) btn.style.opacity = "0";
                  }}
                >
                  <div
                    style={{
                      width: 3,
                      height: 24,
                      borderRadius: 2,
                      background: email.accountColor,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#e2e8f0",
                      flex: 1,
                    }}
                  >
                    {email.extractedBill.payee}
                    {billCarriedOver && (
                      <span style={{ fontSize: 10, color: "#64748b", opacity: 0.7, marginLeft: 8 }}>
                        ↩ From previous
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: typeInfo.color,
                      background: typeInfo.color + "15",
                      padding: "2px 7px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {typeInfo.label}
                  </span>
                  {email.extractedBill.amount != null ? (
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#cbd5e1",
                        minWidth: 80,
                        textAlign: "right",
                      }}
                    >
                      ${email.extractedBill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        minWidth: 80,
                        textAlign: "right",
                        fontStyle: "italic",
                      }}
                    >
                      See email
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      minWidth: 50,
                      textAlign: "right",
                    }}
                  >
                    {email.extractedBill.due_date
                      ? new Date(email.extractedBill.due_date + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "America/Los_Angeles",
                        })
                      : ""}
                  </span>
                  {loadingBillId === email.id && (
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  )}
                  {confirmDismissId === email.id ? (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
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
                        if (billCarriedOver) onDismiss(email.id);
                        else setConfirmDismissId(email.id);
                      }}
                      style={{
                        opacity: billCarriedOver ? 1 : 0,
                        transition: "opacity 0.15s, color 0.15s",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#64748b",
                        fontSize: 16,
                        padding: "2px 4px",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                      title="Dismiss from briefing"
                    >×</button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </Section>
  );
}
