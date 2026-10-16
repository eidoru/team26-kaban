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
import { cancelDispute, raiseDispute, reviewDispute } from "../services/disputes.js";
import { cancelSwap, requestSwap, respondToSwap, reviewSwap } from "../services/swaps.js";
import { buildExport } from "../services/exports.js";
import { completionSummary } from "../services/records.js";
import { activityLog, type ActivityCategory } from "../services/activity.js";
import { sendManualReminder } from "../services/reminders.js";
import { groupStats, homeDashboard, slotHistory } from "../services/dashboard.js";
import { createProofUpload, PROOF_CONTENT_TYPES } from "../lib/storage.js";
import { can } from "../domain/lifecycle.js";
import { conflict, notFound as notFoundError } from "../lib/errors.js";

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
const disputeSchema = z.object({ submissionId: z.string(), proposedAmount: z.number().int(), reason: z.string() });
const denyDisputeSchema = z.object({ note: z.string() });
const swapSchema = z.object({ targetSlotId: z.string(), requesterSlotId: z.string().optional() });

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

/** §15.2: the member's home across every paluwagan (and the Money page). Must sit above "/:id". */
router.get("/home", async (req, res, next) => {
  try {
    res.json(await homeDashboard(req.user!.id));
  } catch (err) {
    next(err);
  }
});

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

// --- Disputes (§6.2): change an approved contribution while its period is open.
router.post("/:id/disputes", validateBody(disputeSchema), ...memberAction((req, id, user) => raiseDispute(id, user, req.body)));
router.post(
  "/:id/disputes/:disputeId/approve",
  ...organizerAction((req, id, user) => reviewDispute(id, user, String(req.params.disputeId), { approve: true })),
);
router.post(
  "/:id/disputes/:disputeId/deny",
  validateBody(denyDisputeSchema),
  ...organizerAction((req, id, user) =>
    reviewDispute(id, user, String(req.params.disputeId), { approve: false, note: req.body.note }),
  ),
);
router.post(
  "/:id/disputes/:disputeId/cancel",
  ...memberAction((req, id, user) => cancelDispute(id, user, String(req.params.disputeId))),
);

// --- Swaps (§9): ask, the other side answers, then the organizer approves (unless already a party).
router.post("/:id/swaps", validateBody(swapSchema), ...memberAction((req, id, user) => requestSwap(id, user, req.body)));
router.post(
  "/:id/swaps/:swapId/accept",
  ...memberAction((req, id, user) => respondToSwap(id, user, String(req.params.swapId), true)),
);
router.post(
  "/:id/swaps/:swapId/decline",
  ...memberAction((req, id, user) => respondToSwap(id, user, String(req.params.swapId), false)),
);
router.post(
  "/:id/swaps/:swapId/approve",
  ...organizerAction((req, id, user) => reviewSwap(id, user, String(req.params.swapId), { approve: true })),
);
router.post(
  "/:id/swaps/:swapId/deny",
  validateBody(denyDisputeSchema),
  ...organizerAction((req, id, user) =>
    reviewSwap(id, user, String(req.params.swapId), { approve: false, note: req.body.note }),
  ),
);
router.post("/:id/swaps/:swapId/cancel", ...memberAction((req, id, user) => cancelSwap(id, user, String(req.params.swapId))));

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

// --- Records (§10, §14): the summary as JSON, and downloadable statements, ledger and summary.
router.get("/:id/summary", loadGroup, async (req, res, next) => {
  try {
    res.json(await completionSummary(req.group!.id));
  } catch (err) {
    next(err);
  }
});

/** §15.1 / §15.3: health, projections, money overview, collection rate and reliability. */
router.get("/:id/stats", loadGroup, async (req, res, next) => {
  try {
    res.json(await groupStats(req.group!.id, req.user!.id));
  } catch (err) {
    next(err);
  }
});

/** §15.3: one slot's history (own, or any for the organizer with ?slot=). */
router.get("/:id/history", loadGroup, async (req, res, next) => {
  try {
    res.json(await slotHistory(req.group!.id, req.user!.id, typeof req.query.slot === "string" ? req.query.slot : undefined));
  } catch (err) {
    next(err);
  }
});

/** R-AUD-03: the audit log, for every member. `?before=<entry id>` for older; `?category=` to filter. */
router.get("/:id/activity", loadGroup, async (req, res, next) => {
  try {
    const categories = ["payments", "debts", "payouts", "disputes", "swaps", "members", "settings"];
    const category = typeof req.query.category === "string" && categories.includes(req.query.category) ? req.query.category : undefined;
    res.json(
      await activityLog(req.group!.id, {
        before: typeof req.query.before === "string" ? req.query.before : undefined,
        category: category as ActivityCategory | undefined,
      }),
    );
  } catch (err) {
    next(err);
  }
});

/** §15.1: the organizer reminds a member who hasn't fully paid this round. */
router.post(
  "/:id/slots/:slotId/remind",
  ...organizerAction((req, id, user) => sendManualReminder(id, user, String(req.params.slotId))),
);

router.get("/:id/exports/:kind.:format", loadGroup, async (req, res, next) => {
  try {
    const kind = String(req.params.kind);
    const format = String(req.params.format);
    if (!["statement", "ledger", "summary"].includes(kind) || !["pdf", "csv"].includes(format)) {
      throw notFoundError("Export");
    }
    const file = await buildExport({
      groupId: req.group!.id,
      viewerUserId: req.user!.id,
      kind: kind as "statement" | "ledger" | "summary",
      format: format as "pdf" | "csv",
      slotId: typeof req.query.slot === "string" ? req.query.slot : undefined,
    });
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.body);
  } catch (err) {
    next(err);
  }
});

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
