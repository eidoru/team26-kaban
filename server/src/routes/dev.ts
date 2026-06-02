import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, requireGroupManager } from "../middleware/groupAccess.js";
import { forceAdvanceGroupRound } from "../services/schedule.js";
import { GroupError } from "../services/groups.js";

const router = Router();

router.use(requireAuth);

/** Dev/UAT only: close the current round without waiting for the calendar. */
router.post("/groups/:id/advance-round", loadGroup, requireGroupManager, async (req, res, next) => {
  try {
    const result = await forceAdvanceGroupRound(req.group!.id, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export default router;
