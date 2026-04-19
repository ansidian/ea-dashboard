import { Router } from "express";
import { listScenarios } from "../../db/scenarios/index.js";
import * as devService from "../../briefing/dev-service.js";

const router = Router();
const EA_USER_ID = process.env.EA_USER_ID;

router.get("/scenarios", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }
  res.json(listScenarios());
});

router.post("/dev-reindex-emails", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }
  const hoursBack = Math.min(parseInt(req.query.hours) || 720, 2160);
  try {
    const result = await devService.reindexEmails(EA_USER_ID, hoursBack);
    res.json(result);
  } catch (err) {
    console.error("[EA] Dev reindex failed:", err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
