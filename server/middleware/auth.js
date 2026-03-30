import crypto from "crypto";
import db from "../db/connection.js";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function deleteSession(token) {
  await db.execute({
    sql: "DELETE FROM ea_sessions WHERE token = ?",
    args: [token],
  });
}

export async function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  await db.execute({
    sql: "INSERT INTO ea_sessions (token, expires_at) VALUES (?, ?)",
    args: [token, expiresAt],
  });
  return token;
}

export async function validateSession(token) {
  if (!token) return false;
  const result = await db.execute({
    sql: "SELECT expires_at FROM ea_sessions WHERE token = ?",
    args: [token],
  });
  if (!result.rows.length) return false;
  if (Date.now() > result.rows[0].expires_at) {
    // Lazy cleanup — delete expired session
    await db.execute({
      sql: "DELETE FROM ea_sessions WHERE token = ?",
      args: [token],
    });
    return false;
  }
  return true;
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.ea_session;
  if (!await validateSession(token)) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}
