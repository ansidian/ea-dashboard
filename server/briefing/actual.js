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

export async function sendBill(billData, userId) {
  const { serverURL, password, syncId } = await getActualConfig(userId);

  try {
    await actualApi.init({ serverURL, password });
    await actualApi.downloadBudget(syncId);

    const accounts = await actualApi.getAccounts();

    if (billData.type === "transfer") {
      const creditCardAccount = accounts.find(
        (a) =>
          a.name.toLowerCase().includes(billData.payee.toLowerCase()) ||
          billData.payee.toLowerCase().includes(a.name.toLowerCase()),
      );
      const checkingAccount = accounts.find(
        (a) => a.type === "checking" || a.name.toLowerCase().includes("checking"),
      );

      if (creditCardAccount && checkingAccount) {
        await actualApi.addTransactions(checkingAccount.id, [
          {
            date: billData.due_date,
            amount: -Math.round(billData.amount * 100),
            payee_name: billData.payee,
            transfer_id: creditCardAccount.id,
            notes: "Auto-detected bill from EA briefing",
          },
        ]);
      } else {
        const defaultAccount = checkingAccount || accounts[0];
        await actualApi.addTransactions(defaultAccount.id, [
          {
            date: billData.due_date,
            amount: -Math.round(billData.amount * 100),
            payee_name: billData.payee,
            notes: "Credit card payment (auto-detected from EA briefing)",
          },
        ]);
      }
    } else if (billData.type === "income") {
      const checkingAccount = accounts.find(
        (a) => a.type === "checking" || a.name.toLowerCase().includes("checking"),
      );
      const targetAccount = checkingAccount || accounts[0];
      await actualApi.addTransactions(targetAccount.id, [
        {
          date: billData.due_date,
          amount: Math.round(billData.amount * 100),
          payee_name: billData.payee,
          notes: "Auto-detected income from EA briefing",
        },
      ]);
    } else {
      const checkingAccount = accounts.find(
        (a) => a.type === "checking" || a.name.toLowerCase().includes("checking"),
      );
      const targetAccount = checkingAccount || accounts[0];
      await actualApi.addTransactions(targetAccount.id, [
        {
          date: billData.due_date,
          amount: -Math.round(billData.amount * 100),
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
