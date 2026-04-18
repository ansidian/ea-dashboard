import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CreditCard, FileText, ShoppingCart, Wallet, Sparkles, Plus, Check,
} from "lucide-react";
import { sendToActualBudget, extractBillFromEmail } from "../../api";
import { ensureMetadataLoaded, _metadataCache } from "../../lib/actualMetadata.js";
import { formatRelativeDate } from "../../lib/dashboard-helpers";
import SearchableDropdown from "../shared/SearchableDropdown";

const typeLabels = {
  transfer: { label: "Card", color: "#b4befe", Icon: CreditCard },
  bill: { label: "Bill", color: "#a6e3a1", Icon: FileText },
  expense: { label: "Expense", color: "#fab387", Icon: ShoppingCart },
  income: { label: "Income", color: "#89dceb", Icon: Wallet },
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

export default function BillBadge({ bill, model, emailSubject, emailFrom, emailBody, layout = "inline" }) {
  const isDrawer = layout === "drawer";
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
      className={isDrawer ? "px-0 py-0" : "rounded-xl px-4 py-3"}
      style={isDrawer ? undefined : {
        background: "rgba(203,166,218,0.04)",
        border: "1px solid rgba(203,166,218,0.1)",
      }}
    >
      {/* Header: type pills. In drawer mode the Extract button drops to its
         own row below; in inline mode it sits right-aligned on the pill row. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Object.entries(typeLabels).map(([key, info]) => {
          const Icon = info.Icon;
          const selected = editType === key;
          return (
            <button
              key={key}
              onClick={(e) => { e.stopPropagation(); handleTypeChange(key); }}
              className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide px-2 py-1 rounded-md cursor-pointer transition-all duration-200"
              style={{
                color: selected ? info.color : "rgba(205,214,244,0.45)",
                background: selected ? `${info.color}14` : "rgba(255,255,255,0.02)",
                border: `1px solid ${selected ? `${info.color}38` : "rgba(255,255,255,0.04)"}`,
              }}
            >
              <Icon size={11} strokeWidth={2} />
              <span>{info.label}</span>
            </button>
          );
        })}
        {!isDrawer && (
          <span className="text-[10px] text-muted-foreground/40 italic ml-1 truncate">
            {typeHints[editType]}
          </span>
        )}
        {!isDrawer && effectiveModel ? (
          <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">detected by {modelDisplayName}</span>
        ) : !isDrawer && canExtract ? (
          <ExtractButton
            extractState={extractState}
            onClick={handleExtract}
            className="ml-auto"
          />
        ) : null}
      </div>
      {isDrawer && (
        <div className="text-[10px] text-muted-foreground/45 italic mt-1.5">
          {typeHints[editType]}
        </div>
      )}
      {isDrawer && (effectiveModel ? (
        <div className="text-[10px] text-muted-foreground/40 mt-2 text-right">
          detected by {modelDisplayName}
        </div>
      ) : canExtract ? (
        <div className="mt-3">
          <ExtractButton
            extractState={extractState}
            onClick={handleExtract}
            className="w-full justify-center"
            variant="block"
          />
        </div>
      ) : null)}

      {(state === "idle" || state === "error") && !actualReady && (
        <div className="flex items-center gap-2 py-3">
          <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
          <span className="text-[11px] text-muted-foreground/50">Loading Actual Budget data...</span>
        </div>
      )}

      {(state === "idle" || state === "error") && actualReady && (
        <>
          {/* Form rows. Drawer mode stacks everything vertically (narrow column);
             inline mode uses a 3-up grid for the top row to save vertical space. */}
          {isDrawer ? (
            <div className="flex flex-col gap-2.5 mt-3 animate-[fadeIn_0.25s_ease]">
              {!isTransfer ? (
                <FieldShell label="Payee">
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
                    <Input value={editPayee} onChange={e => setEditPayee(e.target.value)} placeholder="e.g. Da Vien" className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium h-8" />
                  )}
                </FieldShell>
              ) : (
                <FieldShell label="From Account">
                  <SearchableDropdown
                    options={accounts}
                    value={editFromAccount}
                    onChange={setEditFromAccount}
                    placeholder="Payment source..."
                  />
                </FieldShell>
              )}
              <div className="grid grid-cols-2 gap-2">
                <FieldShell label="Amount">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/40 pointer-events-none">$</span>
                    <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" className="pl-[22px] bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium h-8" />
                  </div>
                </FieldShell>
                <FieldShell label="Due">
                  <Input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium [color-scheme:dark] h-8" />
                </FieldShell>
              </div>
              {!isTransfer ? (
                <>
                  <FieldShell label="Account">
                    <SearchableDropdown
                      options={accounts}
                      value={editAccount}
                      onChange={setEditAccount}
                      placeholder="Select account..."
                    />
                  </FieldShell>
                  <FieldShell label="Category">
                    <SearchableDropdown options={categories} value={editCategory} onChange={setEditCategory} placeholder="Select category..." />
                  </FieldShell>
                </>
              ) : (
                <>
                  <FieldShell label="To Account">
                    <SearchableDropdown options={accounts} value={editToAccount} onChange={handleToAccountChange} placeholder="Credit card..." />
                  </FieldShell>
                  <FieldShell label="Schedule Name">
                    <Input
                      value={editScheduleName}
                      onChange={e => setEditScheduleName(e.target.value)}
                      placeholder={bill.payee || "e.g. SoFi Credit Card"}
                      className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium h-8"
                    />
                  </FieldShell>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Inline mode: dense 3-col then 2-col grids */}
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 mt-2.5 animate-[fadeIn_0.25s_ease]">
                {!isTransfer ? (
                  <FieldShell label="Payee">
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
                      <Input value={editPayee} onChange={e => setEditPayee(e.target.value)} placeholder="e.g. Da Vien" className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium h-8" />
                    )}
                  </FieldShell>
                ) : (
                  <FieldShell label="From Account">
                    <SearchableDropdown
                      options={accounts}
                      value={editFromAccount}
                      onChange={setEditFromAccount}
                      placeholder="Payment source..."
                    />
                  </FieldShell>
                )}
                <FieldShell label="Amount">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/40 pointer-events-none">$</span>
                    <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" className="pl-[22px] bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium h-8" />
                  </div>
                </FieldShell>
                <FieldShell label="Due">
                  <Input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium [color-scheme:dark] h-8" />
                </FieldShell>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {!isTransfer ? (
                  <>
                    <FieldShell label="Account">
                      <SearchableDropdown
                        options={accounts}
                        value={editAccount}
                        onChange={setEditAccount}
                        placeholder="Select account..."
                      />
                    </FieldShell>
                    <FieldShell label="Category">
                      <SearchableDropdown options={categories} value={editCategory} onChange={setEditCategory} placeholder="Select category..." />
                    </FieldShell>
                  </>
                ) : (
                  <>
                    <FieldShell label="To Account">
                      <SearchableDropdown options={accounts} value={editToAccount} onChange={handleToAccountChange} placeholder="Credit card..." />
                    </FieldShell>
                    <FieldShell label="Schedule Name">
                      <Input
                        value={editScheduleName}
                        onChange={e => setEditScheduleName(e.target.value)}
                        placeholder={bill.payee || "e.g. SoFi Credit Card"}
                        className="bg-input-bg border-white/[0.08] text-foreground text-[13px] font-medium h-8"
                      />
                    </FieldShell>
                  </>
                )}
              </div>
            </>
          )}

          {/* Footer. Inline mode packs toggle + label + Send button on one row.
             Drawer mode stacks: CC fee row on top, Send button on its own line
             below so the primary CTA is always a full-width tap target. */}
          {isDrawer ? (
            <>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); setFeeOverride(!feeEnabled); }}
                  className="relative w-[28px] h-[14px] rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer"
                  style={{
                    background: feeEnabled ? "rgba(203,166,218,0.35)" : "rgba(255,255,255,0.08)",
                  }}
                  aria-label="Toggle CC fee"
                >
                  <span
                    className="absolute top-[2px] w-[10px] h-[10px] rounded-full transition-all duration-200"
                    style={{
                      left: feeEnabled ? "15px" : "3px",
                      background: feeEnabled ? "#cba6da" : "rgba(205,214,244,0.3)",
                    }}
                  />
                </button>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {feeEnabled && parsedFee > 0 ? (
                    <span className="text-[10px] text-muted-foreground/60 truncate">
                      ${baseAmount.toFixed(2)} + ${parsedFee.toFixed(2)} = {" "}
                      <span className="text-[#cba6da] font-medium">${totalAmount.toFixed(2)}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/45 truncate">CC processing fee</span>
                  )}
                  {feeEnabled && !detectedFee && (
                    <div className="relative shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40 pointer-events-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={customFee}
                        onChange={e => setCustomFee(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="0.00"
                        className="w-[68px] pl-[16px] pr-2 h-[22px] rounded-md text-[10px] font-medium bg-input-bg border border-white/[0.08] text-foreground outline-none focus:border-[#cba6da]/40"
                      />
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send to Actual Budget"
                className={cn(
                  "w-full h-9 mt-3 gap-1.5 text-[12px] font-semibold transition-all duration-200",
                  canSend
                    ? "bg-[#cba6da] text-[#1e1e2e] border-none hover:bg-[#d4b3e2] hover:-translate-y-px active:translate-y-0"
                    : "bg-[#cba6da]/20 text-muted-foreground border-none cursor-not-allowed"
                )}
              >
                <Plus size={14} strokeWidth={2.5} />
                Send to Actual Budget
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={(e) => { e.stopPropagation(); setFeeOverride(!feeEnabled); }}
                className="relative w-[28px] h-[14px] rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer"
                style={{
                  background: feeEnabled ? "rgba(203,166,218,0.35)" : "rgba(255,255,255,0.08)",
                }}
                aria-label="Toggle CC fee"
              >
                <span
                  className="absolute top-[2px] w-[10px] h-[10px] rounded-full transition-all duration-200"
                  style={{
                    left: feeEnabled ? "15px" : "3px",
                    background: feeEnabled ? "#cba6da" : "rgba(205,214,244,0.3)",
                  }}
                />
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {feeEnabled && parsedFee > 0 ? (
                  <span className="text-[10px] text-muted-foreground/60 truncate">
                    ${baseAmount.toFixed(2)} + ${parsedFee.toFixed(2)} CC fee ={" "}
                    <span className="text-[#cba6da] font-medium">${totalAmount.toFixed(2)}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/45 truncate">CC processing fee</span>
                )}
                {feeEnabled && !detectedFee && (
                  <div className="relative shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40 pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customFee}
                      onChange={e => setCustomFee(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="0.00"
                      className="w-[68px] pl-[16px] pr-2 h-[22px] rounded-md text-[10px] font-medium bg-input-bg border border-white/[0.08] text-foreground outline-none focus:border-[#cba6da]/40"
                    />
                  </div>
                )}
              </div>
              <Button
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send to Actual Budget"
                className={cn(
                  "h-8 px-4 gap-1.5 text-[11px] font-semibold transition-all duration-200 shrink-0",
                  canSend
                    ? "bg-[#cba6da] text-[#1e1e2e] border-none hover:bg-[#d4b3e2] hover:-translate-y-px active:translate-y-0"
                    : "bg-[#cba6da]/20 text-muted-foreground border-none cursor-not-allowed"
                )}
              >
                <Plus size={13} strokeWidth={2.5} />
                Send to Actual
              </Button>
            </div>
          )}
          {state === "error" && (
            <div className="text-[11px] text-[#f38ba8] mt-1.5">Failed to send — check fields and try again.</div>
          )}
        </>
      )}

      {state === "sending" && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 mt-2 rounded-md"
          style={{ background: "rgba(203,166,218,0.06)", border: "1px solid rgba(203,166,218,0.1)" }}
        >
          <div className="w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
          <span className="text-[11px] text-[#cba6da] font-medium">Syncing with Actual Budget…</span>
        </div>
      )}
      {state === "sent" && (
        <div className="flex items-center justify-center gap-1.5 px-4 py-1.5 mt-2 rounded-md"
          style={{ background: "rgba(166,227,161,0.06)", border: "1px solid rgba(166,227,161,0.15)" }}
        >
          <Check size={13} strokeWidth={2.5} color="#a6e3a1" />
          <span className="text-[11px] font-semibold" style={{ color: "#a6e3a1" }}>{successMessage}</span>
        </div>
      )}
    </div>
  );
}

