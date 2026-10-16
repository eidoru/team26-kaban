import { Router } from "express";
import { requireCronSecret } from "../middleware/auth.js";
import { activateDueGroups } from "../services/launch.js";

/** Scheduled jobs (vercel.json). Each is idempotent, so a retry or a double run is harmless. */
const router = Router();
router.use(requireCronSecret);

/** R-LCH-04 */
router.get("/activate-groups", async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await activateDueGroups()) });
  } catch (err) {
    next(err);
  }
});

export default router;
