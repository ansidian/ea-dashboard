import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendToActualBudget, extractBillFromEmail } from "../../api";
import { ensureMetadataLoaded, _metadataCache } from "../../lib/actualMetadata.js";
import { formatRelativeDate } from "../../lib/dashboard-helpers";
import SearchableDropdown from "../shared/SearchableDropdown";

const typeLabels = {
  transfer: { label: "Card Payment", color: "#b4befe", icon: "\u{1F4B3}" },
  bill: { label: "Recurring Bill", color: "#a6e3a1", icon: "\u{1F4C4}" },
  expense: { label: "One-time Expense", color: "#fab387", icon: "\u{1F6D2}" },
  income: { label: "Income", color: "#89dceb", icon: "\u{1F4B0}" },
};

const typeHints = {
  transfer: "Updates upcoming transfer schedule in Actual",
  bill: "Updates upcoming schedule in Actual",
  expense: "Creates one-time transaction",
  income: "Creates one-time transaction",
};

const KNOWN_CC_FEES = {
  "socalgas": 1.50,
  "sce": 1.65,
};

function detectFee(payeeName) {
  if (!payeeName) return null;
  const lower = payeeName.toLowerCase();
  for (const [key, fee] of Object.entries(KNOWN_CC_FEES)) {
    if (lower.includes(key)) return { vendor: key, fee };
  }
  return null;
}

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

