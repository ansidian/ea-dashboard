import { useState, useEffect } from "react";
import { sendToActualBudget } from "../api";
import { ensureMetadataLoaded, _metadataCache } from "../lib/actualMetadata.js";
import SearchableDropdown from "./SearchableDropdown";
import "./BillBadge.css";

const typeLabels = {
  transfer: { label: "Card Payment", color: "#818cf8", icon: "💳" },
  bill: { label: "Recurring Bill", color: "#34d399", icon: "📄" },
  expense: { label: "One-time Expense", color: "#f97316", icon: "🛒" },
  income: { label: "Income", color: "#22d3ee", icon: "💰" },
};

const typeHints = {
  transfer: "Updates upcoming transfer schedule in Actual",
  bill: "Updates upcoming schedule in Actual",
  expense: "Creates one-time transaction",
  income: "Creates one-time transaction",
};

function formatModelName(model) {
  if (!model) return "Claude";
  // Extract family and version: "claude-sonnet-4-6" → "Sonnet 4.6"
  const match = model.match(/(opus|sonnet|haiku)-(\d+)-?(\d+)?/i);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const version = match[3] ? `${match[2]}.${match[3]}` : match[2];
    return `${family} ${version}`;
  }
  return "Claude";
}

function parseDueDate(dateStr) {
  // Handle both "2026-03-30" and "2026-03-30T06:59:59Z" formats
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDueDate(dateStr);
  const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `Overdue (${Math.abs(diff)}d)`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 6) return due.toLocaleDateString("en-US", { weekday: "long" });
  return due.toLocaleDateString("en-US", { month: "long", day: "numeric" });
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
    <div onClick={(e) => e.stopPropagation()} className="bill-badge-root">
      {/* Type selector row */}
      <div className="bill-badge-type-row">
        {Object.entries(typeLabels).map(([key, info]) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); setEditType(key); }}
            className="bill-badge-type-btn"
            style={{
              color: editType === key ? info.color : "#64748b",
              background: editType === key ? info.color + "18" : "rgba(255,255,255,0.03)",
              border: `1px solid ${editType === key ? info.color + "40" : "rgba(255,255,255,0.06)"}`,
            }}
          >{info.icon} {info.label}</button>
        ))}
        <span className="bill-badge-model">detected by {modelDisplayName}</span>
      </div>
      {/* Behavior hint */}
      <div className="bill-badge-hint">
        {typeHints[editType]}
      </div>

      {(state === "idle" || state === "error") && !actualReady && (
        <div className="bill-badge-metadata-loading">
          <div className="bill-badge-spinner" />
          <span style={{ fontSize: 12, color: "#64748b" }}>Loading Actual Budget data...</span>
        </div>
      )}

      {(state === "idle" || state === "error") && actualReady && (
        <>
          <div className="bill-badge-fields">
            {!isTransfer && (
              <div style={{ flex: 2 }}>
                <div className="bill-badge-field-label">Payee</div>
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
                  <input value={editPayee} onChange={e => setEditPayee(e.target.value)} placeholder="e.g. Da Vien" className="bill-badge-input" />
                )}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div className="bill-badge-field-label">Amount</div>
              <div className="bill-badge-amount-wrap">
                <span className="bill-badge-dollar">$</span>
                <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" className="bill-badge-input" style={{ paddingLeft: 22 }} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="bill-badge-field-label">Due</div>
              <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="bill-badge-input" style={{ colorScheme: "dark" }} />
            </div>
          </div>
          {/* Row 2: Account + Category/ToAccount — swaps based on type */}
          <div className="bill-badge-fields-row2">
            <div style={{ flex: 1 }}>
              <div className="bill-badge-field-label">{isTransfer ? "From Account" : "Account"}</div>
              <SearchableDropdown
                options={accounts}
                value={isTransfer ? editFromAccount : editAccount}
                onChange={isTransfer ? setEditFromAccount : setEditAccount}
                placeholder={isTransfer ? "Payment source..." : "Select account..."}
              />
            </div>
            <div style={{ flex: 1 }}>
              {isTransfer ? (
                <>
                  <div className="bill-badge-field-label">To Account</div>
                  <SearchableDropdown options={accounts} value={editToAccount} onChange={setEditToAccount} placeholder="Credit card..." />
                </>
              ) : (
                <>
                  <div className="bill-badge-field-label">Category</div>
                  <SearchableDropdown options={categories} value={editCategory} onChange={setEditCategory} placeholder="Select category..." />
                </>
              )}
            </div>
          </div>
          <div className="bill-badge-actions">
            {state === "error" && <div className="bill-badge-error">Failed to send — check fields and try again.</div>}
            <button onClick={handleSend} disabled={!canSend} className="bill-send-btn" style={{ background: canSend ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(99,102,241,0.2)", color: canSend ? "#fff" : "#64748b", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center", transition: "all 0.2s ease" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Send to Actual Budget</button>
          </div>
        </>
      )}

      {state === "sending" && <div className="bill-badge-loading"><div className="bill-badge-spinner" /><span style={{ fontSize: 12, color: "#a5b4fc" }}>Syncing with Actual Budget…</span></div>}
      {state === "sent" && <div className="bill-badge-success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg><span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>{successMessage}</span></div>}
    </div>
  );
}
