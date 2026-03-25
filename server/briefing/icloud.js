import { ImapFlow } from "imapflow";

const ICLOUD_HOST = "imap.mail.me.com";
const ICLOUD_PORT = 993;

function createClient(email, password) {
  return new ImapFlow({
    host: ICLOUD_HOST,
    port: ICLOUD_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
}

export async function fetchEmails(account, password, hoursBack) {
  const client = createClient(account.email, password);
  const emails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // IMAP SINCE is day-granular, so we search from start of cutoff day
      const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      const sinceDate = new Date(
        cutoffDate.getFullYear(),
        cutoffDate.getMonth(),
        cutoffDate.getDate(),
      );

      const searchResults = await client.search({ since: sinceDate });
      if (!searchResults.length) return [];

      // Fetch headers + preview for matching messages
      for await (const msg of client.fetch(searchResults, {
        envelope: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 2048 }, // first 2KB for preview
      })) {
        const msgDate = msg.envelope?.date;
        // Filter by actual datetime (not just date) since IMAP SINCE is day-granular
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
  } finally {
    await client.logout().catch(() => {});
  }

  return emails;
}

function extractPreview(source) {
  if (!source) return "";
  const text = source.toString("utf8");
  // Try to find plain text after headers
  const bodyStart = text.indexOf("\r\n\r\n");
  if (bodyStart === -1) return "";
  const body = text.slice(bodyStart + 4);
  // Strip HTML tags if present, take first 200 chars
  const clean = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 200);
}

export async function fetchEmailBody(email, password, uid) {
  // Strip the "icloud-" prefix to get the IMAP UID
  const imapUid = parseInt(uid.replace("icloud-", ""), 10);
  const client = createClient(email, password);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const msg = await client.fetchOne(imapUid, {
        source: true,
        envelope: true,
      });

      if (!msg) throw new Error(`Message UID ${imapUid} not found`);

      const source = msg.source?.toString("utf8") || "";
      const htmlBody = extractMimeBody(source, "text/html");
      const textBody = extractMimeBody(source, "text/plain");

      return {
        html_body: htmlBody || textBody || "",
        subject: msg.envelope?.subject || "",
        from: msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || "",
        date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : "",
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function extractMimeBody(rawSource, targetType) {
  // Simple MIME parser: look for Content-Type boundary and extract body
  // For single-part messages, just grab the body
  const headerEnd = rawSource.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const headers = rawSource.slice(0, headerEnd).toLowerCase();
  const body = rawSource.slice(headerEnd + 4);

  // Check if this is multipart
  const boundaryMatch = headers.match(/boundary="?([^"\r\n;]+)"?/);
  if (!boundaryMatch) {
    // Single part — check if it matches target type
    if (headers.includes(targetType)) return body;
    if (targetType === "text/plain" && !headers.includes("text/html"))
      return body;
    return null;
  }

  // Multipart — split by boundary and find target type
  const boundary = boundaryMatch[1];
  const parts = body.split(`--${boundary}`);

  for (const part of parts) {
    const partHeaderEnd = part.indexOf("\r\n\r\n");
    if (partHeaderEnd === -1) continue;
    const partHeaders = part.slice(0, partHeaderEnd).toLowerCase();
    const partBody = part.slice(partHeaderEnd + 4).replace(/--\s*$/, "").trim();

    if (partHeaders.includes(targetType)) {
      // Handle base64 encoding
      if (partHeaders.includes("base64")) {
        return Buffer.from(partBody.replace(/\s/g, ""), "base64").toString(
          "utf8",
        );
      }
      // Handle quoted-printable
      if (partHeaders.includes("quoted-printable")) {
        return partBody
          .replace(/=\r?\n/g, "")
          .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
      }
      return partBody;
    }
  }

  return null;
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
