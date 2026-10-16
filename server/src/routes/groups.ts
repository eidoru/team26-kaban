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
import { cancelSubmission, reviewSubmission, submitPayment } from "../services/submissions.js";
import { confirmReceipt, markHandedOver } from "../services/payouts.js";
import { createProofUpload, PROOF_CONTENT_TYPES } from "../lib/storage.js";
import { can } from "../domain/lifecycle.js";
import { conflict } from "../lib/errors.js";

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
const proofSchema = z.object({ contentType: z.enum(PROOF_CONTENT_TYPES as [string, ...string[]]) });
const submissionSchema = z.object({
  slotId: z.string(),
  type: z.enum(["CONTRIBUTION", "DEBT_PAYMENT"]).default("CONTRIBUTION"),
  amount: z.number().int(),
  proofPath: z.string().optional(),
  note: z.string().optional(),
});
const denySchema = z.object({ reason: z.string() });
const handoverSchema = z.object({ proofPath: z.string().optional() });

const detail = (req: Request, groupId: string) => groupDetail(groupId, req.user!.id, resolveAppOrigin(req));

/**
 * An action on `:id`: run it, broadcast the change, and answer with the fresh detail so the client
 * doesn't need to refetch. `organizerAction` also requires the organizer.
 */
type GroupAction = (req: Request, groupId: string, userId: string) => Promise<unknown>;

function memberAction(action: GroupAction) {
  return [loadGroup, answerWithDetail(action)] as const;
}

function organizerAction(action: GroupAction) {
  return [loadGroup, requireOrganizer, answerWithDetail(action)] as const;
}

function answerWithDetail(action: GroupAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = req.group!.id;
      await action(req, groupId, req.user!.id);
      notifyGroupChangeSafe(groupId, "memberships");
      res.json(await detail(req, groupId));
    } catch (err) {
      next(err);
    }
  };
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

// --- Payments (§6.1). The browser uploads a proof photo first, then submits with its path.
router.post("/:id/proofs", loadGroup, validateBody(proofSchema), async (req, res, next) => {
  try {
    const state = req.group!.state;
    if (!can.submitContribution(state) && !can.submitDebtPayment(state)) {
      throw conflict("Payments open once the paluwagan starts.", "WRONG_STATE");
    }
    res.json(await createProofUpload(req.group!.id, req.body.contentType));
  } catch (err) {
    next(err);
  }
});
router.post(
  "/:id/submissions",
  validateBody(submissionSchema),
  ...memberAction((req, id, user) => submitPayment(id, user, req.body)),
);
router.post(
  "/:id/submissions/:submissionId/approve",
  ...organizerAction((req, id, user) => reviewSubmission(id, user, String(req.params.submissionId), { approve: true })),
);
router.post(
  "/:id/submissions/:submissionId/deny",
  validateBody(denySchema),
  ...organizerAction((req, id, user) =>
    reviewSubmission(id, user, String(req.params.submissionId), { approve: false, reason: req.body.reason }),
  ),
);
router.post(
  "/:id/submissions/:submissionId/cancel",
  ...memberAction((req, id, user) => cancelSubmission(id, user, String(req.params.submissionId))),
);

// --- Payouts (§7, R-PAY-05). Rounds are addressed by number.
router.post(
  "/:id/rounds/:number/handover",
  validateBody(handoverSchema),
  ...organizerAction((req, id, user) => markHandedOver(id, user, Number(req.params.number), req.body.proofPath)),
);
router.post(
  "/:id/rounds/:number/confirm-receipt",
  ...memberAction((req, id, user) => confirmReceipt(id, user, Number(req.params.number))),
);

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
