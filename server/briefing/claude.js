const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are a personal executive assistant generating a daily briefing. You receive structured data from multiple sources: emails (Gmail + iCloud), Google Calendar, weather, and academic deadlines (Canvas/Todoist via CTM).

Your job:
1. TRIAGE EMAILS: Classify each as "actionable" (needs response/action), "fyi" (good to know), or "noise" (newsletters, marketing, automated). For actionable emails, specify what the user needs to do and by when. Set urgency: high/medium/low. Only include actionable and fyi emails in the output — omit noise but report the count.

2. DETECT BILLS: For any email containing a payment, invoice, statement, or financial transaction, extract: payee (short name), dollar amount (number), due_date (YYYY-MM-DD), and type:
   - "transfer" for credit card statement payments (Chase, SoFi, Amex, Citi, Capital One, Discover)
   - "bill" for recurring utilities/services (electric, gas, water, internet, insurance, hosting)
   - "expense" for one-off purchases or deposits
   - "income" if user RECEIVES money (refund, deposit, ACH credit, cashback, "transferring to your bank", "sent you $X")
   CRITICAL: "transfer to your bank" = income. "Your payment is due" from a credit card issuer = transfer.

3. GENERATE INSIGHTS: Connect dots across ALL sources. Look for:
   - Calendar conflicts (overlapping events)
   - Email threads related to upcoming calendar events or deadlines
   - Academic deadline prioritization (consider point values, due dates, dependencies)
   - Financial patterns (total upcoming bills, anything overdue)
   - Time management: suggest sequencing based on schedule gaps + deadline urgency
   Be specific and actionable. Don't just list what's happening — tell the user what to do about it.

4. EXTRACT DEADLINES: From emails, identify any non-academic deadlines with due dates.

Respond with ONLY valid JSON. No markdown fences, no explanation, no preamble. The JSON must match this exact structure:

{
  "weather": { "temp": number, "high": number, "low": number, "summary": string, "hourly": [{ "time": string, "temp": number, "icon": string }] },
  "aiInsights": [{ "icon": string, "text": string }],
  "calendar": [{ "time": string, "duration": string, "title": string, "source": string, "color": string, "flag": string|null }],
  "ctm": {
    "upcoming": [{ "id": number, "title": string, "due_date": string, "due_time": string, "class_name": string, "class_color": string, "points_possible": number|null, "status": string, "source": string, "description": string, "url": string|null }],
    "stats": { "pending": number, "dueToday": number, "dueThisWeek": number, "totalPoints": number }
  },
  "emails": {
    "summary": string,
    "accounts": [{
      "name": string, "icon": string, "color": string, "unread": number,
      "important": [{
        "id": string, "from": string, "fromEmail": string, "subject": string,
        "preview": string, "action": string, "urgency": string, "date": string,
        "hasBill": boolean,
        "extractedBill": { "payee": string, "amount": number, "due_date": string, "type": string } | null
      }],
      "noise_count": number
    }]
  },
  "deadlines": [{ "title": string, "due": string, "urgency": string, "source": string, "type": string }]
}

IMPORTANT: Use camelCase for field names as shown above (aiInsights, hasBill, extractedBill, fromEmail, etc). The ctm_deadlines data should go into the "ctm.upcoming" array. Compute ctm.stats from the deadlines data (count pending, due today, due this week, sum points).

For weather and calendar: pass through the pre-fetched data as-is into those fields. Your main job is email triage, bill detection, insights, and deadline extraction.`;

export async function callHaiku({ emails, calendar, weather, ctmDeadlines }) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
    timeStyle: "long",
  });

  const userMessage = `Generate my briefing from this data:

## Emails
${JSON.stringify(emails)}

## Calendar
${JSON.stringify(calendar)}

## Weather
${JSON.stringify(weather)}

## Academic Deadlines (CTM)
${JSON.stringify(ctmDeadlines)}

## Current Date/Time
${now}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Haiku API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data.content?.[0]?.text || "";

  return parseHaikuResponse(rawText);
}

function parseHaikuResponse(rawText) {
  // Strip markdown fences if present
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Retry: try to extract JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    throw new Error(
      `Failed to parse Haiku response as JSON: ${firstErr.message}\nRaw: ${rawText.slice(0, 500)}`,
    );
  }
}
