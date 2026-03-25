import db from "../db/connection.js";
import { encrypt, decrypt } from "./encryption.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// --- OAuth flow ---

export function getAuthUrl(accountId) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: accountId,
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

  await db.execute({
    sql: `INSERT INTO ea_accounts (id, user_id, type, email, label, credentials_encrypted)
          VALUES (?, ?, 'gmail', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            credentials_encrypted = excluded.credentials_encrypted,
            email = excluded.email,
            updated_at = datetime('now')`,
    args: [
      accountId,
      userId,
      email,
      email, // label defaults to email, user can rename later
      encrypt(JSON.stringify(credentials)),
    ],
  });

  return { email, accountId };
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

    return {
      uid: msg.id,
      account_id: account.id,
      account_label: account.label,
      account_email: account.email,
      account_color: account.color,
      from: getHeader("From"),
      subject: getHeader("Subject"),
      body_preview: msg.snippet || "",
      date: getHeader("Date"),
    };
  });
}

async function batchGetMessages(token, messageIds) {
  // Gmail batch API: POST multipart/mixed to /batch/gmail/v1
  const boundary = "batch_briefing_" + Date.now();
  const parts = messageIds.map(
    (id) =>
      `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date HTTP/1.1\r\n`,
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
  const jsonRegex = /\{[\s\S]*?"id"\s*:\s*"[^"]+"/g;
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

async function fetchMessagesIndividually(token, messageIds) {
  const results = [];
  for (const id of messageIds.slice(0, 50)) {
    // cap at 50 to avoid rate limits
    const res = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) results.push(await res.json());
  }
  return results;
}

// --- Full email body (for detail view) ---

export async function fetchEmailBody(account, messageId) {
  const token = await getValidToken(account);
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail fetch body failed: ${res.status}`);
  const msg = await res.json();

  const headers = msg.payload?.headers || [];
  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    "";

  const htmlBody = extractBody(msg.payload, "text/html");
  const textBody = extractBody(msg.payload, "text/plain");

  return {
    html_body: htmlBody || textBody || "",
    subject: getHeader("Subject"),
    from: getHeader("From"),
    date: getHeader("Date"),
  };
}

function extractBody(payload, mimeType) {
  if (!payload) return null;

  // Direct body
  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }

  // Recurse into parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = extractBody(part, mimeType);
      if (found) return found;
    }
  }

  return null;
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
