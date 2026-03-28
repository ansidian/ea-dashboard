import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import { typeLabels } from "../../lib/dashboard-helpers";
import { MotionList, MotionItem } from "../ui/motion-wrappers";
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
      {/* Header pills */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <div
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
          style={{ background: "rgba(166,227,161,0.06)", border: "1px solid rgba(166,227,161,0.12)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a6e3a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#a6e3a1cc" }}>
            {billEmails.length}
          </span>
          <span className="text-[11px] text-muted-foreground/50">
            payment{billEmails.length !== 1 ? "s" : ""} found
          </span>
        </div>
        {totalBills > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(205,214,244,0.04)", border: "1px solid rgba(205,214,244,0.08)" }}
          >
            <span className="text-[11px] font-semibold tabular-nums text-foreground/80">
              ${totalBills.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-muted-foreground/50">total</span>
          </div>
        )}
      </div>

      {/* Bill rows */}
      <MotionList className="flex flex-col gap-1.5" loaded={loaded} delay={delay + 100} stagger={0.04}>
        {billEmails
          .filter((e) => e.extractedBill)
          .map((email, i) => {
            const typeInfo = typeLabels[email.extractedBill.type] || typeLabels.expense;
            const billCarriedOver = (email.seenCount || 1) >= 2;
            return (
              <MotionItem
                key={email.id || i}
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
                  "group relative flex items-center gap-3 py-3 px-4 pl-5 rounded-lg cursor-pointer transition-all duration-150",
                  billCarriedOver && "opacity-50",
                )}
                style={{
                  background: "rgba(36,36,58,0.4)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Hover bg */}
                <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />

                {/* Account color accent */}
                <div
                  className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                  style={{
                    background: email.accountColor,
                    opacity: billCarriedOver ? 0.3 : 0.7,
                    boxShadow: billCarriedOver ? "none" : `0 0 6px ${email.accountColor}30`,
                  }}
                />

                <span className="relative text-[13px] font-medium text-foreground/90 flex-1 min-w-0 truncate">
                  {email.extractedBill.payee}
                  {billCarriedOver && (
                    <span className="text-[10px] text-muted-foreground/40 ml-2">
                      ↩ previous
                    </span>
                  )}
                </span>
                <span
                  className="relative text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0"
                  style={{
                    color: `${typeInfo.color}cc`,
                    background: `${typeInfo.color}0d`,
                  }}
                >
                  {typeInfo.label}
                </span>
                {email.extractedBill.amount != null ? (
                  <span className="relative text-[13px] font-semibold text-foreground/80 min-w-[72px] text-right tabular-nums shrink-0">
                    ${email.extractedBill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="relative text-[11px] text-muted-foreground/40 min-w-[72px] text-right italic shrink-0">
                    See email
                  </span>
                )}
                <span className="relative text-[10px] text-muted-foreground/40 min-w-[48px] text-right tabular-nums shrink-0">
                  {email.extractedBill.due_date
                    ? new Date(email.extractedBill.due_date + "T12:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "America/Los_Angeles",
                      })
                    : ""}
                </span>
                {loadingBillId === email.id && (
                  <div className="relative w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin shrink-0" />
                )}
                {confirmDismissId === email.id ? (
                  <div onClick={(e) => e.stopPropagation()} className="relative flex items-center gap-1 shrink-0">
                    <button
                      className="rounded text-[10px] font-semibold px-2 py-0.5 cursor-pointer font-[inherit] transition-all duration-150"
                      style={{ color: "#f38ba8", background: "rgba(243,139,168,0.1)", border: "1px solid rgba(243,139,168,0.2)" }}
                      onClick={() => { onDismiss(email.id); setConfirmDismissId(null); }}
                    >Dismiss</button>
                    <button
                      className="bg-transparent border-none text-muted-foreground/40 text-sm cursor-pointer px-1 py-0.5 leading-none transition-colors duration-150 hover:text-muted-foreground"
                      onClick={() => setConfirmDismissId(null)}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    className={cn(
                      "relative transition-all duration-150 bg-transparent border-none cursor-pointer text-muted-foreground/30 px-1 py-0.5 leading-none shrink-0 hover:text-destructive",
                      billCarriedOver ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (billCarriedOver) onDismiss(email.id);
                      else setConfirmDismissId(email.id);
                    }}
                    title="Dismiss from briefing"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </MotionItem>
            );
          })}
      </MotionList>
    </Section>
  );
}
