import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendToActualBudget } from "../../api";
import { ensureMetadataLoaded, _metadataCache } from "../../lib/actualMetadata.js";
import { formatRelativeDate } from "../../lib/dashboard-helpers";
import SearchableDropdown from "../shared/SearchableDropdown";

const typeLabels = {
  transfer: { label: "Card Payment", color: "#818cf8", icon: "\u{1F4B3}" },
  bill: { label: "Recurring Bill", color: "#34d399", icon: "\u{1F4C4}" },
  expense: { label: "One-time Expense", color: "#f97316", icon: "\u{1F6D2}" },
  income: { label: "Income", color: "#22d3ee", icon: "\u{1F4B0}" },
};

const typeHints = {
  transfer: "Updates upcoming transfer schedule in Actual",
  bill: "Updates upcoming schedule in Actual",
  expense: "Creates one-time transaction",
  income: "Creates one-time transaction",
};

function formatModelName(model) {
  if (!model) return "Claude";
  const match = model.match(/(opus|sonnet|haiku)-(\d+)-?(\d+)?/i);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const version = match[3] ? `${match[2]}.${match[3]}` : match[2];
    return `${family} ${version}`;
  }
  return "Claude";
}

export default function BillBadge({ bill, model }) {
  const modelDisplayName = formatModelName(model);
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [successMessage, setSuccessMessage] = useState("");
  const [editPayee, setEditPayee] = useState(bill.payee || "");
  const [editAmount, setEditAmount] = useState(bill.amount != null ? String(bill.amount) : "");
  const [editDue, setEditDue] = useState(bill.due_date || "");
  const [editType, setEditType] = useState(bill.type || "expense");
  const [accounts, setAccounts] = useState(_metadataCache?.accounts || []);
  const [payees, setPayees] = useState(_metadataCache?.payees || []);
  const [categories, setCategories] = useState(_metadataCache?.categories || []);
  const [editAccount, setEditAccount] = useState("");
  const [editCategory, setEditCategory] = useState(bill.category_id || "");
  const [editFromAccount, setEditFromAccount] = useState("");
  const [editToAccount, setEditToAccount] = useState("");
  const [actualReady, setActualReady] = useState(!!_metadataCache);

  const isTransfer = editType === "transfer";

  useEffect(() => {
    ensureMetadataLoaded((data) => {
      setAccounts(data.accounts);
      setPayees(data.payees);
      setCategories(data.categories);
      setActualReady(true);

      // Auto-select accounts for transfers
      if (bill.type === "transfer" && data.accounts.length) {
        const checking = data.accounts.find(a => a.type === "checking" || a.name.toLowerCase().includes("checking"));
        if (checking) setEditFromAccount(checking.id);
        if (bill.payee) {
          const match = data.accounts.find(a =>
            a.name.toLowerCase().includes(bill.payee.toLowerCase()) ||
            bill.payee.toLowerCase().includes(a.name.toLowerCase())
          );
          if (match) setEditToAccount(match.id);
        }
      }

      // Pre-select existing payee by name match
      if (bill.payee && data.payees.length) {
        const match = data.payees.find(p => p.name.toLowerCase() === bill.payee.toLowerCase());
        if (match) setEditPayee(match.id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- bill props are stable

  const handleSend = (e) => {
    e.stopPropagation();
    setState("sending");
    const edited = {
      ...bill,
      payee: payees.find(p => p.id === editPayee)?.name || editPayee,
      amount: parseFloat(editAmount) || 0,
      due_date: editDue,
      type: editType,
    };
    if (isTransfer) {
      edited.from_account_id = editFromAccount;
      edited.to_account_id = editToAccount;
    } else {
      edited.account_id = editAccount || undefined;
      if (editCategory) edited.category_id = editCategory;
    }
    sendToActualBudget(edited)
      .then((res) => { setSuccessMessage(res?.message || "Added to Actual Budget"); setState("sent"); })
      .catch(() => setState("error"));
  };

  const canSend = editAmount.trim() && editDue &&
    (isTransfer ? (editFromAccount && editToAccount) : (editPayee.trim() && editAccount));

  // formatRelativeDate is available for future date display needs in this component
  void formatRelativeDate;

  return (
    <div onClick={(e) => e.stopPropagation()} className="bg-[rgba(99,102,241,0.06)] border border-[rgba(99,102,241,0.15)] rounded-lg p-3 px-4 mt-3">
      {/* Type selector row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Object.entries(typeLabels).map(([key, info]) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); setEditType(key); }}
            className="text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded-md cursor-pointer transition-all duration-200"
            style={{
              color: editType === key ? info.color : "#64748b",
              background: editType === key ? info.color + "18" : "rgba(255,255,255,0.03)",
              border: `1px solid ${editType === key ? info.color + "40" : "rgba(255,255,255,0.06)"}`,
            }}
          >{info.icon} {info.label}</button>
        ))}
        <span className="text-[11px] text-text-secondary ml-auto">detected by {modelDisplayName}</span>
      </div>
      {/* Behavior hint */}
      <div className="text-[11px] text-text-muted mt-1.5 italic">
        {typeHints[editType]}
      </div>

      {(state === "idle" || state === "error") && !actualReady && (
        <div className="flex items-center gap-2 py-3">
          <div className="w-3.5 h-3.5 border-2 border-[rgba(99,102,241,0.3)] border-t-accent-light rounded-full animate-spin" />
          <span className="text-xs text-text-muted">Loading Actual Budget data...</span>
        </div>
      )}

      {(state === "idle" || state === "error") && actualReady && (
        <>
          <div className="flex gap-3 mt-3 animate-[fadeIn_0.25s_ease]">
            {!isTransfer && (
              <div className="flex-[2]">
                <div className="text-[11px] text-text-muted mb-1">Payee</div>
                {payees.length > 0 ? (
                  <SearchableDropdown
                    options={payees}
                    value={editPayee}
                    onChange={setEditPayee}
                    placeholder="Select or create payee..."
                    allowCreate
                    onCreateNew={(name) => setEditPayee(name)}
                  />
                ) : (
                  <Input value={editPayee} onChange={e => setEditPayee(e.target.value)} placeholder="e.g. Da Vien" className="bg-[rgba(255,255,255,0.06)] border-[rgba(99,102,241,0.2)] text-text-body text-[13px] font-medium" />
                )}
              </div>
            )}
            <div className="flex-1">
              <div className="text-[11px] text-text-muted mb-1">Amount</div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted pointer-events-none">$</span>
                <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" className="pl-[22px] bg-[rgba(255,255,255,0.06)] border-[rgba(99,102,241,0.2)] text-text-body text-[13px] font-medium" />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-text-muted mb-1">Due</div>
              <Input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="bg-[rgba(255,255,255,0.06)] border-[rgba(99,102,241,0.2)] text-text-body text-[13px] font-medium [color-scheme:dark]" />
            </div>
          </div>
          {/* Row 2: Account + Category/ToAccount — swaps based on type */}
          <div className="flex gap-3 mt-2">
            <div className="flex-1">
              <div className="text-[11px] text-text-muted mb-1">{isTransfer ? "From Account" : "Account"}</div>
              <SearchableDropdown
                options={accounts}
                value={isTransfer ? editFromAccount : editAccount}
                onChange={isTransfer ? setEditFromAccount : setEditAccount}
                placeholder={isTransfer ? "Payment source..." : "Select account..."}
              />
            </div>
            <div className="flex-1">
              {isTransfer ? (
                <>
                  <div className="text-[11px] text-text-muted mb-1">To Account</div>
                  <SearchableDropdown options={accounts} value={editToAccount} onChange={setEditToAccount} placeholder="Credit card..." />
                </>
              ) : (
                <>
                  <div className="text-[11px] text-text-muted mb-1">Category</div>
                  <SearchableDropdown options={categories} value={editCategory} onChange={setEditCategory} placeholder="Select category..." />
                </>
              )}
            </div>
          </div>
          <div className="mt-3">
            {state === "error" && <div className="text-[11px] text-[#fca5a5] mb-1.5">Failed to send — check fields and try again.</div>}
            <Button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send to Actual Budget"
              className={cn(
                "w-full gap-1.5 text-xs font-semibold transition-all duration-200",
                canSend
                  ? "bg-gradient-to-br from-accent to-accent-secondary text-white border-none hover:brightness-115 hover:-translate-y-px hover:shadow-hover active:translate-y-0 active:shadow-none"
                  : "bg-[rgba(99,102,241,0.2)] text-text-muted border-none cursor-not-allowed"
              )}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Send to Actual Budget
            </Button>
          </div>
        </>
      )}

      {state === "sending" && (
        <div className="flex items-center justify-center gap-2 p-2 px-4 mt-3 bg-[rgba(99,102,241,0.1)] rounded">
          <div className="w-3.5 h-3.5 border-2 border-[rgba(99,102,241,0.3)] border-t-accent-light rounded-full animate-spin" />
          <span className="text-xs text-accent-lighter">Syncing with Actual Budget…</span>
        </div>
      )}
      {state === "sent" && (
        <div className="flex items-center justify-center gap-1.5 p-2 px-4 mt-3 bg-[rgba(52,211,153,0.08)] border border-[rgba(52,211,153,0.2)] rounded">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          <span className="text-xs text-success font-semibold">{successMessage}</span>
        </div>
      )}
    </div>
  );
}
