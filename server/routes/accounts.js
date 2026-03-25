import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { encrypt, decrypt } from "../briefing/encryption.js";
import { getAuthUrl, handleCallback, testConnection as testGmail } from "../briefing/gmail.js";
import { testConnection as testIcloud } from "../briefing/icloud.js";
import { geocodeLocation } from "../briefing/weather.js";

const router = Router();

// Gmail OAuth callback — no auth required (it's a redirect from Google)
router.get("/accounts/gmail/callback", async (req, res) => {
  const { code, state: accountId } = req.query;
  if (!code || !accountId) return res.status(400).send("Missing code or state parameter");

  try {
    const [userId, label] = accountId.split(":");
    const result = await handleCallback(code, accountId, userId);
    if (label && label !== "Gmail") {
      await db.execute({ sql: "UPDATE ea_accounts SET label = ? WHERE id = ?", args: [label, result.accountId] });
    }
    const baseUrl = process.env.NODE_ENV === "production" ? "" : "http://localhost:5173";
    res.redirect(`${baseUrl}/settings?account_connected=${result.email}`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    res.status(500).send(`OAuth failed: ${err.message}`);
  }
});

// All other routes require auth
router.use(requireAuth);

router.get("/accounts", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: "SELECT id, type, email, label, color, icon, calendar_enabled, created_at FROM ea_accounts WHERE user_id = ?",
      args: [userId],
    });
    res.json(result.rows);
  } catch (err) {
    console.error("Error listing accounts:", err);
    res.status(500).json({ message: "Failed to list accounts" });
  }
});

router.get("/accounts/gmail/auth", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const label = req.query.label || "Gmail";
  const accountId = `${userId}:${label}`;
  res.json({ url: getAuthUrl(accountId) });
});

router.post("/accounts/icloud", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { email, password, label, color } = req.body;
  if (!email || !password) return res.status(400).json({ message: "email and password (app-specific) are required" });

  try {
    await testIcloud(email, password);
    const accountId = `icloud-${email.split("@")[0]}`;
    await db.execute({
      sql: `INSERT INTO ea_accounts (id, user_id, type, email, label, color, credentials_encrypted)
            VALUES (?, ?, 'icloud', ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              credentials_encrypted = excluded.credentials_encrypted, label = excluded.label,
              color = excluded.color, updated_at = datetime('now')`,
      args: [accountId, userId, email, label || email, color || "#a259ff", encrypt(password)],
    });
    res.json({ id: accountId, email, label: label || email });
  } catch (err) {
    console.error("Error adding iCloud account:", err);
    res.status(400).json({ message: err.message });
  }
});

router.post("/accounts/test/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: "SELECT * FROM ea_accounts WHERE id = ? AND user_id = ?", args: [id, userId],
    });
    if (!result.rows.length) return res.status(404).json({ message: "Account not found" });
    const account = result.rows[0];
    if (account.type === "gmail") await testGmail(account);
    else if (account.type === "icloud") await testIcloud(account.email, decrypt(account.credentials_encrypted));
    res.json({ success: true });
  } catch (err) {
    console.error("Error testing account:", err);
    res.status(400).json({ message: err.message });
  }
});

router.patch("/accounts/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  const { calendar_enabled, label, color, icon } = req.body;
  try {
    const updates = [];
    const args = [];
    if (calendar_enabled !== undefined) { updates.push("calendar_enabled = ?"); args.push(calendar_enabled ? 1 : 0); }
    if (label !== undefined) { updates.push("label = ?"); args.push(label); }
    if (color !== undefined) { updates.push("color = ?"); args.push(color); }
    if (icon !== undefined) { updates.push("icon = ?"); args.push(icon || null); }
    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      args.push(id, userId);
      await db.execute({
        sql: `UPDATE ea_accounts SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
        args,
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating account:", err);
    res.status(500).json({ message: "Failed to update account" });
  }
});

router.delete("/accounts/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: "DELETE FROM ea_accounts WHERE id = ? AND user_id = ?", args: [id, userId],
    });
    if (result.rowsAffected === 0) return res.status(404).json({ message: "Account not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting account:", err);
    res.status(500).json({ message: "Failed to delete account" });
  }
});

router.get("/geocode", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ message: "q parameter required" });
  try {
    res.json(await geocodeLocation(q));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/settings", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    let result = await db.execute({ sql: "SELECT * FROM ea_settings WHERE user_id = ?", args: [userId] });
    if (!result.rows.length) {
      await db.execute({ sql: "INSERT INTO ea_settings (user_id) VALUES (?)", args: [userId] });
      result = await db.execute({ sql: "SELECT * FROM ea_settings WHERE user_id = ?", args: [userId] });
    }
    const { actual_budget_password_encrypted, ...safe } = result.rows[0];
    safe.actual_budget_configured = !!actual_budget_password_encrypted;
    res.json(safe);
  } catch (err) {
    console.error("Error fetching EA settings:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

router.put("/settings", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { schedules_json, email_lookback_hours, weather_lat, weather_lng, weather_location, actual_budget_url, actual_budget_password, actual_budget_sync_id } = req.body;

  try {
    await db.execute({ sql: "INSERT OR IGNORE INTO ea_settings (user_id) VALUES (?)", args: [userId] });
    const updates = [];
    const args = [];

    if (schedules_json !== undefined) { updates.push("schedules_json = ?"); args.push(typeof schedules_json === "string" ? schedules_json : JSON.stringify(schedules_json)); }
    if (email_lookback_hours !== undefined) { updates.push("email_lookback_hours = ?"); args.push(email_lookback_hours); }
    if (weather_lat !== undefined) { updates.push("weather_lat = ?"); args.push(weather_lat); }
    if (weather_lng !== undefined) { updates.push("weather_lng = ?"); args.push(weather_lng); }
    if (weather_location !== undefined) { updates.push("weather_location = ?"); args.push(weather_location); }
    if (actual_budget_url !== undefined) { updates.push("actual_budget_url = ?"); args.push(actual_budget_url); }
    if (actual_budget_password !== undefined) { updates.push("actual_budget_password_encrypted = ?"); args.push(actual_budget_password ? encrypt(actual_budget_password) : null); }
    if (actual_budget_sync_id !== undefined) { updates.push("actual_budget_sync_id = ?"); args.push(actual_budget_sync_id); }

    if (updates.length > 0) {
      args.push(userId);
      await db.execute({ sql: `UPDATE ea_settings SET ${updates.join(", ")} WHERE user_id = ?`, args });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating EA settings:", err);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

export default router;
