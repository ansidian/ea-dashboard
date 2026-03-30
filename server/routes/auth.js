import { Router } from "express";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { createSession, validateSession, deleteSession } from "../middleware/auth.js";

const router = Router();
const EA_PASSWORD_HASH = process.env.EA_PASSWORD_HASH;

// Rate limit login: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body;

  if (!EA_PASSWORD_HASH || !password) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const match = await bcrypt.compare(password, EA_PASSWORD_HASH);
  if (!match) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = await createSession();
  res.cookie("ea_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ authenticated: true });
});

router.get("/check", async (req, res) => {
  const token = req.cookies?.ea_session;
  res.json({ authenticated: await validateSession(token) });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.ea_session;
  if (token) {
    await deleteSession(token);
  }
  res.clearCookie("ea_session", { path: "/" });
  res.json({ authenticated: false });
});

export default router;
