import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const ICLOUD_HOST = "imap.mail.me.com";
const ICLOUD_PORT = 993;

// --- Connection pool: one persistent connection per iCloud account ---
const pool = new Map(); // email → { client, ready, lastUsed }
const POOL_TTL = 10 * 60 * 1000; // close idle connections after 10 min

function createClient(email, password) {
  return new ImapFlow({
    host: ICLOUD_HOST,
    port: ICLOUD_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
}

async function getPooledClient(email, password) {
  const existing = pool.get(email);
  if (existing) {
    // Check if connection is still alive
    if (existing.client.usable) {
      existing.lastUsed = Date.now();
      return existing.client;
    }
    // Dead connection — clean up
    pool.delete(email);
    existing.client.close().catch(() => {});
  }

  const client = createClient(email, password);
  await client.connect();
  pool.set(email, { client, lastUsed: Date.now() });

  // Auto-cleanup on unexpected close
  client.on("close", () => {
    const entry = pool.get(email);
    if (entry?.client === client) pool.delete(email);
  });

  return client;
}

// Periodically close idle connections
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of pool) {
    if (now - entry.lastUsed > POOL_TTL) {
      pool.delete(email);
      entry.client.logout().catch(() => {});
    }
  }
}, 60_000);

export async function fetchEmails(account, password, hoursBack) {
  const client = await getPooledClient(account.email, password);
  const emails = [];
  const lock = await client.getMailboxLock("INBOX");

  try {
    const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const sinceDate = new Date(
      cutoffDate.getFullYear(),
      cutoffDate.getMonth(),
      cutoffDate.getDate(),
    );

    const searchResults = await client.search({ since: sinceDate });
    if (!searchResults.length) return [];

    for await (const msg of client.fetch(searchResults, {
      envelope: true,
      bodyStructure: true,
      source: { start: 0, maxLength: 16384 },
    })) {
      const msgDate = msg.envelope?.date;
      if (msgDate && new Date(msgDate) < cutoffDate) continue;

      const from = msg.envelope?.from?.[0];
      const fromName = from?.name || from?.address || "Unknown";
      const fromAddress = from?.address || "";

      emails.push({
        uid: `icloud-${msg.uid}`,
        account_id: account.id,
        account_label: account.label,
        account_email: account.email,
        account_color: account.color,
        account_icon: account.icon || "🍎",
        from: fromName,
        from_email: fromAddress,
        subject: msg.envelope?.subject || "(no subject)",
        body_preview: extractPreview(msg.source),
        date: msgDate ? new Date(msgDate).toISOString() : "",
      });
    }
  } finally {
    lock.release();
  }

  // Connection stays alive in pool for body fetches
  return emails;
}

function extractAmounts(text) {
  const matches = text.match(/\$\d[\d,]*\.\d{2}/g);
  if (!matches || matches.length === 0) return "";
  const unique = [...new Set(matches)].slice(0, 10);
  return ` [amounts: ${unique.join(", ")}]`;
}

function extractPreview(source) {
  if (!source) return "";
  const text = source.toString("utf8");
  const bodyStart = text.indexOf("\r\n\r\n");
  if (bodyStart === -1) return "";
  const body = text.slice(bodyStart + 4);
  const clean = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const amounts = extractAmounts(clean);
  return clean.slice(0, 600) + amounts;
}

export async function fetchEmailBody(email, password, uid) {
  const imapUid = parseInt(uid.replace("icloud-", ""), 10);
  const client = await getPooledClient(email, password);
  const lock = await client.getMailboxLock("INBOX");

  try {
    const msg = await client.fetchOne(String(imapUid), {
      source: true,
      envelope: true,
    }, { uid: true });

    if (!msg) throw new Error(`Message UID ${imapUid} not found`);

    const parsed = await simpleParser(msg.source);

    return {
      html_body: parsed.html || parsed.textAsHtml || parsed.text || "",
      subject: parsed.subject || msg.envelope?.subject || "",
      from: parsed.from?.text || msg.envelope?.from?.[0]?.name || "",
      date: parsed.date ? parsed.date.toISOString() : "",
    };
  } finally {
    lock.release();
  }
}

export async function testConnection(email, password) {
  const client = createClient(email, password);
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch (err) {
    throw new Error(`iCloud IMAP connection failed: ${err.message}`);
  }
}
