import db from "../db/connection.js";

// split Gmail's "Display Name <addr>" into components
// iCloud already provides from_email separately
export function parseFrom(email) {
  if (email.from_email) {
    return { fromName: email.from || "", fromAddress: email.from_email };
  }

  const raw = email.from || "";
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      fromName: match[1].replace(/^["']|["']$/g, "").trim(),
      fromAddress: match[2],
    };
  }

  if (raw.includes("@")) {
    return { fromName: "", fromAddress: raw.trim() };
  }

  return { fromName: raw, fromAddress: "" };
}

export async function isIndexEmpty(userId) {
  const result = await db.execute({
    sql: "SELECT 1 FROM ea_email_index WHERE user_id = ? LIMIT 1",
    args: [userId],
  });
  return result.rows.length === 0;
}

export async function indexEmails(userId, emails) {
  if (!emails.length) return;

  const stmts = emails.flatMap((email) => {
    const { fromName, fromAddress } = parseFrom(email);
    const uid = email.uid;
    const args = [
      uid, userId, email.account_id, email.account_label,
      email.account_email, email.account_color || "#818cf8",
      email.account_icon || "📧", fromName, fromAddress,
      email.subject || "", email.body_preview || "",
      email.date || "", email.read ? 1 : 0,
    ];
    return [
      {
        sql: `INSERT OR IGNORE INTO ea_email_index
              (uid, user_id, account_id, account_label, account_email,
               account_color, account_icon, from_name, from_address,
               subject, body_snippet, email_date, read)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args,
      },
      // FTS5 has no UNIQUE constraint on uid, so OR IGNORE is a no-op.
      // Delete any prior row for this uid before inserting to prevent duplicates.
      {
        sql: `DELETE FROM ea_email_fts WHERE uid = ?`,
        args: [uid],
      },
      {
        sql: `INSERT INTO ea_email_fts
              (uid, from_name, from_address, subject, body_snippet)
              VALUES (?, ?, ?, ?, ?)`,
        args: [uid, fromName, fromAddress, email.subject || "", email.body_preview || ""],
      },
    ];
  });

  await db.batch(stmts);
  console.log(`[EA] Indexed ${emails.length} emails`);
}
