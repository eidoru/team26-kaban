import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, requireGroupManager } from "../middleware/groupAccess.js";
import { GroupError } from "../services/groups.js";
import { loadGroupDetailPayload } from "../services/groupDetail.js";
import { forceAdvanceGroupRound } from "../services/schedule.js";

const router = Router();

router.use(requireAuth);

/** Dev/UAT only: close the current round without waiting for the calendar. */
router.post("/groups/:id/advance-round", loadGroup, requireGroupManager, async (req, res, next) => {
  try {
    const membership = req.membership!;
    const { group: updatedGroup, ...result } = await forceAdvanceGroupRound(
      req.group!.id,
      req.user!.id,
    );
    const group = await loadGroupDetailPayload(updatedGroup, membership, req.user!.id);

    res.json({ ok: true, ...result, group });
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export default router;
