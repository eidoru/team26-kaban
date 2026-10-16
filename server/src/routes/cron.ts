import { Router } from "express";
import { requireCronSecret } from "../middleware/auth.js";
import { activateDueGroups } from "../services/launch.js";
import { closeDueRounds } from "../services/payouts.js";
import { expireStaleSwaps } from "../services/swaps.js";

/** Scheduled jobs (vercel.json). Each is idempotent, so a retry or a double run is harmless. */
const router = Router();
router.use(requireCronSecret);

/**
 * Once a day, just after midnight Manila: close every period whose payout date has passed and
 * process its payout (§7, R-DEC-18), then start every launched group whose start date has come
 * (R-LCH-04), and expire timed-out swap requests (R-SWP-04). Closing first means a group never opens
 * and closes a period in the same run.
 */
router.get("/daily", async (_req, res, next) => {
  try {
    const rounds = await closeDueRounds();
    const groups = await activateDueGroups();
    const swaps = await expireStaleSwaps();
    res.json({ ok: true, ...rounds, ...groups, ...swaps });
  } catch (err) {
    next(err);
  }
});

export default router;
