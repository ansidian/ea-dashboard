import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import { typeLabels } from "../../lib/dashboard-helpers";
import { useDashboard } from "../../context/DashboardContext";

export default function BillsSection({ loaded, delay, style, className }) {
  const {
    billEmails, totalBills, emailAccounts,
    selectedEmail, setSelectedEmail,
    setActiveAccount, loadingBillId, setLoadingBillId,
    confirmDismissId, setConfirmDismissId, handleDismiss: onDismiss,
  } = useDashboard();
  if (!billEmails.length) return null;

  return (
    <Section title="Bills Detected" delay={delay} loaded={loaded} style={style} className={className}>
      <div className="bg-accent/[0.04] border border-border-accent rounded-lg p-4 px-5">
        <div className="flex justify-between items-baseline mb-3.5">
          <span className="text-[13px] text-accent-lighter font-medium">
            {billEmails.length} payment{billEmails.length !== 1 ? "s" : ""} found
          </span>
          {totalBills > 0 && (
            <span className="text-lg font-semibold text-text-body">
              ${totalBills.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {billEmails
            .filter((e) => e.extractedBill)
            .map((email, i) => {
              const typeInfo = typeLabels[email.extractedBill.type] || typeLabels.expense;
              const billCarriedOver = (email.seenCount || 1) >= 2;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
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
                  className={cn(
                    "group flex items-center gap-3 py-2.5 px-3 bg-surface rounded cursor-pointer transition-all duration-150 hover:bg-surface-hover",
                    billCarriedOver && "opacity-60",
                  )}
                >
                  <div
                    className="w-[3px] h-6 rounded-sm"
                    style={{ background: email.accountColor }}
                  />
                  <span className="text-[13px] font-medium text-text-body flex-1">
                    {email.extractedBill.payee}
                    {billCarriedOver && (
                      <span className="text-[10px] text-text-muted opacity-70 ml-2">
                        ↩ From previous
                      </span>
                    )}
                  </span>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide rounded-sm px-[7px] py-0.5"
                    style={{
                      color: typeInfo.color,
                      background: typeInfo.color + "15",
                    }}
                  >
                    {typeInfo.label}
                  </span>
                  {email.extractedBill.amount != null ? (
                    <span className="text-[13px] font-semibold text-[#cbd5e1] min-w-[80px] text-right">
                      ${email.extractedBill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted min-w-[80px] text-right italic">
                      See email
                    </span>
                  )}
                  <span className="text-[11px] text-text-muted min-w-[50px] text-right">
                    {email.extractedBill.due_date
                      ? new Date(email.extractedBill.due_date + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "America/Los_Angeles",
                        })
                      : ""}
                  </span>
                  {loadingBillId === email.id && (
                    <div className="w-3.5 h-3.5 border-2 border-[rgba(255,255,255,0.1)] border-t-accent-light rounded-full animate-spin shrink-0" />
                  )}
                  {confirmDismissId === email.id ? (
                    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0">
                      <button
                        className="bg-danger/15 border border-danger/30 rounded-sm text-[#fca5a5] text-[10px] font-semibold px-2 py-0.5 cursor-pointer font-[inherit] transition-all duration-150"
                        onClick={() => { onDismiss(email.id); setConfirmDismissId(null); }}
                      >Dismiss</button>
                      <button
                        className="bg-transparent border-none text-text-muted text-sm cursor-pointer px-1 py-0.5 leading-none transition-colors duration-150 hover:text-text-secondary"
                        onClick={() => setConfirmDismissId(null)}
                      >×</button>
                    </div>
                  ) : (
                    <button
                      className={cn(
                        "transition-all duration-150 bg-transparent border-none cursor-pointer text-text-muted text-base px-1 py-0.5 leading-none shrink-0 hover:text-danger",
                        billCarriedOver ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (billCarriedOver) onDismiss(email.id);
                        else setConfirmDismissId(email.id);
                      }}
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
