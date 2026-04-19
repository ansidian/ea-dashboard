import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import dev from "./dev.js";
import bills from "./bills.js";
import email from "./email.js";
import tasks from "./tasks.js";
import lifecycle from "./lifecycle.js";

const router = Router();
router.use(requireAuth);

// More-specific sub-routers first; lifecycle mounts LAST because /:id is a greedy one-segment catch-all.
router.use(dev);
router.use(email);
router.use(tasks);
router.use(bills);
router.use(lifecycle);

export default router;
