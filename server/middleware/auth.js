import crypto from "crypto";

// In-memory session store (sessions lost on restart — acceptable for single-user)
const sessions = new Map();
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession() {
  const token = crypto.randomUUID();
  sessions.set(token, { expiresAt: Date.now() + SESSION_MAX_AGE_MS });
  return token;
}

export function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.ea_session;
  if (!validateSession(token)) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}
