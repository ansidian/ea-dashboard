import { Router } from "express";
import { createSession, validateSession } from "../middleware/auth.js";

const router = Router();
const EA_PASSWORD = process.env.EA_PASSWORD;

router.post("/login", (req, res) => {
  const { password } = req.body;
  if (!EA_PASSWORD || password !== EA_PASSWORD) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = createSession();
  res.cookie("ea_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  res.json({ authenticated: true });
});

router.get("/check", (req, res) => {
  const token = req.cookies?.ea_session;
  res.json({ authenticated: validateSession(token) });
});

router.post("/logout", (req, res) => {
  res.clearCookie("ea_session");
  res.json({ authenticated: false });
});

export default router;
