import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import { typeLabels } from "../../lib/dashboard-helpers";
import { MotionList, MotionItem } from "../ui/motion-wrappers";
import { useDashboard } from "../../context/DashboardContext";
import { useState, useEffect, useRef } from "react";

const LOADING_MESSAGES = [
  "Pulling in bills from Actual...",
  "Asking Actual nicely...",
  "Crunching the numbers...",
  "Fetching the damage...",
  "Rounding up the usual suspects...",
  "Shaking the budget tree...",
  "Checking what you owe the universe...",
  "Consulting the financial oracle...",
  "Counting your obligations...",
  "Seeing who wants your money...",
];

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatAmount(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function daysLabel(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
}

function urgencyColor(days) {
  if (days === null) return { accent: "#6c7086", text: "rgba(205,214,244,0.5)", bg: "rgba(205,214,244,0.04)" };
  if (days < 0) return { accent: "#f38ba8", text: "#f38ba8", bg: "rgba(243,139,168,0.1)" };
  if (days === 0) return { accent: "#f97316", text: "#f97316", bg: "rgba(249,115,22,0.1)" };
  if (days === 1) return { accent: "#fab387", text: "#fab387", bg: "rgba(250,179,135,0.1)" };
  if (days <= 3) return { accent: "#f9e2af", text: "#f9e2afcc", bg: "rgba(249,226,175,0.08)" };
  return { accent: "#a6e3a1", text: "rgba(205,214,244,0.5)", bg: "rgba(205,214,244,0.04)" };
}

export default function BillsPaymentsSection({ bills, billsLoading: billsLoadingProp, actualConfigured: actualConfiguredProp, loaded, delay, className }) {
  // in mock mode, simulate loading for 8s then stop
  const isMock = new URLSearchParams(window.location.search).has("mock");
  const [mockLoading, setMockLoading] = useState(true);
  useEffect(() => {
    if (!isMock) return;
    const timer = setTimeout(() => setMockLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [isMock]);
  const billsLoading = isMock ? mockLoading : billsLoadingProp;
  const actualConfigured = isMock ? true : actualConfiguredProp;

  const [shuffled] = useState(() => shuffleArray(LOADING_MESSAGES));
  const [loadingMsg, setLoadingMsg] = useState(() => shuffled[0]);
  const [fadingOut, setFadingOut] = useState(false);
  const indexRef = useRef(0);
  const shuffledRef = useRef(shuffled);

  useEffect(() => {
    if (!billsLoading || !actualConfigured) return;
    const interval = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % shuffledRef.current.length;
      if (indexRef.current === 0) shuffledRef.current = shuffleArray(LOADING_MESSAGES);
      setLoadingMsg(shuffledRef.current[indexRef.current]);
    }, 3000);
    return () => clearInterval(interval);
  }, [billsLoading, actualConfigured]);

  const {
    billEmails, totalBills, emailAccounts,
    selectedEmail, setSelectedEmail,
    setActiveAccount, loadingBillId, setLoadingBillId,
    confirmDismissId, setConfirmDismissId, handleDismiss: onDismiss,
  } = useDashboard();

  const emailBills = billEmails.filter((e) => e.extractedBill);
  const scheduledBills = bills || [];
  const scheduledTotal = scheduledBills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const combinedTotal = totalBills + scheduledTotal;

  const showLoading = billsLoading && actualConfigured;

  // fade out when loading finishes with no content
  useEffect(() => {
    if (!billsLoading && !emailBills.length && !scheduledBills.length && actualConfigured) {
      const timer = setTimeout(() => setFadingOut(true), 300);
      return () => clearTimeout(timer);
    }
  }, [billsLoading, emailBills.length, scheduledBills.length, actualConfigured]);

  if (!showLoading && !emailBills.length && !scheduledBills.length) return null;
  if (fadingOut && !emailBills.length && !scheduledBills.length) return null;

  return (
    <Section
      title="Bills & Payments"
      delay={delay}
      loaded={loaded}
      className={className}
      tier={2}
      summaryBadge={combinedTotal > 0
        ? `$${combinedTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
        : "all paid"}
      defaultExpanded={false}
    >
      {/* Combined header stats */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {emailBills.length > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(243,139,168,0.06)", border: "1px solid rgba(243,139,168,0.12)" }}
          >
            <span className="text-[11px] max-sm:text-xs font-semibold" style={{ color: "rgba(243,139,168,0.8)" }}>
              ⚠ {emailBills.length} need{emailBills.length === 1 ? "s" : ""} action
            </span>
          </div>
        )}
        {scheduledBills.length > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(166,227,161,0.06)", border: "1px solid rgba(166,227,161,0.12)" }}
          >
            <span className="text-[11px] max-sm:text-xs font-semibold" style={{ color: "rgba(166,227,161,0.8)" }}>
              ✓ {scheduledBills.length} scheduled
            </span>
          </div>
        )}
        {combinedTotal > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
            style={{ background: "rgba(205,214,244,0.04)", border: "1px solid rgba(205,214,244,0.08)" }}
          >
            <span className="text-[11px] max-sm:text-xs font-semibold tabular-nums text-foreground/80">
              {formatAmount(combinedTotal)}
            </span>
            <span className="text-[11px] max-sm:text-xs text-muted-foreground/40">total</span>
          </div>
        )}
      </div>

      {/* Loading state — Actual Budget bills being fetched */}
      {showLoading && (
        <div style={{ padding: "12px 0 4px" }}>
          <div
            style={{
              color: "rgba(205,214,244,0.4)",
              fontSize: 12,
              marginBottom: 8,
              transition: "opacity 200ms ease",
            }}
          >
            {loadingMsg}
          </div>
          <div
            style={{
              height: 2,
              borderRadius: 2,
              background: "rgba(166,227,161,0.1)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: "40%",
                borderRadius: 2,
                background: "linear-gradient(90deg, transparent, rgba(166,227,161,0.5), transparent)",
                animation: "shimmerSlide 1.5s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      )}

      {/* Needs Attention — email-detected bills */}
      {emailBills.length > 0 && (
        <div>
          <div className="text-[10px] max-sm:text-xs uppercase tracking-[1px] font-semibold mb-1.5" style={{ color: "rgba(243,139,168,0.5)" }}>
            Needs Attention
          </div>
          <MotionList className="flex flex-col gap-1" loaded={loaded} delay={delay + 100} stagger={0.04}>
            {emailBills.map((email, i) => {
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
                    "group relative flex items-center gap-3 py-2 px-3 pl-4 rounded-md cursor-pointer transition-all duration-150",
                    billCarriedOver && "opacity-50",
                  )}
                  style={{
                    background: "rgba(243,139,168,0.04)",
                    border: "1px solid rgba(243,139,168,0.10)",
                  }}
                >
                  <div className="absolute inset-0 rounded-md bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-150" />
                  <div
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                    style={{
                      background: email.accountColor,
                      opacity: billCarriedOver ? 0.3 : 0.7,
                      boxShadow: billCarriedOver ? "none" : `0 0 6px ${email.accountColor}30`,
                    }}
                  />
                  <div className="relative flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-foreground/90 truncate">
                      {email.extractedBill.payee}
                      {billCarriedOver && (
                        <span className="text-[10px] max-sm:text-xs text-muted-foreground/40 ml-2">↩ previous</span>
                      )}
                    </div>
                    <div className="text-[11px] max-sm:text-xs text-muted-foreground/35 mt-0.5">
                      Found in email · not yet in budget
                    </div>
                  </div>
                  <span
                    className="relative text-[9px] max-sm:text-xs font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0"
                    style={{ color: `${typeInfo.color}cc`, background: `${typeInfo.color}0d` }}
                  >
                    {typeInfo.label}
                  </span>
                  {email.extractedBill.amount != null ? (
                    <span className="relative text-[12px] font-semibold text-foreground/80 min-w-[60px] text-right tabular-nums shrink-0">
                      ${email.extractedBill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="relative text-[11px] max-sm:text-xs text-muted-foreground/40 min-w-[60px] text-right italic shrink-0">
                      See email
                    </span>
                  )}
                  {loadingBillId === email.id && (
                    <div className="relative w-3.5 h-3.5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin shrink-0" />
                  )}
                  {confirmDismissId === email.id ? (
                    <div onClick={(e) => e.stopPropagation()} className="relative flex items-center gap-1 shrink-0">
                      <button
                        className="rounded text-[10px] max-sm:text-xs font-semibold px-2 py-0.5 cursor-pointer font-[inherit] transition-all duration-150"
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
        </div>
      )}

      {/* Divider between subsections */}
      {emailBills.length > 0 && scheduledBills.length > 0 && (
        <div className="my-2.5" style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />
      )}

      {/* Scheduled — from Actual Budget */}
      {scheduledBills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] max-sm:text-xs uppercase tracking-[1px] font-semibold" style={{ color: "rgba(166,227,161,0.4)" }}>
              Scheduled
            </span>
            <span className="text-[10px] max-sm:text-xs text-muted-foreground/20">· from Actual Budget</span>
          </div>
          <MotionList className="flex flex-col gap-1" loaded={loaded} delay={delay + 200} stagger={0.04}>
            {scheduledBills.map((bill) => {
              const days = daysUntil(bill.next_date);
              const uc = urgencyColor(days);
              return (
                <MotionItem key={bill.id}>
                  <div
                    className="relative rounded-md py-2 px-3 pl-4 transition-all duration-150"
                    style={{
                      background: days !== null && days <= 1 ? `${uc.accent}0a` : "rgba(36,36,58,0.4)",
                      border: days !== null && days <= 1 ? `1px solid ${uc.accent}20` : "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                      style={{ background: uc.accent, opacity: 0.7, boxShadow: `0 0 6px ${uc.accent}30` }}
                    />
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground/90">{bill.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {bill.payee && bill.payee !== bill.name && (
                            <span className="text-[11px] max-sm:text-xs text-muted-foreground/40">{bill.payee}</span>
                          )}
                          <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">
                            Due {formatDate(bill.next_date)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className="text-[10px] max-sm:text-xs font-semibold tabular-nums px-2 py-0.5 rounded"
                          style={{ color: uc.text, background: uc.bg }}
                        >
                          {days !== null ? daysLabel(days) : ""}
                        </span>
                        <span className="text-[12px] font-semibold tabular-nums text-foreground/80">
                          {formatAmount(bill.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </MotionItem>
              );
            })}
          </MotionList>
        </div>
      )}

      <div className="text-[10px] max-sm:text-xs text-muted-foreground/20 mt-2 text-right">
        Email detection · Actual Budget
      </div>
    </Section>
  );
}
