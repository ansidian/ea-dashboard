import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { generateBriefing, quickRefresh } from "../briefing/index.js";
import { fetchEmailBody as fetchGmailBody } from "../briefing/gmail.js";
import { fetchEmailBody as fetchIcloudBody } from "../briefing/icloud.js";
import { decrypt } from "../briefing/encryption.js";
import { sendBill, testConnection as testActual } from "../briefing/actual.js";

const router = Router();
router.use(requireAuth);

const GENERATION_COOLDOWN_MINUTES = 10;

router.post("/generate", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const force = req.body?.force === true;

  try {
    if (!force) {
      const recent = await db.execute({
        sql: `SELECT id, generated_at FROM ea_briefings
              WHERE user_id = ? AND status = 'ready'
              ORDER BY generated_at DESC LIMIT 1`,
        args: [userId],
      });

      if (recent.rows.length) {
        const generatedAt = new Date(recent.rows[0].generated_at + "Z").getTime();
        const minutesAgo = (Date.now() - generatedAt) / 60000;

        if (minutesAgo < GENERATION_COOLDOWN_MINUTES) {
          return res.json({
            id: recent.rows[0].id,
            status: "cooldown",
            minutesRemaining: Math.ceil(GENERATION_COOLDOWN_MINUTES - minutesAgo),
            message: `AI briefing was generated ${Math.floor(minutesAgo)}m ago. Next generation available in ${Math.ceil(GENERATION_COOLDOWN_MINUTES - minutesAgo)}m.`,
          });
        }
      }
    }

    generateBriefing(userId).catch((err) =>
      console.error("[Briefing] Generation failed:", err.message),
    );

    await new Promise((r) => setTimeout(r, 100));
    const latest = await db.execute({
      sql: `SELECT id FROM ea_briefings WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      args: [userId],
    });

    res.json({ id: latest.rows[0]?.id, status: "generating" });
  } catch (err) {
    console.error("Error triggering briefing:", err);
    res.status(500).json({ message: "Failed to trigger briefing generation" });
  }
});

router.post("/refresh", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await quickRefresh(userId);
    res.json(result);
  } catch (err) {
    console.error("Error refreshing briefing:", err);
    res.status(500).json({ message: "Failed to refresh briefing data" });
  }
});

router.get("/latest", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, briefing_json, generated_at, generation_time_ms
            FROM ea_briefings
            WHERE user_id = ? AND status = 'ready'
            ORDER BY generated_at DESC LIMIT 1`,
      args: [userId],
    });

    if (!result.rows.length) return res.json({ briefing: null });

    const row = result.rows[0];
    res.json({
      id: row.id,
      status: row.status,
      briefing: JSON.parse(row.briefing_json),
      generated_at: row.generated_at,
      generation_time_ms: row.generation_time_ms,
    });
  } catch (err) {
    console.error("Error fetching latest briefing:", err);
    res.status(500).json({ message: "Failed to fetch latest briefing" });
  }
});

router.get("/history", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, generated_at, generation_time_ms, error_message
            FROM ea_briefings WHERE user_id = ?
            ORDER BY generated_at DESC LIMIT 20`,
      args: [userId],
    });
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching briefing history:", err);
    res.status(500).json({ message: "Failed to fetch briefing history" });
  }
});

router.get("/status/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, error_message, generation_time_ms
            FROM ea_briefings WHERE id = ? AND user_id = ?`,
      args: [id, userId],
    });
    if (!result.rows.length) return res.status(404).json({ message: "Briefing not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching briefing status:", err);
    res.status(500).json({ message: "Failed to fetch briefing status" });
  }
});

router.get("/email/:uid", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { uid } = req.params;
  try {
    if (uid.startsWith("icloud-")) {
      const accounts = await db.execute({
        sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND type = 'icloud'",
        args: [userId],
      });
      if (!accounts.rows.length) return res.status(404).json({ message: "No iCloud account found" });
      const account = accounts.rows[0];
      const password = decrypt(account.credentials_encrypted);
      return res.json(await fetchIcloudBody(account.email, password, uid));
    } else {
      const accounts = await db.execute({
        sql: "SELECT * FROM ea_accounts WHERE user_id = ? AND type = 'gmail'",
        args: [userId],
      });
      for (const account of accounts.rows) {
        try { return res.json(await fetchGmailBody(account, uid)); } catch { continue; }
      }
      return res.status(404).json({ message: "Email not found in any account" });
    }
  } catch (err) {
    console.error("Error fetching email body:", err);
    res.status(500).json({ message: "Failed to fetch email body" });
  }
});

router.get("/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: `SELECT id, status, briefing_json, generated_at, generation_time_ms
            FROM ea_briefings WHERE id = ? AND user_id = ? AND status = 'ready'`,
      args: [id, userId],
    });
    if (!result.rows.length) return res.status(404).json({ message: "Briefing not found" });
    const row = result.rows[0];
    res.json({
      id: row.id, status: row.status, briefing: JSON.parse(row.briefing_json),
      generated_at: row.generated_at, generation_time_ms: row.generation_time_ms,
    });
  } catch (err) {
    console.error("Error fetching briefing by ID:", err);
    res.status(500).json({ message: "Failed to fetch briefing" });
  }
});

router.post("/actual/send", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const billData = req.body;
  if (!billData?.payee || !billData?.amount || !billData?.type) {
    return res.status(400).json({ message: "payee, amount, and type are required" });
  }
  try {
    res.json(await sendBill(billData, userId));
  } catch (err) {
    console.error("Error sending to Actual Budget:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/actual/test", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await testActual(userId));
  } catch (err) {
    console.error("Actual Budget test failed:", err.message);
    res.status(400).json({ message: err.message || "Connection failed" });
  }
});

export default router;
