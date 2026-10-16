import { Router } from "express";
import { requireCronSecret } from "../middleware/auth.js";
import { activateDueGroups } from "../services/launch.js";
import { closeDueRounds, nudgeUnconfirmedPayouts } from "../services/payouts.js";
import { expireStaleSwaps } from "../services/swaps.js";
import { sendDueReminders } from "../services/reminders.js";

/** Scheduled jobs (vercel.json). Each is idempotent, so a retry or a double run is harmless. */
const router = Router();
router.use(requireCronSecret);

/**
 * Once a day, just after midnight Manila: start every launched group whose start date has come
 * (R-LCH-04), then close every period whose payout date has passed and process its payout (§7,
 * R-DEC-18), expire timed-out swap requests (R-SWP-04), send payment reminders (§12), and nudge or
 * auto-confirm payouts nobody has confirmed (R-DEC-07).
 *
 * Starting groups first matters after an outage: a group that should have started days ago is
 * started and then caught up on every payout date it missed, in this same run, in order.
 */
router.get("/daily", async (_req, res, next) => {
  try {
    const groups = await activateDueGroups();
    const rounds = await closeDueRounds();
    const swaps = await expireStaleSwaps();
    const reminders = await sendDueReminders();
    const receipts = await nudgeUnconfirmedPayouts();
    res.json({ ok: true, ...rounds, ...groups, ...swaps, ...reminders, ...receipts });
  } catch (err) {
    next(err);
  }
});

export default router;
