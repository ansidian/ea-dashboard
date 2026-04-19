import {
  sendBill as actualSendBill,
  markBillPaid as actualMarkBillPaid,
  getAccounts as actualGetAccounts,
  getCategories as actualGetCategories,
  getPayees as actualGetPayees,
  getMetadata as actualGetMetadata,
  testConnection as actualTestConnection,
  createQuickTxn as actualCreateQuickTxn,
} from "./actual.js";
import { trimBillBody } from "./bill-extract.js";

export async function sendBill(userId, billData) {
  return actualSendBill(billData, userId);
}

export async function markBillPaid(userId, billId) {
  return actualMarkBillPaid(billId, userId);
}

export async function listAccounts(userId) {
  return actualGetAccounts(userId);
}

export async function listCategories(userId) {
  return actualGetCategories(userId);
}

export async function listPayees(userId) {
  return actualGetPayees(userId);
}

export async function getMetadata(userId) {
  return actualGetMetadata(userId);
}

export async function testConnection(userId, overrides) {
  return actualTestConnection(userId, overrides);
}

export async function createQuickTxn(userId, payload) {
  return actualCreateQuickTxn(userId, payload);
}

export async function extractBill(userId, { subject, from, body }) {
  const [categories, accounts] = await Promise.all([
    actualGetCategories(userId).catch(() => []),
    actualGetAccounts(userId).catch(() => []),
  ]);

  const catCodeToId = new Map();
  const catList = [];
  if (Array.isArray(categories)) {
    let i = 1;
    for (const group of categories) {
      for (const c of group.categories || []) {
        const code = `c${i++}`;
        catCodeToId.set(code, c.id);
        catList.push(`${code}:${c.name}`);
      }
    }
  }
  const acctCodeToId = new Map();
  const acctList = [];
  if (Array.isArray(accounts)) {
    let i = 1;
    for (const a of accounts) {
      const code = `a${i++}`;
      acctCodeToId.set(code, a.id);
      acctList.push(`${code}:${a.name}`);
    }
  }

  const trimmed = trimBillBody({ subject, from, body });
  const systemPrompt = `Extract bill fields from an email. Return submit_bill with:
- payee, amount (0 if missing), due_date (YYYY-MM-DD)
- type: "transfer" (credit card payment), "bill" (recurring), "expense" (one-off), "income"
- category_code: closest category's code (c1, c2, ...) if confident, else null
- category_name: the category's display name (copied from the list)
- to_account_code: ONLY for type=transfer, code (a1, a2, ...) of the credit card being paid. Match on Visa/MC/Amex or last-4 digits. Null if unsure.${catList.length ? `\n\nCategories: ${catList.join(", ")}` : ""}${acctList.length ? `\n\nAccounts: ${acctList.join(", ")}` : ""}`;

  const tool = {
    name: "submit_bill",
    description: "Submit extracted bill fields.",
    input_schema: {
      type: "object",
      properties: {
        payee: { type: "string" },
        amount: { type: "number" },
        due_date: { type: "string" },
        type: { type: "string", enum: ["transfer", "bill", "expense", "income"] },
        category_code: { type: ["string", "null"] },
        category_name: { type: ["string", "null"] },
        to_account_code: { type: ["string", "null"] },
      },
      required: ["payee", "amount", "due_date", "type"],
    },
  };

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_bill" },
      messages: [{ role: "user", content: trimmed }],
    }),
  });

  if (!apiRes.ok) {
    const text = await apiRes.text();
    console.error(`[EA] Bill extract Haiku error (${apiRes.status}):`, text);
    const err = new Error(`Haiku API error (${apiRes.status})`);
    err.status = 502;
    throw err;
  }

  const data = await apiRes.json();
  const toolBlock = (data.content || []).find(
    (c) => c.type === "tool_use" && c.name === "submit_bill",
  );
  if (!toolBlock?.input) {
    console.error("[EA] Bill extract: no tool_use in Haiku response", data);
    const err = new Error("Extraction failed");
    err.status = 502;
    throw err;
  }

  const usage = data.usage || {};
  console.log(
    `[EA] Bill extract: in=${usage.input_tokens} out=${usage.output_tokens} trimmed_chars=${trimmed.length}`,
  );

  const input = toolBlock.input;
  return {
    payee: input.payee,
    amount: input.amount,
    due_date: input.due_date,
    type: input.type,
    category_id: input.category_code ? catCodeToId.get(input.category_code) || null : null,
    category_name: input.category_name || null,
    to_account_id: input.to_account_code ? acctCodeToId.get(input.to_account_code) || null : null,
  };
}
