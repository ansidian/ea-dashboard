import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import email from "./email.js";
import tasks from "./tasks.js";
import bills from "./bills.js";
import dev from "./dev.js";

const router = Router();
router.use(requireAuth);

// More-specific sub-routers first; lifecycle (with greedy /:id) mounts last.
router.use(email);
router.use(tasks);
router.use(bills);
router.use(dev);

export default router;
