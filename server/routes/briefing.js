import { Router } from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { generateBriefing, quickRefresh } from "../briefing/index.js";
import * as storedBriefingService from "../briefing/stored-briefing-service.js";
import { generateEnrichedMock, generateMockHistory } from "../db/dev-fixture.js";
import { seedEmbeddings } from "../db/dev-seed-embeddings.js";
import { applyScenarios } from "../db/scenarios/index.js";

const router = Router();
router.use(requireAuth);

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
    console.error("[Briefing] Error checking generation status:", err.message);
    res.json({ generating: false });
  }
});

router.post("/refresh", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  try {
    const result = await quickRefresh(userId);
    result.briefingJson = await storedBriefingService.mergeAccountPrefs(result.briefingJson, userId);
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

    // ?mock=1 forces mock briefing in dev (useful when real briefings exist)
    // ?scenario=urgent-flags,noise-preview applies scenario overlays
    if (req.query.mock && process.env.NODE_ENV !== "production") {
      seedEmbeddings().catch(err => console.warn("[EA] Dev embedding seed failed:", err.message));
      const mock = await generateEnrichedMock(userId);
      const scenarioKeys = req.query.scenario ? req.query.scenario.split(",").map(s => s.trim()) : [];
      applyScenarios(mock, scenarioKeys);
      return res.json({ id: 0, status: "ready", briefing: mock, generated_at: new Date().toISOString(), generation_time_ms: 0 });
    }

    if (!result.rows.length) {
      // In dev, return a dynamic mock briefing so the UI is always usable
      if (process.env.NODE_ENV !== "production") {
        seedEmbeddings().catch(err => console.warn("[EA] Dev embedding seed failed:", err.message));
        const mock = await generateEnrichedMock(userId);
        const scenarioKeys = req.query.scenario ? req.query.scenario.split(",").map(s => s.trim()) : [];
        applyScenarios(mock, scenarioKeys);
        return res.json({ id: 0, status: "ready", briefing: mock, generated_at: new Date().toISOString(), generation_time_ms: 0 });
      }
      return res.json({ briefing: null });
    }

    const row = result.rows[0];
    const briefing = await storedBriefingService.mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
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
      sql: `SELECT id, status, generated_at, generation_time_ms, error_message,
            json_extract(briefing_json, '$.skippedAI') as skipped_ai
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

router.delete("/:id", async (req, res) => {
  const userId = process.env.EA_USER_ID;
  const { id } = req.params;
  try {
    const result = await db.execute({
      sql: "DELETE FROM ea_briefings WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (!result.rowsAffected) return res.status(404).json({ message: "Briefing not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting briefing:", err);
    res.status(500).json({ message: "Failed to delete briefing" });
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
          const mock = await generateEnrichedMock(userId);
          return res.json({ id: match.id, status: "ready", briefing: mock, generated_at: match.generated_at, generation_time_ms: match.generation_time_ms });
        }
      }
      return res.status(404).json({ message: "Briefing not found" });
    }
    const row = result.rows[0];
    const briefing = await storedBriefingService.mergeAccountPrefs(JSON.parse(row.briefing_json), userId);
    res.json({
      id: row.id, status: row.status, briefing,
      generated_at: row.generated_at, generation_time_ms: row.generation_time_ms,
    });
  } catch (err) {
    console.error("Error fetching briefing by ID:", err);
    res.status(500).json({ message: "Failed to fetch briefing" });
  }
});

export default router;
