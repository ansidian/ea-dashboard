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

export async function testConnection(userId) {
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
}

export async function getAccounts(userId) {
  const { serverURL, password, syncId } = await getActualConfig(userId);
  try {
    await actualApi.init({ serverURL, password });
    await actualApi.downloadBudget(syncId);
    const accounts = await actualApi.getAccounts();
    return accounts.filter(a => !a.closed).map((a) => ({ id: a.id, name: a.name, type: a.type })).sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await actualApi.shutdown().catch(() => {});
  }
}

export async function sendBill(billData, userId) {
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

    if (billData.type === "transfer" && !billData.account_id) {
      // Legacy transfer logic: try to find matching credit card account for transfer_id
      const creditCardAccount = accounts.find(
        (a) =>
          a.name.toLowerCase().includes(billData.payee.toLowerCase()) ||
          billData.payee.toLowerCase().includes(a.name.toLowerCase()),
      );
      if (creditCardAccount) {
        await actualApi.addTransactions(targetAccount.id, [
          {
            date: billData.due_date,
            amount: -amountCents,
            payee_name: billData.payee,
            transfer_id: creditCardAccount.id,
            notes: "Auto-detected bill from EA briefing",
          },
        ]);
      } else {
        await actualApi.addTransactions(targetAccount.id, [
          {
            date: billData.due_date,
            amount: -amountCents,
            payee_name: billData.payee,
            notes: "Credit card payment (auto-detected from EA briefing)",
          },
        ]);
      }
    } else {
      await actualApi.addTransactions(targetAccount.id, [
        {
          date: billData.due_date,
          amount: isIncome ? amountCents : -amountCents,
          payee_name: billData.payee,
          notes: `Auto-detected ${billData.type} from EA briefing`,
        },
      ]);
    }

    await actualApi.sync();
    return { success: true, message: `Sent ${billData.payee} $${billData.amount} to Actual Budget` };
  } finally {
    await actualApi.shutdown().catch(() => {});
  }
}
