import {
  CreditCard,
  FileText,
  ShoppingCart,
  Wallet,
} from "lucide-react";

export const typeLabels = {
  transfer: { label: "Card", color: "#b4befe", Icon: CreditCard },
  bill: { label: "Bill", color: "#a6e3a1", Icon: FileText },
  expense: { label: "Expense", color: "#fab387", Icon: ShoppingCart },
  income: { label: "Income", color: "#89dceb", Icon: Wallet },
};

export const typeHints = {
  transfer: "Updates upcoming transfer schedule in Actual",
  bill: "Updates upcoming schedule in Actual",
  expense: "Creates one-time transaction",
  income: "Creates one-time transaction",
};

const KNOWN_CC_FEES = {
  socalgas: 1.50,
  sce: 1.65,
};

export function detectFee(payeeName) {
  if (!payeeName) return null;
  const lower = payeeName.toLowerCase();
  for (const [key, fee] of Object.entries(KNOWN_CC_FEES)) {
    if (lower.includes(key)) return { vendor: key, fee };
  }
  return null;
}

export function formatModelName(model) {
  if (!model) return "Claude";
  const match = model.match(/(opus|sonnet|haiku)-(\d+)-?(\d+)?/i);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const version = match[3] ? `${match[2]}.${match[3]}` : match[2];
    return `${family} ${version}`;
  }
  return "Claude";
}

export function pickDefaultFromAccount(accounts) {
  return accounts.find((account) => account.name.toLowerCase().includes("savings"))
    || accounts.find((account) => account.type === "checking" || account.name.toLowerCase().includes("checking"))
    || null;
}

export function scheduleNameFor(accounts, toAccountId) {
  const account = accounts.find((entry) => entry.id === toAccountId);
  return account && /\(\d{4}\)/.test(account.name) ? `${account.name} Payment` : null;
}
