import { Router } from "express";
import { requireCronSecret, requireCronTesting } from "../middleware/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { GroupError } from "../services/groups.js";
import { forceAdvanceGroupRound, processDueRounds } from "../services/schedule.js";
import { sendDueReminders } from "../services/reminders.js";

const router = Router();

router.use(requireCronSecret);

router.get("/close-rounds", async (_req, res, next) => {
  try {
    const result = await processDueRounds();
    await writeAuditLog({
      action: "cron.close_rounds",
      entityType: "cron",
      entityId: "close-rounds",
      metadata: { closed: result.closed },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get("/open-rounds", async (_req, res) => {
  // Rounds open automatically when the prior round closes or on activation.
  res.json({ ok: true, opened: 0, message: "Rounds open on close or activation" });
});

router.get("/send-reminders", async (_req, res, next) => {
  try {
    const result = await sendDueReminders();
    await writeAuditLog({
      action: "cron.send_reminders",
      entityType: "cron",
      entityId: "send-reminders",
      metadata: { sent: result.sent },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** UAT: force-close the current round for one group (not available on Vercel production). */
router.post(
  "/groups/:id/advance-round",
  requireCronTesting,
  async (req, res, next) => {
    try {
      const groupId = String(req.params.id);
      const result = await forceAdvanceGroupRound(groupId);
      await writeAuditLog({
        groupId,
        action: "cron.advance_round",
        entityType: "group",
        entityId: groupId,
        metadata: result,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

export default router;