export default function BillBadge({ bill, model, emailSubject, emailFrom, emailBody }) {
  const [extractModel, setExtractModel] = useState(null);
  const effectiveModel = model || extractModel;
  const modelDisplayName = formatModelName(effectiveModel);
  const canExtract = !model && !!emailBody && !!emailSubject;
  const [extractState, setExtractState] = useState("idle"); // idle | extracting | done | error
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
  const [editScheduleName, setEditScheduleName] = useState("");
  const [actualReady, setActualReady] = useState(!!_metadataCache);
  const [feeOverride, setFeeOverride] = useState(null); // null = auto, true/false = manual
  const [customFee, setCustomFee] = useState("");

  const isTransfer = editType === "transfer";

  const pickDefaultFromAccount = (accts) =>
    accts.find(a => a.name.toLowerCase().includes("savings"))
    || accts.find(a => a.type === "checking" || a.name.toLowerCase().includes("checking"))
    || null;

  const scheduleNameFor = (accts, toAccountId) => {
    const acct = accts.find(a => a.id === toAccountId);
    return acct && /\(\d{4}\)/.test(acct.name) ? `${acct.name} Payment` : null;
  };

  const handleTypeChange = (key) => {
    setEditType(key);
    if (key === "transfer" && accounts.length) {
      if (!editFromAccount) {
        const from = pickDefaultFromAccount(accounts);
        if (from) setEditFromAccount(from.id);
      }
      const name = scheduleNameFor(accounts, editToAccount);
      if (name) setEditScheduleName(name);
    }
  };

  const handleToAccountChange = (id) => {
    setEditToAccount(id);
    if (isTransfer) {
      const name = scheduleNameFor(accounts, id);
      if (name) setEditScheduleName(name);
    }
  };

  // detect CC fee from Actual payee name or original email payee
  const resolvedPayeeName = useMemo(() => {
    if (payees.length && editPayee) {
      const match = payees.find(p => p.id === editPayee);
      if (match) return match.name;
    }
    return editPayee;
  }, [editPayee, payees]);

  const detectedFee = useMemo(() =>
    detectFee(resolvedPayeeName) || detectFee(bill.payee),
    [resolvedPayeeName, bill.payee]
  );

  const feeEnabled = feeOverride !== null ? feeOverride : !!detectedFee;
  const activeFee = detectedFee ? String(detectedFee.fee) : customFee;
  const parsedFee = feeEnabled ? (parseFloat(activeFee) || 0) : 0;
  const baseAmount = parseFloat(editAmount) || 0;
  const totalAmount = baseAmount + parsedFee;

  useEffect(() => {
    ensureMetadataLoaded((data) => {
      setAccounts(data.accounts);
      setPayees(data.payees);
      setCategories(data.categories);
      setActualReady(true);

      // Auto-select To Account for transfers by matching email payee to account name
      let matchedToId = "";
      if (bill.type === "transfer" && bill.payee && data.accounts.length) {
        const match = data.accounts.find(a =>
          a.name.toLowerCase().includes(bill.payee.toLowerCase()) ||
          bill.payee.toLowerCase().includes(a.name.toLowerCase())
        );
        if (match) {
          setEditToAccount(match.id);
          matchedToId = match.id;
        }
      }

      // Auto-select From Account + schedule name when starting in transfer mode
      if (bill.type === "transfer" && data.accounts.length) {
        const from = pickDefaultFromAccount(data.accounts);
        if (from) setEditFromAccount(from.id);
        const name = scheduleNameFor(data.accounts, matchedToId);
        if (name) setEditScheduleName(name);
      }

      // Pre-select existing payee by name match
      if (bill.payee && data.payees.length) {
        const match = data.payees.find(p => p.name.toLowerCase() === bill.payee.toLowerCase());
        if (match) setEditPayee(match.id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- bill props are stable

  const handleExtract = async (e) => {
    e.stopPropagation();
    setExtractState("extracting");
    try {
      const result = await extractBillFromEmail({
        subject: emailSubject,
        from: emailFrom,
        body: emailBody,
      });
      if (result.payee) {
        const match = payees.find(p => p.name.toLowerCase() === String(result.payee).toLowerCase());
        setEditPayee(match ? match.id : result.payee);
      }
      if (result.amount != null) setEditAmount(String(result.amount));
      if (result.due_date) setEditDue(result.due_date);
      if (result.category_id && categories.some(c => c.id === result.category_id)) {
        setEditCategory(result.category_id);
      }
      if (result.type === "transfer") {
        const toId = result.to_account_id && accounts.some(a => a.id === result.to_account_id)
          ? result.to_account_id
          : editToAccount;
        if (toId !== editToAccount) setEditToAccount(toId);
        if (!editFromAccount) {
          const from = pickDefaultFromAccount(accounts);
          if (from) setEditFromAccount(from.id);
        }
        const name = scheduleNameFor(accounts, toId);
        if (name) setEditScheduleName(name);
        setEditType("transfer");
      } else if (result.type) {
        setEditType(result.type);
      }
      setExtractModel("claude-haiku-4-5");
      setExtractState("done");
    } catch (err) {
      console.error("Bill extract failed:", err);
      setExtractState("error");
    }
  };

  const handleSend = (e) => {
    e.stopPropagation();
    setState("sending");
    const edited = {
      ...bill,
      payee: payees.find(p => p.id === editPayee)?.name || editPayee,
      amount: totalAmount,
      due_date: editDue,
      type: editType,
    };
    if (parsedFee > 0) {
      edited.notes = `$${baseAmount.toFixed(2)} + $${parsedFee.toFixed(2)} CC fee`;
    }
    if (isTransfer) {
      edited.from_account_id = editFromAccount;
      edited.to_account_id = editToAccount;
      edited.schedule_name = editScheduleName.trim();
    } else {
      edited.account_id = editAccount || undefined;
      if (editCategory) edited.category_id = editCategory;
    }
    sendToActualBudget(edited)
      .then((res) => { setSuccessMessage(res?.message || "Added to Actual Budget"); setState("sent"); })
      .catch(() => setState("error"));
  };

  const canSend = editAmount.trim() && editDue &&
    (isTransfer ? (editFromAccount && editToAccount && editScheduleName.trim()) : (editPayee.trim() && editAccount));

  // formatRelativeDate is available for future date display needs in this component
  void formatRelativeDate;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter") e.stopPropagation(); }}
      className="rounded-lg p-4 px-5 mt-3"
      style={{
        background: "rgba(203,166,218,0.06)",
        border: "1px solid rgba(203,166,218,0.1)",
      }}
    >
      {/* Type selector row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Object.entries(typeLabels).map(([key, info]) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); handleTypeChange(key); }}
            className="text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded-md cursor-pointer transition-all duration-200"
            style={{
              color: editType === key ? info.color : "rgba(205,214,244,0.3)",
              background: editType === key ? `${info.color}12` : "rgba(255,255,255,0.02)",
              border: `1px solid ${editType === key ? `${info.color}30` : "rgba(255,255,255,0.04)"}`,
            }}
          >{info.icon} {info.label}</button>
        ))}
        {effectiveModel ? (
          <span className="text-[10px] text-muted-foreground/40 ml-auto">detected by {modelDisplayName}</span>
        ) : canExtract ? (
          <button
            onClick={handleExtract}
            disabled={extractState === "extracting"}
            className={cn(
              "group ml-auto text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md cursor-pointer",
              "transition-all duration-200 ease-out",
              "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
              "disabled:cursor-wait disabled:hover:translate-y-0",
            )}
            style={
              extractState === "error"
                ? {
                    color: "#f38ba8",
                    background: "rgba(243,139,168,0.1)",
                    border: "1px solid rgba(243,139,168,0.3)",
                  }
                : {
                    color: "#ffffff",
                    background: "linear-gradient(120deg, #c88fa0 0%, #c89b85 25%, #8fb8c8 55%, #a89bc4 80%, #c88fa0 100%)",
                    backgroundSize: "240% 100%",
                    animation: `aiGradientShift ${extractState === "extracting" ? "2.5s" : "7s"} ease-in-out infinite`,
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: extractState === "extracting"
                      ? "0 0 10px rgba(168,155,196,0.35), 0 0 18px rgba(143,184,200,0.15)"
                      : "0 1px 6px rgba(168,155,196,0.2)",
                    textShadow: "0 1px 1px rgba(0,0,0,0.2)",
                  }
            }
            onMouseEnter={(e) => {
              if (extractState === "extracting" || extractState === "error") return;
              e.currentTarget.style.boxShadow = "0 2px 12px rgba(168,155,196,0.4), 0 0 20px rgba(143,184,200,0.2)";
              e.currentTarget.style.animationDuration = "4s";
            }}
            onMouseLeave={(e) => {
              if (extractState === "extracting" || extractState === "error") return;
              e.currentTarget.style.boxShadow = "0 1px 6px rgba(168,155,196,0.2)";
              e.currentTarget.style.animationDuration = "7s";
            }}
          >
            <span className="inline-flex items-center gap-1">
              <span className={cn("transition-transform duration-300", extractState !== "extracting" && "group-hover:rotate-12 group-hover:scale-110")}>
                {"\u2728"}
              </span>
              <span>
                {extractState === "extracting" ? "Extracting…" : extractState === "error" ? "Retry extract" : "Extract with Haiku"}
              </span>
            </span>
          </button>
        ) : null}
      </div>
      {/* Behavior hint */}
      <div className="text-[10px] text-muted-foreground/40 mt-1.5 italic">
        {typeHints[editType]}
      </div>

      {(state === "idle" || state === "error") && !actualReady && (
        <div className="flex items-center gap-2 py-3">
          <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
          <span className="text-[11px] text-muted-foreground/50">Loading Actual Budget data...</span>
        </div>
      )}

      {(state === "idle" || state === "error") && actualReady && (
        <>
          <div className="flex gap-3 mt-3 animate-[fadeIn_0.25s_ease]">
            {!isTransfer && (
              <div className="flex-[2]">
                <div className="text-[10px] text-muted-foreground/50 mb-1">Payee</div>
                {payees.length > 0 ? (
                  <SearchableDropdown
                    options={payees}
                    value={editPayee}
                    onChange={setEditPayee}
                    placeholder="Select payee..."
                    allowCreate
                    onCreateNew={(name) => setEditPayee(name)}
                  />
                ) : (
                  <Input value={editPayee} onChange={e => setEditPayee(e.target.value)} placeholder="e.g. Da Vien" className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium" />
                )}
              </div>
            )}
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground/50 mb-1">Amount</div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/40 pointer-events-none">$</span>
                <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" className="pl-[22px] bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium" />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground/50 mb-1">Due</div>
              <Input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium [color-scheme:dark]" />
            </div>
          </div>
          {/* Row 2: Account + Category/ToAccount — swaps based on type */}
          <div className="flex gap-3 mt-2">
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground/50 mb-1">{isTransfer ? "From Account" : "Account"}</div>
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
                  <div className="text-[10px] text-muted-foreground/50 mb-1">To Account</div>
                  <SearchableDropdown options={accounts} value={editToAccount} onChange={handleToAccountChange} placeholder="Credit card..." />
                </>
              ) : (
                <>
                  <div className="text-[10px] text-muted-foreground/50 mb-1">Category</div>
                  <SearchableDropdown options={categories} value={editCategory} onChange={setEditCategory} placeholder="Select category..." />
                </>
              )}
            </div>
          </div>
          {/* Schedule name for transfers */}
          {isTransfer && (
            <div className="flex gap-3 mt-2">
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground/50 mb-1">Schedule Name</div>
                <Input
                  value={editScheduleName}
                  onChange={e => setEditScheduleName(e.target.value)}
                  placeholder={bill.payee || "e.g. SoFi Credit Card"}
                  className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium"
                />
              </div>
            </div>
          )}
          {/* CC fee row */}
          <div className="flex items-center gap-2 mt-3 animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {feeEnabled && parsedFee > 0 ? (
                <span className="text-[11px] text-muted-foreground/60">
                  ${baseAmount.toFixed(2)} + ${parsedFee.toFixed(2)} CC fee ={" "}
                  <span className="text-[#cba6da] font-medium">${totalAmount.toFixed(2)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground/40">CC processing fee</span>
              )}
              {feeEnabled && !detectedFee && (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/40 pointer-events-none">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={customFee}
                    onChange={e => setCustomFee(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder="0.00"
                    className="w-[72px] pl-[18px] pr-2 py-0.5 rounded-md text-[11px] font-medium bg-input-bg border border-white/[0.08] text-foreground outline-none focus:border-[#cba6da]/40"
                  />
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFeeOverride(!feeEnabled); }}
              className="relative w-[32px] h-[16px] rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer"
              style={{
                background: feeEnabled ? "rgba(203,166,218,0.35)" : "rgba(255,255,255,0.08)",
              }}
              aria-label="Toggle CC fee"
            >
              <span
                className="absolute top-[2px] w-[12px] h-[12px] rounded-full transition-all duration-200"
                style={{
                  left: feeEnabled ? "16px" : "3px",
                  background: feeEnabled ? "#cba6da" : "rgba(205,214,244,0.3)",
                }}
              />
            </button>
          </div>

          <div className="mt-2">
            {state === "error" && <div className="text-[11px] text-[#f38ba8] mb-1.5">Failed to send — check fields and try again.</div>}
            <Button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send to Actual Budget"
              className={cn(
                "w-full gap-1.5 text-xs font-semibold transition-all duration-200",
                canSend
                  ? "bg-[#cba6da] text-[#1e1e2e] border-none hover:bg-[#d4b3e2] hover:-translate-y-px active:translate-y-0"
                  : "bg-[#cba6da]/20 text-muted-foreground border-none cursor-not-allowed"
              )}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Send to Actual Budget
            </Button>
          </div>
        </>
      )}

      {state === "sending" && (
        <div className="flex items-center justify-center gap-2 p-2 px-4 mt-3 rounded-md"
          style={{ background: "rgba(203,166,218,0.06)", border: "1px solid rgba(203,166,218,0.1)" }}
        >
          <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
          <span className="text-[11px] text-[#cba6da] font-medium">Syncing with Actual Budget…</span>
        </div>
      )}
      {state === "sent" && (
        <div className="flex items-center justify-center gap-1.5 p-2 px-4 mt-3 rounded-md"
          style={{ background: "rgba(166,227,161,0.06)", border: "1px solid rgba(166,227,161,0.15)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a6e3a1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          <span className="text-[11px] font-semibold" style={{ color: "#a6e3a1" }}>{successMessage}</span>
        </div>
      )}
    </div>
  );
}
