import { Router } from "express";
import crypto from "crypto";
import { createSession, validateSession } from "../middleware/auth.js";

const router = Router();
const EA_PASSWORD = process.env.EA_PASSWORD;

router.post("/login", async (req, res) => {
  const { password } = req.body;

  if (!EA_PASSWORD) {
    return res.status(401).json({ message: "Invalid password" });
  }

  // Timing-safe comparison (SEC-02)
  const passwordBuffer = Buffer.from(password || "", "utf8");
  const expectedBuffer = Buffer.from(EA_PASSWORD, "utf8");
  if (
    passwordBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(passwordBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = await createSession();
  res.cookie("ea_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ authenticated: true });
});

router.get("/check", async (req, res) => {
  const token = req.cookies?.ea_session;
  res.json({ authenticated: await validateSession(token) });
});

router.post("/logout", (req, res) => {
  res.clearCookie("ea_session");
  res.json({ authenticated: false });
});

export default router;
