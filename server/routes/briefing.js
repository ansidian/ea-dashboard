import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { generateBriefing, quickRefresh } from "../briefing/index.js";
import { fetchEmailBody as fetchGmailBody } from "../briefing/gmail.js";
import { fetchEmailBody as fetchIcloudBody } from "../briefing/icloud.js";
import { decrypt } from "../briefing/encryption.js";
import { sendBill, getAccounts as getActualAccounts, testConnection as testActual } from "../briefing/actual.js";
import { generateMockBriefing, generateMockHistory } from "../db/dev-fixture.js";

const router = Router();
router.use(requireAuth);


// Merge current account display preferences (label, color, icon) into a briefing object.
// This ensures user changes are reflected immediately without regenerating.
async function mergeAccountPrefs(briefing, userId) {
  if (!briefing?.emails?.accounts?.length) return briefing;
  const result = await db.execute({
    sql: "SELECT id, email, label, color, icon FROM ea_accounts WHERE user_id = ?",
    args: [userId],
  });
  const byEmail = new Map(result.rows.map(a => [a.email, a]));
  const byLabel = new Map(result.rows.map(a => [a.label, a]));
  for (const acc of briefing.emails.accounts) {
    const dbAcc = byLabel.get(acc.name) || byEmail.get(acc.name);
    if (dbAcc) {
      acc.name = dbAcc.label;
      acc.color = dbAcc.color || acc.color;
      acc.icon = dbAcc.icon || acc.icon;
    }
  }
  return briefing;
}

router.post("/generate", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
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

router.get("/in-progress", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await db.execute({
      sql: `SELECT id, progress FROM ea_briefings
            WHERE user_id = ? AND status = 'generating'
            ORDER BY id DESC LIMIT 1`,
      args: [userId],
    });
    if (!result.rows.length) return res.json({ generating: false });
    res.json({ generating: true, id: result.rows[0].id, progress: result.rows[0].progress });
  } catch (err) {
    res.json({ generating: false });
  }
});

router.post("/refresh", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await quickRefresh(userId);
    result.briefingJson = await mergeAccountPrefs(result.briefingJson, userId);
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

    if (!result.rows.length) {
      // In dev, return a dynamic mock briefing so the UI is always usable
      if (process.env.NODE_ENV !== "production") {
        return res.json({ id: 0, status: "ready", briefing: generateMockBriefing(), generated_at: new Date().toISOString(), generation_time_ms: 0 });
      }
      return res.json({ briefing: null });
    }

    const row = result.rows[0];
    const briefing = await mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
    res.json({
      id: row.id,
      status: row.status,
      briefing,
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
    if (!result.rows.length && process.env.NODE_ENV !== "production") {
      return res.json(generateMockHistory());
    }
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
      sql: `SELECT id, status, error_message, generation_time_ms, progress
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
    if (!result.rows.length) {
      if (process.env.NODE_ENV !== "production") {
        const mockHistory = generateMockHistory();
        const match = mockHistory.find(h => h.id === Number(id));
        if (match) {
          return res.json({ id: match.id, status: "ready", briefing: generateMockBriefing(), generated_at: match.generated_at, generation_time_ms: match.generation_time_ms });
        }
      }
      return res.status(404).json({ message: "Briefing not found" });
    }
    const row = result.rows[0];
    const briefing = await mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
    res.json({
      id: row.id, status: row.status, briefing,
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

router.get("/actual/accounts", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    res.json(await getActualAccounts(userId));
  } catch (err) {
    console.error("Error fetching Actual Budget accounts:", err.message);
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
