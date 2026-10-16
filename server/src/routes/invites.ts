import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { notifyGroupChangeSafe } from "../lib/realtimeNotify.js";
import { claimPlaceholder, getClaim, getInvite, joinViaInvite } from "../services/roster.js";

/**
 * Link landing pages. Viewing is public (R-INV-01); joining and claiming need an account, and the
 * client carries the token through login or registration (R-INV-02, R-CLM-04).
 */
const router = Router();

router.get("/invites/:token", optionalAuth, async (req, res, next) => {
  try {
    res.json(await getInvite(String(req.params.token), req.user?.id));
  } catch (err) {
    next(err);
  }
});

router.post("/invites/:token/join", requireAuth, async (req, res, next) => {
  try {
    const result = await joinViaInvite(String(req.params.token), req.user!.id);
    if (!result.alreadyMember) notifyGroupChangeSafe(result.groupId, "memberships");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/claims/:token", optionalAuth, async (req, res, next) => {
  try {
    res.json(await getClaim(String(req.params.token), req.user?.id));
  } catch (err) {
    next(err);
  }
});

router.post("/claims/:token/claim", requireAuth, async (req, res, next) => {
  try {
    const result = await claimPlaceholder(String(req.params.token), req.user!.id);
    notifyGroupChangeSafe(result.groupId, "memberships");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
