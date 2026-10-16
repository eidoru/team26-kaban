import { Router } from "express";
import { requireAuth, requireDemoTools } from "../middleware/auth.js";
import { loadGroup, requireOrganizer } from "../middleware/groupAccess.js";
import { notifyGroupChangeSafe } from "../lib/realtimeNotify.js";
import { toCalendarDate } from "../lib/today.js";
import { activateDueGroups } from "../services/launch.js";
import { closeOpenRound } from "../services/payouts.js";
import { sendDueReminders } from "../services/reminders.js";

/** Demo tools: skip the calendar. Only mounted outside production, and gated by ALLOW_DEMO_TOOLS. */
const router = Router();
router.use(requireDemoTools, requireAuth);

/** Start a launched group now instead of waiting for its start date. */
router.post("/groups/:id/activate-now", loadGroup, requireOrganizer, async (req, res, next) => {
  try {
    const result = await activateDueGroups(toCalendarDate(req.group!.startDate), req.group!.id);
    notifyGroupChangeSafe(req.group!.id, "rounds");
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** Close the open period now and process its payout, instead of waiting for the payout date. */
router.post("/groups/:id/close-round", loadGroup, requireOrganizer, async (req, res, next) => {
  try {
    const result = await closeOpenRound(req.group!.id, req.user!.id);
    notifyGroupChangeSafe(req.group!.id, "rounds");
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** Run the scheduled reminders for this group as if today were `?today=YYYY-MM-DD`. */
router.post("/groups/:id/send-reminders", loadGroup, requireOrganizer, async (req, res, next) => {
  try {
    const today = typeof req.query.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : undefined;
    res.json({ ok: true, ...(await sendDueReminders(today, req.group!.id)) });
  } catch (err) {
    next(err);
  }
});

export default router;
