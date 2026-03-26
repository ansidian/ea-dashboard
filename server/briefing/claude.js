const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Preferred defaults in order — first available one is used if no model is configured
const PREFERRED_MODELS = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250514",
  "claude-haiku-4-5-20251001",
];

const SYSTEM_PROMPT = `You are a personal executive assistant. You receive emails, calendar events, and academic deadlines. Your job is email triage, bill detection, cross-source insights, and deadline extraction. Weather/calendar/CTM data is handled by the server — do NOT include them in your output.

1. TRIAGE EMAILS: Classify each email's "triage" as "actionable", "fyi", or "noise". Include actionable + fyi in the important array, omit noise but count it. Set urgency: high/medium/low.
   Summary: count each triage category separately — "10 emails across 3 accounts. 4 need attention, 2 FYI, 4 noise." "Need attention" = actionable only. Do NOT count fyi emails as needing attention. No subjects/topics in summary.
   NOISE (always, unless overridden by Email Interests):
   - Marketing, promotions, coupons, deals, loyalty rewards ("earn points", "limited time", "% off")
   - Upsell/cross-sell ("see how much you could save", "upgrade your plan", "you might like")
   - Newsletters and digests the user didn't write or reply to
   - Verification emails (OTP, 2FA, login confirmations)
   - Surveys, feedback requests, NPS scores
   FYI: real account activity, shipping updates, appointment confirmations, statements ready, actual transactions/bills owed.
   ACTIONABLE: requires a response or decision from the user.
   Emails with dollar amounts + merchants are "fyi" ONLY if they represent a real transaction or bill — not ads or promotional offers.

2. DETECT TRANSACTIONS: Extract financial data from emails about payments, purchases, or subscriptions.
   Receipts (Apple, Google, app stores), order confirmations (Amazon, retailers), autopay notices (credit cards, loans), subscription renewals, and payment reminders are ALL bills — set hasBill: true.
   Extract: payee (short name), amount (number — REQUIRED, look in body_preview if not in subject), due_date (YYYY-MM-DD), type: "transfer" (credit card payments), "bill" (recurring services), "expense" (one-off purchases), "income" (refunds/deposits).
   If the email clearly describes a payment/purchase but the exact amount isn't visible, still set hasBill: true and set amount to 0 — the user can fill it in.
   If budget categories are provided, also set category_id and category_name to the best matching category. Only set these if confident in the match.

3. GENERATE INSIGHTS (2-4 items): Connect dots across emails, calendar, and deadlines. Be specific and actionable.
   Calendar events with "passed": true already ended — skip them. Focus on what's ahead.

4. EXTRACT DEADLINES: Non-academic deadlines from emails only. Use ONLY dates explicitly stated in the email — never infer or fabricate.

Respond with ONLY valid JSON matching this structure:
{
  "aiInsights": [{ "icon": string, "text": string }],
  "emails": {
    "summary": string,
    "accounts": [{
      "name": string, "icon": string, "color": string, "unread": number,
      "important": [{
        "id": string, "from": string, "fromEmail": string, "subject": string,
        "preview": string (1-2 sentences), "action": string (max 3-4 words: "Reply needed", "FYI", "Pay by Apr 5"),
        "urgency": string, "date": string, "hasBill": boolean,
        "extractedBill": { "payee": string, "amount": number, "due_date": string, "type": string, "category_id": string|null, "category_name": string|null } | null
      }],
      "noise_count": number
    }]
  },
  "deadlines": [{ "title": string, "due_date": string, "urgency": string, "source": string, "type": string, "email_id": string|null }]
}

RULES:
- Group emails by their account_label. Use account_label as "name", account_icon as "icon", account_color as "color".
- "unread" MUST equal the length of "important" array. Do NOT fabricate emails.
- Keep output concise — previews under 2 sentences, insights under 3 sentences each.`;

