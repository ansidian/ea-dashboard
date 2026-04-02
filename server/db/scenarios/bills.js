// Adds bill-related emails (payments, receipts, statements).
// Tests: bill detection, extractedBill rendering, BillBadge, bill pay toggle

function relativeDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);
}

export default function bills(briefing) {
  const accounts = briefing.emails?.accounts;
  if (!accounts?.length) return;
  const now = new Date().toISOString();

  // Add bill emails to work account
  accounts[0].important.push(
    {
      id: "mock-bill-sofi", message_id: "<mock-sofi@sofi.org>",
      from: "SoFi", fromEmail: "no-reply@o.sofi.org",
      subject: "Your SoFi Credit Card autopay is scheduled for " + new Date(Date.now() + 10 * 86400000).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
      preview: "Your autopay for your SoFi Credit Card is scheduled. Your statement balance will be debited from your linked bank account.",
      action: "Pay by " + new Date(Date.now() + 10 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      urgency: "medium", date: now, read: true,
      hasBill: true, urgentFlag: null,
      extractedBill: { payee: "SoFi", amount: 0, due_date: relativeDate(10), type: "transfer", category_id: null, category_name: null },
    },
    {
      id: "mock-bill-amazon", message_id: "<mock-amazon@amazon.com>",
      from: "Amazon.com", fromEmail: "auto-confirm@amazon.com",
      subject: "Ordered: \"Clorox ToiletWand...\" and 1 more item",
      preview: "Thanks for your order, Andy! Your order #112-4567890 will arrive soon. [amounts: $12.49, $6.99, $2.07, $21.55]",
      action: "FYI", urgency: "low", date: now, read: false,
      hasBill: true, urgentFlag: null,
      extractedBill: { payee: "Amazon", amount: 21.55, due_date: relativeDate(0), type: "expense", category_id: null, category_name: "Shopping" },
    },
  );
  accounts[0].unread = accounts[0].important.filter(e => !e.read).length;

  // Add bill emails to personal account
  accounts[1].important.push(
    {
      id: "mock-bill-apple", message_id: "<mock-apple@apple.com>",
      from: "Apple", fromEmail: "no_reply@email.apple.com",
      subject: "Your receipt from Apple.",
      preview: "Receipt. Narwhal for Reddit — Narwhal Pro (Monthly). [amounts: $3.99]",
      action: "FYI", urgency: "low", date: now, read: true,
      hasBill: true, urgentFlag: null,
      extractedBill: { payee: "Apple", amount: 3.99, due_date: relativeDate(0), type: "bill", category_id: null, category_name: "Subscriptions" },
    },
    {
      id: "mock-bill-edison", message_id: "<mock-edison@sce.com>",
      from: "Edison", fromEmail: "billing@sce.com",
      subject: "Your Electric Bill — $50.00 Due",
      preview: "Your electricity bill for the current period is $50.00. Due by " + new Date(Date.now() + 12 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) + ".",
      action: "Pay electric bill of $50.00", urgency: "medium", date: now, read: false,
      hasBill: true, urgentFlag: null,
      extractedBill: { payee: "Edison", amount: 50.00, due_date: relativeDate(12), type: "bill", category_id: null, category_name: "Electric" },
    },
  );
  accounts[1].unread = accounts[1].important.filter(e => !e.read).length;

  // Update summary
  const totalImportant = accounts.reduce((s, a) => s + a.important.length, 0);
  briefing.emails.summary = `${totalImportant} emails across ${accounts.length} accounts. Bills and transactions detected.`;

  // Add bill-related insight
  briefing.aiInsights.unshift({ icon: "💰", text: "SoFi autopay is scheduled — statement balance will be debited automatically. Apple charged $3.99 for Narwhal Pro, and your Amazon order totals $21.55." });
}

bills.description = "Adds bill/payment emails with extractedBill data for bill detection testing";
