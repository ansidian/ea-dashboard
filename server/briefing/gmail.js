import db from "../db/connection.js";
import { encrypt, decrypt } from "./encryption.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.NODE_ENV === "production"
  ? process.env.GOOGLE_REDIRECT_URI
  : `http://localhost:${process.env.PORT || 3001}/api/ea/accounts/gmail/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// --- OAuth flow ---

export function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleCallback(code, accountId, userId) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const tokens = await res.json();
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };

  // Fetch the user's email address for the label
  const profileRes = await fetch(
    "https://www.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${credentials.access_token}` } },
  );
  const profile = await profileRes.json();
  const email = profile.emailAddress;

  // Use email-based ID so multiple Gmail accounts each get their own row
  const emailBasedId = `gmail-${email}`;

  await db.execute({
    sql: `INSERT INTO ea_accounts (id, user_id, type, email, label, credentials_encrypted)
          VALUES (?, ?, 'gmail', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            credentials_encrypted = excluded.credentials_encrypted,
            email = excluded.email,
            updated_at = datetime('now')`,
    args: [
      emailBasedId,
      userId,
      email,
      email, // label defaults to email, user can rename later
      encrypt(JSON.stringify(credentials)),
    ],
  });

  return { email, accountId: emailBasedId };
}

async function getValidToken(account) {
  const credentials = JSON.parse(decrypt(account.credentials_encrypted));

  // Refresh if token expires within 5 minutes
  if (credentials.expires_at < Date.now() + 5 * 60 * 1000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: credentials.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed for ${account.email}: ${text}`);
    }

    const data = await res.json();
    credentials.access_token = data.access_token;
    credentials.expires_at = Date.now() + data.expires_in * 1000;
    // refresh_token is not always returned on refresh
    if (data.refresh_token) credentials.refresh_token = data.refresh_token;

    await db.execute({
      sql: `UPDATE ea_accounts SET credentials_encrypted = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [encrypt(JSON.stringify(credentials)), account.id],
    });
  }

  return credentials.access_token;
}

// Extract dollar amounts from text for bill detection
function extractAmounts(text) {
  const matches = text.match(/\$\d[\d,]*\.\d{2}/g);
  if (!matches || matches.length === 0) return "";
  const unique = [...new Set(matches)].slice(0, 10);
  return ` [amounts: ${unique.join(", ")}]`;
}

// Decode body text from Gmail API full-format message parts
function extractBodyText(payload) {
  if (!payload) return "";
  const parts = [];

  function walk(part) {
    if (part.body?.data && part.mimeType?.startsWith("text/")) {
      try {
        parts.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
      } catch { /* skip malformed */ }
    }
    if (part.parts) part.parts.forEach(walk);
  }

  walk(payload);
  // Strip HTML tags, collapse whitespace
  return parts.join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// --- Email fetch ---

export async function fetchEmails(account, hoursBack) {
  const token = await getValidToken(account);

  // List message IDs
  const listUrl = new URL(
    "https://www.googleapis.com/gmail/v1/users/me/messages",
  );
  listUrl.searchParams.set("q", `newer_than:${hoursBack}h`);
  listUrl.searchParams.set("labelIds", "INBOX");
  listUrl.searchParams.set("maxResults", "100");

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
  const listData = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) return [];

  // Batch fetch message metadata
  const messages = await batchGetMessages(
    token,
    listData.messages.map((m) => m.id),
  );

  return messages.map((msg) => {
    const headers = msg.payload?.headers || [];
    const getHeader = (name) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
      "";

    const snippet = msg.snippet || "";
    const amounts = extractAmounts(extractBodyText(msg.payload));

    return {
      uid: `gmail-${account.id}-${msg.id}`,
      account_id: account.id,
      account_label: account.label,
      account_email: account.email,
      account_color: account.color,
      account_icon: account.icon || "📧",
      from: getHeader("From"),
      subject: getHeader("Subject"),
      body_preview: snippet + amounts,
      date: getHeader("Date"),
    };
  });
}

async function batchGetMessages(token, messageIds) {
  // Gmail batch API: POST multipart/mixed to /batch/gmail/v1
  const boundary = "batch_briefing_" + Date.now();
  const parts = messageIds.map(
    (id) =>
      `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=full HTTP/1.1\r\n`,
  );
  const body = parts.join("\r\n") + `\r\n--${boundary}--`;

  const res = await fetch("https://www.googleapis.com/batch/gmail/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    // Fallback: fetch individually if batch fails
    return fetchMessagesIndividually(token, messageIds);
  }

  const responseText = await res.text();
  return parseBatchResponse(responseText);
}

function parseBatchResponse(responseText) {
  const messages = [];
  // Extract JSON objects from multipart response
  const parts = responseText.split(/--batch/);

  for (const part of parts) {
    const jsonStart = part.indexOf("{");
    if (jsonStart === -1) continue;
    // Find the matching closing brace
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < part.length; i++) {
      if (part[i] === "{") depth++;
      else if (part[i] === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    try {
      const obj = JSON.parse(part.slice(jsonStart, jsonEnd));
      if (obj.id && obj.payload) messages.push(obj);
    } catch {
      // skip malformed parts
    }
  }
  return messages;
}

export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function fetchMessagesIndividually(token, messageIds) {
  const ids = messageIds.slice(0, 50); // cap at 50 to avoid rate limits
  const chunks = chunkArray(ids, 10);
  const results = [];
  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map((id) =>
        fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } },
        ).then((res) => (res.ok ? res.json() : Promise.reject(res.status))),
      ),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
    }
  }
  return results;
}

// --- Full email body (for detail view) ---

export async function fetchEmailBody(account, uid) {
  // Strip the "gmail-{accountId}-" prefix to get the raw Gmail message ID
  const prefix = `gmail-${account.id}-`;
  const messageId = uid.startsWith(prefix) ? uid.slice(prefix.length) : uid;
  const token = await getValidToken(account);

  // Fetch raw RFC 2822 message and parse with mailparser for reliable decoding
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=raw`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail fetch body failed: ${res.status}`);
  const msg = await res.json();

  const { simpleParser } = await import("mailparser");
  const rawBuffer = Buffer.from(msg.raw, "base64url");
  const parsed = await simpleParser(rawBuffer);

  return {
    html_body: parsed.html || parsed.textAsHtml || parsed.text || "",
    subject: parsed.subject || "",
    from: parsed.from?.text || "",
    date: parsed.date ? parsed.date.toISOString() : "",
  };
}

// --- Connection test ---

export async function testConnection(account) {
  const token = await getValidToken(account);
  const res = await fetch(
    "https://www.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail test failed: ${res.status}`);
  return true;
}
