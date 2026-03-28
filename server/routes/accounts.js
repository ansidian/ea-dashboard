import { Router } from "express";
import crypto from "crypto";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { encrypt, decrypt } from "../briefing/encryption.js";
import { getAuthUrl, handleCallback, testConnection as testGmail } from "../briefing/gmail.js";
import { testConnection as testIcloud } from "../briefing/icloud.js";
import { geocodeLocation } from "../briefing/weather.js";
import { listModels } from "../briefing/claude.js";
import { initScheduler } from "../briefing/scheduler.js";
import { isEmbeddingAvailable } from "../embeddings/index.js";

const router = Router();

// Gmail OAuth callback — no auth required (it's a redirect from Google)
router.get("/accounts/gmail/callback", async (req, res) => {
  const { code, state: csrfToken } = req.query;
  if (!code || !csrfToken) {
    return res.status(400).send("Missing code or state parameter");
  }

  try {
    // Validate CSRF token (SEC-03)
    const csrfResult = await db.execute({
      sql: "SELECT account_label, expires_at FROM ea_csrf_tokens WHERE token = ?",
      args: [csrfToken],
    });

    if (!csrfResult.rows.length) {
      return res.status(400).send("Invalid OAuth state - CSRF validation failed");
    }

    const csrfRow = csrfResult.rows[0];

    // Delete token immediately (one-time use)
    await db.execute({
      sql: "DELETE FROM ea_csrf_tokens WHERE token = ?",
      args: [csrfToken],
    });

    // Check expiry
    if (Date.now() > csrfRow.expires_at) {
      return res.status(400).send("OAuth state expired - please try again");
    }

    // Recover userId and label from DB (tamper-proof)
    const [userId, label] = csrfRow.account_label.split(":");
    const accountId = csrfRow.account_label;

    const result = await handleCallback(code, accountId, userId);
    if (label && label !== "Gmail") {
      await db.execute({
        sql: "UPDATE ea_accounts SET label = ? WHERE id = ?",
        args: [label, result.accountId],
      });
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

router.post("/suspend", async (req, res) => {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    return res.status(400).json({ message: "Render API not configured" });
  }
  res.json({ ok: true });
  setTimeout(async () => {
    try {
      const resp = await fetch(
        `https://api.render.com/v1/services/${serviceId}/suspend`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `${apiKey}`,
          },
        },
      );
      if (!resp.ok)
        console.error(
          "[EA] Render suspend HTTP",
          resp.status,
          await resp.text().catch(() => ""),
        );
      else console.log("[EA] Render service suspended");
    } catch (err) {
      console.error("[EA] Render suspend failed:", err.message);
    }
  }, 2000);
});

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

  // Generate CSRF token and store with label
  const csrfToken = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  await db.execute({
    sql: "INSERT INTO ea_csrf_tokens (token, account_label, expires_at) VALUES (?, ?, ?)",
    args: [csrfToken, `${userId}:${label}`, expiresAt],
  });

  res.json({ url: getAuthUrl(csrfToken) });
});

