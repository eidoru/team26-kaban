import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, requireOrganizer } from "../middleware/groupAccess.js";
import { validateBody } from "../middleware/validate.js";
import { resolveAppOrigin } from "../lib/origin.js";
import { notifyGroupChangeSafe } from "../lib/realtimeNotify.js";
import { cancelGroup, createGroup, editGroup, groupDetail, listMyGroups } from "../services/groups.js";
import { addPlaceholder, createClaimLink, createInviteLink, removeSlot, revokeClaimLink } from "../services/roster.js";
import { launchGroup, lockOrder, setOrder, shuffleOrder } from "../services/launch.js";

const router = Router();
router.use(requireAuth);

/** §4.1 input. The rules live in domain/setup.ts; this only checks shapes. Amounts in centavos. */
const setupSchema = z.object({
  name: z.string(),
  slotCount: z.number().int(),
  amountMode: z.enum(["CONTRIBUTION", "POT"]),
  amount: z.number().int(),
  frequency: z.enum(["WEEKLY", "BI_WEEKLY", "TWICE_MONTHLY", "MONTHLY", "CUSTOM"]),
  intervalDays: z.number().int().nullish(),
  startDate: z.string(),
  interestPercent: z.number().nullish(),
});
const placeholderSchema = z.object({ name: z.string(), contact: z.string().optional() });
const orderSchema = z.object({ slotIds: z.array(z.string()).min(1) });

const detail = (req: Request, groupId: string) => groupDetail(groupId, req.user!.id, resolveAppOrigin(req));

/**
 * An organizer action on `:id`: run it, broadcast the change, and answer with the fresh detail so
 * the client doesn't need to refetch.
 */
function organizerAction(action: (req: Request, groupId: string, userId: string) => Promise<unknown>) {
  return [
    loadGroup,
    requireOrganizer,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const groupId = req.group!.id;
        await action(req, groupId, req.user!.id);
        notifyGroupChangeSafe(groupId, "memberships");
        res.json(await detail(req, groupId));
      } catch (err) {
        next(err);
      }
    },
  ] as const;
}

router.get("/", async (req, res, next) => {
  try {
    res.json({ groups: await listMyGroups(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

router.post("/", validateBody(setupSchema), async (req, res, next) => {
  try {
    const group = await createGroup(req.user!.id, req.body);
    res.status(201).json(await detail(req, group.id));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", loadGroup, async (req, res, next) => {
  try {
    res.json(await detail(req, req.group!.id));
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", validateBody(setupSchema), ...organizerAction((req, id, user) => editGroup(id, user, req.body)));
router.post("/:id/cancel", ...organizerAction((_req, id, user) => cancelGroup(id, user)));
router.post("/:id/invite-link", ...organizerAction((_req, id, user) => createInviteLink(id, user)));
router.post(
  "/:id/placeholders",
  validateBody(placeholderSchema),
  ...organizerAction((req, id, user) => addPlaceholder(id, user, req.body)),
);
/** Delete a placeholder or kick a member (organizer). Members leave with POST /leave. */
router.delete("/:id/slots/:slotId", ...organizerAction((req, id, user) => removeSlot(id, user, String(req.params.slotId))));
router.post(
  "/:id/slots/:slotId/claim-link",
  ...organizerAction((req, id, user) => createClaimLink(id, user, String(req.params.slotId))),
);
router.delete(
  "/:id/slots/:slotId/claim-link",
  ...organizerAction((req, id, user) => revokeClaimLink(id, user, String(req.params.slotId))),
);
router.put("/:id/order", validateBody(orderSchema), ...organizerAction((req, id, user) => setOrder(id, user, req.body.slotIds)));
router.post("/:id/order/shuffle", ...organizerAction((_req, id, user) => shuffleOrder(id, user)));
router.post("/:id/order/lock", ...organizerAction((_req, id, user) => lockOrder(id, user)));
router.post("/:id/launch", ...organizerAction((_req, id, user) => launchGroup(id, user)));

router.post("/:id/leave", loadGroup, async (req, res, next) => {
  try {
    await removeSlot(req.group!.id, req.user!.id, req.slot!.id);
    notifyGroupChangeSafe(req.group!.id, "memberships");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