export async function callClaude({ emails, calendar, ctmDeadlines, model, emailInterests, categories }) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const selectedModel = model || PREFERRED_MODELS[0];

  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
    timeStyle: "long",
  });

  const interestsNote = emailInterests?.length
    ? `\n\nEmail Interests (never classify as noise): ${emailInterests.join(", ")}`
    : "";

  // Trim emails to only fields Claude needs for triage
  const trimmedEmails = emails.map(e => ({
    id: e.id || e.uid,
    from: e.from,
    from_email: e.from_email,
    subject: e.subject,
    body_preview: e.body_preview,
    date: e.date,
    account_label: e.account_label,
    account_icon: e.account_icon,
    account_color: e.account_color,
  }));

  // Compact calendar summary for insights (not output — server handles display)
  const calendarSummary = calendar.map(e =>
    `${e.time} ${e.duration} "${e.title}"${e.passed ? " [PASSED]" : ""}${e.flag ? ` [${e.flag}]` : ""}`
  ).join("; ");

  // Compact CTM summary for insights
  const ctmSummary = ctmDeadlines.length
    ? ctmDeadlines.map(d => `"${d.title}" due ${d.due_date} ${d.due_time || ""} (${d.class_name}, ${d.points_possible || 0}pts)`).join("; ")
    : "None";

  // Compact category list for bill matching
  const categoriesNote = categories?.length
    ? `\n\n## Budget Categories (for bill detection — match extractedBill to closest category)\n${categories.flatMap(g => g.categories.map(c => `${c.id}:${c.name}`)).join(", ")}`
    : "";

  const userMessage = `## Emails
${JSON.stringify(trimmedEmails)}

## Today's Calendar (for insights only — do NOT include in output)
${calendarSummary || "No events"}

## Academic Deadlines (for insights only — do NOT include in output)
${ctmSummary}

## Now: ${now}${interestsNote}${categoriesNote}`;

  console.log(`[EA] Calling Claude API with model: ${selectedModel}`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: selectedModel,
      max_tokens: 16384,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const usage = data.usage || {};
  if (usage.cache_read_input_tokens) {
    console.log(`[EA] Cache hit: ${usage.cache_read_input_tokens} tokens read from cache, ${usage.cache_creation_input_tokens || 0} written`);
  } else if (usage.cache_creation_input_tokens) {
    console.log(`[EA] Cache miss: ${usage.cache_creation_input_tokens} tokens written to cache`);
  }
  console.log(`[EA] Tokens — input: ${usage.input_tokens || '?'}, output: ${usage.output_tokens || '?'}, stop: ${data.stop_reason || '?'}`);
  const rawText = data.content?.[0]?.text || "";
  const result = parseResponse(rawText);
  result.model = data.model || selectedModel;
  return result;
}

export async function listModels() {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Models API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.data || [])
    .map(m => ({ id: m.id, name: m.display_name || m.id, created: m.created_at }))
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}

// Per D-04: top-level shape only — validate keys exist with correct types
const REQUIRED_SHAPE = {
  aiInsights: "array",
  emails: "object",
  deadlines: "array",
};

function validateBriefingShape(parsed) {
  const missing = [];
  const wrongType = [];
  for (const [key, expectedType] of Object.entries(REQUIRED_SHAPE)) {
    if (!(key in parsed)) {
      missing.push(key);
    } else if (expectedType === "array" && !Array.isArray(parsed[key])) {
      wrongType.push(`${key} (expected array, got ${typeof parsed[key]})`);
    } else if (expectedType === "object" && (typeof parsed[key] !== "object" || Array.isArray(parsed[key]) || parsed[key] === null)) {
      wrongType.push(`${key} (expected object, got ${Array.isArray(parsed[key]) ? "array" : typeof parsed[key]})`);
    }
  }
  if (missing.length || wrongType.length) {
    const parts = [];
    if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
    if (wrongType.length) parts.push(`wrong type: ${wrongType.join(", ")}`);
    throw new Error(`Claude response has invalid shape — ${parts.join("; ")}`);
  }
}

export function parseResponse(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    validateBriefingShape(parsed);
    return parsed;
  } catch (firstErr) {
    // Re-throw shape validation errors immediately — they're not parse errors
    if (firstErr.message.startsWith("Claude response has invalid shape")) throw firstErr;
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        validateBriefingShape(parsed);
        return parsed;
      } catch {
        // fall through
      }
    }
    throw new Error(
      `Failed to parse Claude response as JSON: ${firstErr.message}\nRaw: ${rawText.slice(0, 500)}`,
    );
  }
}