router.post("/accounts/icloud", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { email, password, label, color } = req.body;
  if (!email || !password)
    return res
      .status(400)
      .json({ message: "email and password (app-specific) are required" });

  try {
    await testIcloud(email, password);
    const accountId = `icloud-${email.split("@")[0]}`;
    await db.execute({
      sql: `INSERT INTO ea_accounts (id, user_id, type, email, label, color, credentials_encrypted)
            VALUES (?, ?, 'icloud', ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              credentials_encrypted = excluded.credentials_encrypted, label = excluded.label,
              color = excluded.color, updated_at = datetime('now')`,
      args: [
        accountId,
        userId,
        email,
        label || email,
        color || "#a259ff",
        encrypt(password),
      ],
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
      sql: "SELECT * FROM ea_accounts WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (!result.rows.length)
      return res.status(404).json({ message: "Account not found" });
    const account = result.rows[0];
    if (account.type === "gmail") await testGmail(account);
    else if (account.type === "icloud")
      await testIcloud(account.email, decrypt(account.credentials_encrypted));
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
    if (calendar_enabled !== undefined) {
      updates.push("calendar_enabled = ?");
      args.push(calendar_enabled ? 1 : 0);
    }
    if (label !== undefined) {
      updates.push("label = ?");
      args.push(label);
    }
    if (color !== undefined) {
      updates.push("color = ?");
      args.push(color);
    }
    if (icon !== undefined) {
      updates.push("icon = ?");
      args.push(icon || null);
    }
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
      sql: "DELETE FROM ea_accounts WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (result.rowsAffected === 0)
      return res.status(404).json({ message: "Account not found" });
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
    let result = await db.execute({
      sql: "SELECT * FROM ea_settings WHERE user_id = ?",
      args: [userId],
    });
    if (!result.rows.length) {
      await db.execute({
        sql: "INSERT INTO ea_settings (user_id) VALUES (?)",
        args: [userId],
      });
      result = await db.execute({
        sql: "SELECT * FROM ea_settings WHERE user_id = ?",
        args: [userId],
      });
    }
    const {
      actual_budget_password_encrypted,
      schedules_json,
      email_interests_json,
      ...safe
    } = result.rows[0];
    safe.actual_budget_configured = !!actual_budget_password_encrypted;
    safe.schedules = schedules_json
      ? JSON.parse(schedules_json)
      : [
          { label: "Morning Briefing", time: "08:00", enabled: false },
          { label: "Evening Briefing", time: "20:00", enabled: false },
        ];
    safe.email_interests = email_interests_json
      ? JSON.parse(email_interests_json)
      : [];

    // Render suspend availability
    safe.render_configured =
      !!(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) ||
      process.env.NODE_ENV !== "production";

    // Embedding/RAG status
    safe.openai_available = isEmbeddingAvailable();
    try {
      const countResult = await db.execute({
        sql: "SELECT COUNT(*) as count FROM ea_embeddings WHERE user_id = ?",
        args: [userId],
      });
      safe.embedding_count = countResult.rows[0].count;
    } catch {
      safe.embedding_count = 0;
    }

    res.json(safe);
  } catch (err) {
    console.error("Error fetching EA settings:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

router.put("/settings", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { schedules_json, email_lookback_hours, weather_lat, weather_lng, weather_location, actual_budget_url, actual_budget_password, actual_budget_sync_id, claude_model, email_interests_json } = req.body;

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
    if (claude_model !== undefined) { updates.push("claude_model = ?"); args.push(claude_model || null); }
    if (email_interests_json !== undefined) { updates.push("email_interests_json = ?"); args.push(typeof email_interests_json === "string" ? email_interests_json : JSON.stringify(email_interests_json)); }

    if (updates.length > 0) {
      args.push(userId);
      await db.execute({ sql: `UPDATE ea_settings SET ${updates.join(", ")} WHERE user_id = ?`, args });
    }

    // Hot-reload cron jobs when schedules change (no server restart needed)
    if (schedules_json !== undefined) {
      initScheduler().catch(err => console.error("[EA Scheduler] Re-init failed:", err.message));
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating EA settings:", err);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

router.post("/schedules/skip", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { index, skip } = req.body;
  if (index === undefined) return res.status(400).json({ message: "index is required" });

  try {
    const result = await db.execute({ sql: "SELECT schedules_json FROM ea_settings WHERE user_id = ?", args: [userId] });
    const schedules = JSON.parse(result.rows[0]?.schedules_json || "[]");
    if (index < 0 || index >= schedules.length) return res.status(400).json({ message: "Invalid schedule index" });

    if (skip === false) {
      delete schedules[index].skipped_until;
    } else {
      // Skip until midnight tomorrow in the schedule's timezone, stored as UTC
      const tz = schedules[index].tz || "America/Los_Angeles";
      // Get tomorrow's date in the schedule's timezone
      const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
      const tomorrowDate = formatter.format(new Date(Date.now() + 86400000));
      // Parse midnight-tomorrow in the target timezone by finding the UTC offset
      const midnight = new Date(`${tomorrowDate}T00:00:00`);
      // Get the offset: format a known instant in the target tz, then compute the difference
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }).formatToParts(midnight);
      const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
      const asLocal = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
      const offsetMs = midnight.getTime() - asLocal.getTime();
      const midnightUtc = new Date(midnight.getTime() + offsetMs);
      schedules[index].skipped_until = midnightUtc.toISOString();
    }

    await db.execute({
      sql: "UPDATE ea_settings SET schedules_json = ? WHERE user_id = ?",
      args: [JSON.stringify(schedules), userId],
    });

    res.json({ success: true, schedules });
  } catch (err) {
    console.error("Error toggling schedule skip:", err);
    res.status(500).json({ message: "Failed to update schedule" });
  }
});

router.get("/models", async (req, res) => {
  try {
    const models = await listModels();
    res.json(models);
  } catch (err) {
    console.error("Error fetching models:", err.message);
    res.status(500).json({ message: err.message });
  }
});

export default router;
