import actualApi from "@actual-app/api";
import { decrypt } from "./encryption.js";
import db from "../db/connection.js";

async function getActualConfig(userId) {
  const result = await db.execute({
    sql: "SELECT actual_budget_url, actual_budget_password_encrypted, actual_budget_sync_id FROM ea_settings WHERE user_id = ?",
    args: [userId],
  });
  const settings = result.rows[0];
  if (!settings?.actual_budget_url || !settings?.actual_budget_sync_id) {
    throw new Error("Actual Budget not configured in EA settings");
  }
  return {
    serverURL: settings.actual_budget_url.replace(/\/+$/, ""),
    password: settings.actual_budget_password_encrypted
      ? decrypt(settings.actual_budget_password_encrypted)
      : null,
    syncId: settings.actual_budget_sync_id,
  };
}

// --- Mutex: serialize all Actual Budget API access (singleton contention prevention) ---
let lock = Promise.resolve();

function withLock(fn) {
  const result = lock.then(() => fn());
  lock = result.catch(() => {});
  return result;
}

// --- Metadata cache: 5-minute TTL ---
const METADATA_TTL_MS = 5 * 60 * 1000;
let metadataCache = { data: null, ts: 0 };

export function testConnection(userId) {
  return withLock(async () => {
    const { serverURL, password, syncId } = await getActualConfig(userId);

    try {
      await actualApi.init({ serverURL, password });
      // getBudgets validates auth + connectivity without downloading/syncing
      const budgets = await actualApi.getBudgets();
      const found = budgets.some((b) => b.groupId === syncId);
      await actualApi.shutdown().catch(() => {});
      return {
        success: true,
        budgetCount: budgets.length,
        budgetFound: found,
      };
    } catch (err) {
      await actualApi.shutdown().catch(() => {});
      throw err;
    }
  });
}

// Fetch all Actual Budget metadata in a single connection (accounts, payees, categories)
// The @actual-app/api is a singleton — parallel init/shutdown calls conflict,
// so we batch everything into one connection.
// Cache check is inside withLock to prevent cache stampede (D-03 from RESEARCH.md).
export function getMetadata(userId) {
  return withLock(async () => {
    const now = Date.now();
    if (metadataCache.data && now - metadataCache.ts < METADATA_TTL_MS) {
      return metadataCache.data;
    }

    const { serverURL, password, syncId } = await getActualConfig(userId);
    try {
      await actualApi.init({ serverURL, password });
      await actualApi.downloadBudget(syncId);

      const [rawAccounts, rawPayees, groups] = await Promise.all([
        actualApi.getAccounts(),
        actualApi.getPayees(),
        actualApi.getCategoryGroups(),
      ]);

      const accounts = rawAccounts
        .filter(a => !a.closed)
        .map(a => ({ id: a.id, name: a.name, type: a.type }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const payees = rawPayees
        .filter(p => p.name && !p.transfer_acct)
        .map(p => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const categories = groups
        .filter(g => g.name !== "Internal")
        .map(g => ({
          group_name: g.name,
          categories: (g.categories || []).map(c => ({ id: c.id, name: c.name })),
        }));

      const result = { accounts, payees, categories };
      metadataCache = { data: result, ts: Date.now() };
      return result;
    } finally {
      await actualApi.shutdown().catch(() => {});
    }
  });
}

// Individual accessors (used by briefing generation where only one is needed)
export async function getAccounts(userId) {
  const { accounts } = await getMetadata(userId);
  return accounts;
}

export async function getPayees(userId) {
  const { payees } = await getMetadata(userId);
  return payees;
}

export async function getCategories(userId) {
  const { categories } = await getMetadata(userId);
  return categories;
}

// --- Schedule helpers (ported from actual-helper.mjs) ---

async function getSchedulesWithConditions({ includeCompleted = false } = {}) {
  const rows = (await actualApi.runQuery(
    actualApi.q('schedules').select(['id', 'name', 'rule', 'next_date', 'completed'])
  )).data;
  const rules = await actualApi.getRules();
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r]));
  return rows
    .filter(s => includeCompleted || !s.completed)
    .map(s => ({ ...s, conditions: ruleMap[s.rule]?.conditions || [] }));
}