// Tiny field wrapper so the form grid stays readable — label + child in a
// single stacked cell. Keeps the label styling in one place and removes
// repetition from each of the 5+ form slots.
function FieldShell({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1 font-semibold">{label}</div>
      {children}
    </div>
  );
}

// Gradient-animated "Extract with Haiku" CTA. Shared by the inline and drawer
// layouts — inline renders it compact and right-aligned; drawer renders it
// full-width (`variant="block"`) so it reads as a primary first-step CTA
// beneath the type pills.
function ExtractButton({ extractState, onClick, className, variant = "pill" }) {
  const isBlock = variant === "block";
  const label =
    extractState === "extracting"
      ? "Extracting…"
      : extractState === "error"
      ? "Retry extract"
      : "Extract with Haiku";
  return (
    <button
      onClick={onClick}
      disabled={extractState === "extracting"}
      className={cn(
        "group cursor-pointer inline-flex items-center justify-center gap-1.5",
        "font-bold tracking-wider uppercase rounded-md",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        "disabled:cursor-wait disabled:hover:translate-y-0",
        isBlock ? "text-[11px] px-4 py-2 w-full" : "text-[10px] px-2.5 py-1 shrink-0",
        className,
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
              background:
                "linear-gradient(120deg, #c88fa0 0%, #c89b85 25%, #8fb8c8 55%, #a89bc4 80%, #c88fa0 100%)",
              backgroundSize: "240% 100%",
              animation: `aiGradientShift ${extractState === "extracting" ? "2.5s" : "7s"} ease-in-out infinite`,
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow:
                extractState === "extracting"
                  ? "0 0 10px rgba(168,155,196,0.35), 0 0 18px rgba(143,184,200,0.15)"
                  : "0 1px 6px rgba(168,155,196,0.2)",
              textShadow: "0 1px 1px rgba(0,0,0,0.2)",
            }
      }
      onMouseEnter={(e) => {
        if (extractState === "extracting" || extractState === "error") return;
        e.currentTarget.style.boxShadow =
          "0 2px 12px rgba(168,155,196,0.4), 0 0 20px rgba(143,184,200,0.2)";
        e.currentTarget.style.animationDuration = "4s";
      }}
      onMouseLeave={(e) => {
        if (extractState === "extracting" || extractState === "error") return;
        e.currentTarget.style.boxShadow = "0 1px 6px rgba(168,155,196,0.2)";
        e.currentTarget.style.animationDuration = "7s";
      }}
    >
      <span
        className={cn(
          "inline-flex transition-transform duration-300",
          extractState !== "extracting" && "group-hover:rotate-12 group-hover:scale-110",
        )}
      >
        <Sparkles size={isBlock ? 13 : 11} strokeWidth={2} />
      </span>
      <span>{label}</span>
    </button>
  );
}
