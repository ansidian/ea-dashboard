import "dotenv/config";

process.on("unhandledRejection", (err) => {
  console.error("[Unhandled Rejection]", err?.message || err);
});

import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import authRoutes from "./routes/auth.js";
import briefingRoutes from "./routes/briefing.js";
import accountsRoutes from "./routes/accounts.js";
import searchRoutes from "./routes/search.js";
import { initScheduler } from "./briefing/scheduler.js";
import { migrate } from "./db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/briefing", briefingRoutes);
app.use("/api/ea", accountsRoutes);
app.use("/api/search", searchRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(__dirname, "../dist")));

  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ message: "Not found" });
    }
    res.sendFile(join(__dirname, "../dist/index.html"));
  });
}

migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`EA Dashboard running on http://localhost:${PORT}`);
    initScheduler().catch((err) =>
      console.error("[EA Scheduler] Init failed:", err.message),
    );
  });
}).catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