function findScheduleByPayee(schedules, payeeId, accountId, amountCents) {
  const matches = schedules.filter(s =>
    s.conditions.some(c => c.field === 'payee' && c.value === payeeId)
  );
  if (matches.length <= 1) return matches[0] || null;

  for (const s of matches) {
    const acctMatch = !accountId || s.conditions.some(c => c.field === 'account' && c.value === accountId);
    if (!acctMatch) continue;

    const amtCond = s.conditions.find(c => c.field === 'amount');
    if (!amtCond || !amountCents) return s;

    const amt = Math.abs(amountCents);
    if (amtCond.op === 'is' && Math.abs(amtCond.value) === amt) return s;
    if (amtCond.op === 'isapprox' && Math.abs(Math.abs(amtCond.value) - amt) / amt < 0.3) return s;
    if (amtCond.op === 'isbetween') {
      const lo = Math.min(Math.abs(amtCond.value.num1), Math.abs(amtCond.value.num2));
      const hi = Math.max(Math.abs(amtCond.value.num1), Math.abs(amtCond.value.num2));
      if (amt >= lo * 0.7 && amt <= hi * 1.3) return s;
    }
  }
  return matches[0];
}

async function resolvePayee(payeeName) {
  if (!payeeName) return null;
  const payees = await actualApi.getPayees();
  const match = payees.find(p => p.name?.toLowerCase() === payeeName.toLowerCase());
  return match ? match.id : await actualApi.createPayee({ name: payeeName });
}

// --- Shared schedule helpers ---

function buildDateCondition(oldConditions, newDueDate) {
  const dateCond = oldConditions.find(c => c.field === "date");
  if (dateCond && typeof dateCond.value === "object" && dateCond.value?.frequency) {
    if (dateCond.value.interval > 1) {
      return dateCond; // Keep complex recurrence as-is
    }
    return { op: dateCond.op, field: "date", value: { ...dateCond.value, start: newDueDate } };
  }
  return { op: "is", field: "date", value: newDueDate };
}

async function findExistingSchedule(payeeId, accountId, amount, name) {
  if (payeeId) {
    const schedules = await getSchedulesWithConditions();
    const existing = findScheduleByPayee(schedules, payeeId, accountId, Math.abs(amount));
    if (existing) return existing.id;
  }
  if (name) {
    const allSchedules = await getSchedulesWithConditions({ includeCompleted: true });
    const byName = allSchedules.find(s => s.name === name);
    if (byName) return byName.id;
  }
  return null;
}

async function updateExistingSchedule(existingId, newDueDate, amount, extraConditions = []) {
  const allSchedules = await getSchedulesWithConditions({ includeCompleted: true });
  const existing = allSchedules.find(s => s.id === existingId);
  const oldConditions = existing?.conditions || [];

  const newConditions = [
    buildDateCondition(oldConditions, newDueDate),
    { op: "is", field: "amount", value: amount },
    ...extraConditions,
  ];

  // Preserve non-date, non-amount conditions that aren't in extraConditions
  const extraFields = new Set(extraConditions.map(c => c.field));
  for (const c of oldConditions) {
    if (c.field !== "date" && c.field !== "amount" && !extraFields.has(c.field)) {
      newConditions.push(c);
    }
  }

  await actualApi.internal.send("schedule/update", {
    schedule: { id: existingId, completed: false },
    conditions: newConditions,
  });
  return existing?.name;
}

async function createOrReuseSchedule(name, dueDate, amount, conditions) {
  const allSchedules = await getSchedulesWithConditions({ includeCompleted: true });
  const byName = allSchedules.find(s => s.name === name);
  if (byName) {
    await actualApi.internal.send("schedule/update", {
      schedule: { id: byName.id, completed: false },
      conditions,
    });
    return { reused: true, name };
  }
  const id = await actualApi.createSchedule({ name, date: dueDate, amount });
  await actualApi.internal.send("schedule/update", { schedule: { id, name }, conditions });
  return { reused: false, name };
}

async function upsertSchedule(billData, targetAccountId) {
  const amountCents = -Math.round(billData.amount * 100);
  const isIncome = billData.type === "income";
  const signedAmount = isIncome ? Math.abs(amountCents) : amountCents;
  const name = billData.payee;

  // Past-date: create posted transaction instead
  const today = new Date().toISOString().slice(0, 10);
  if (billData.due_date <= today) {
    const txn = { date: billData.due_date, amount: signedAmount, cleared: false };
    const payeeId = await resolvePayee(billData.payee);
    if (payeeId) txn.payee = payeeId;
    if (billData.category_id) txn.category = billData.category_id;
    await actualApi.addTransactions(targetAccountId, [txn]);
    return { success: true, message: `Transaction "${name}" created (date is today or past)` };
  }

  const payeeId = await resolvePayee(billData.payee);
  const existingId = await findExistingSchedule(payeeId, targetAccountId, amountCents, name);

  if (existingId) {
    const existingName = await updateExistingSchedule(existingId, billData.due_date, signedAmount);
    return { success: true, message: `Updated schedule "${existingName || name}"` };
  }

  const conditions = [
    { op: "is", field: "date", value: billData.due_date },
    { op: "is", field: "amount", value: signedAmount },
  ];
  if (payeeId) conditions.push({ op: "is", field: "payee", value: payeeId });
  if (targetAccountId) conditions.push({ op: "is", field: "account", value: targetAccountId });

  const result = await createOrReuseSchedule(name, billData.due_date, signedAmount, conditions);
  return { success: true, message: result.reused ? `Updated existing schedule "${name}"` : `Schedule "${name}" created` };
}

async function upsertTransferSchedule(billData) {
  const amountCents = Math.round(billData.amount * 100); // positive for transfers into account

  // Find the transfer payee (special payee linked to from_account)
  const payees = await actualApi.getPayees();
  const transferPayee = payees.find(p => p.transfer_acct === billData.from_account_id);
  if (!transferPayee) {
    throw new Error(`No transfer payee found for account ${billData.from_account_id}`);
  }

  // Past-date: create posted transfer transaction
  const today = new Date().toISOString().slice(0, 10);
  if (billData.due_date <= today) {
    await actualApi.addTransactions(billData.to_account_id, [{
      date: billData.due_date,
      amount: amountCents,
      payee: transferPayee.id,
      cleared: false,
    }]);
    return { success: true, message: `Transfer created as transaction (date is today or past)` };
  }

  const name = billData.payee;
  const extraConditions = [
    { op: "is", field: "payee", value: transferPayee.id },
    { op: "is", field: "account", value: billData.to_account_id },
  ];

  const existingId = await findExistingSchedule(transferPayee.id, billData.to_account_id, amountCents, name);

  if (existingId) {
    const existingName = await updateExistingSchedule(existingId, billData.due_date, amountCents, extraConditions);
    return { success: true, message: `Updated transfer schedule "${existingName || name}"` };
  }

  const conditions = [
    { op: "is", field: "date", value: billData.due_date },
    { op: "is", field: "amount", value: amountCents },
    ...extraConditions,
  ];

  const result = await createOrReuseSchedule(name, billData.due_date, amountCents, conditions);
  return { success: true, message: result.reused ? `Updated existing transfer schedule "${name}"` : `Transfer schedule "${name}" created` };
}

export function sendBill(billData, userId) {
  return withLock(async () => {
    const { serverURL, password, syncId } = await getActualConfig(userId);

    try {
      await actualApi.init({ serverURL, password });
      await actualApi.downloadBudget(syncId);

      const accounts = await actualApi.getAccounts();

      // Use user-selected account if provided, otherwise auto-detect
      const resolveAccount = () => {
        if (billData.account_id) {
          const selected = accounts.find((a) => a.id === billData.account_id);
          if (selected) return selected;
        }
        return accounts.find((a) => a.type === "checking" || a.name.toLowerCase().includes("checking")) || accounts[0];
      };

      const targetAccount = resolveAccount();
      const amountCents = Math.round(billData.amount * 100);
      const isIncome = billData.type === "income";

      let result;

      if (billData.type === "transfer") {
        // Transfer: use from/to account IDs for schedule upsert
        if (!billData.from_account_id || !billData.to_account_id) {
          throw new Error("Transfer requires from_account_id and to_account_id");
        }
        result = await upsertTransferSchedule(billData);
      } else if (billData.type === "bill") {
        // Bill: upsert schedule with category
        result = await upsertSchedule(billData, targetAccount.id);
      } else {
        // Expense / Income: one-time transaction (existing behavior + category support)
        const txn = {
          date: billData.due_date,
          amount: isIncome ? amountCents : -amountCents,
          payee_name: billData.payee,
          notes: `Auto-detected ${billData.type} from EA briefing`,
        };
        if (billData.category_id) txn.category = billData.category_id;
        await actualApi.addTransactions(targetAccount.id, [txn]);
        result = { success: true, message: `Sent ${billData.payee} $${billData.amount} to Actual Budget` };
      }

      await actualApi.sync();
      return result;
    } finally {
      await actualApi.shutdown().catch(() => {});
    }
  });
}
