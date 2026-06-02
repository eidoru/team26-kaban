import { Router } from "express";
import { z } from "zod";
import { InviteTokenType, ObligationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { resolveAppOrigin } from "../lib/origin.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  loadGroup,
  requireGroupManager,
  requireGroupMember,
} from "../middleware/groupAccess.js";
import {
  assertForming,
  countFilledSlots,
  countFilledSlotsByGroupIds,
  deleteFormingGroup,
  getGroupOrThrow,
  GroupError,
  inviteExpiry,
  inviteUrl,
  listUserGroups,
  resetPayoutOrderIfRosterIncomplete,
  serializeGroup,
  serializeMember,
} from "../services/groups.js";
import {
  activateGroup,
  serializeRound,
  setPayoutOrder,
} from "../services/schedule.js";
import {
  confirmContribution,
  ContributionError,
  getGroupLedger,
  recordContribution,
  reportContribution,
  serializeContribution,
  serializeContributionForViewer,
} from "../services/contributions.js";
import { getGroupAuditLog } from "../services/auditLog.js";
import {
  settleMemberDebts,
  coverObligationExternally,
  getGroupObligations,
  ObligationError,
} from "../services/obligations.js";
import {
  DisputeError,
  canRaiseContributionDispute,
  getGroupDisputes,
  raiseDispute,
  resolveDispute,
} from "../services/disputes.js";
import {
  DashboardError,
  getGroupDashboard,
  getManagerObligationsOverview,
} from "../services/dashboard.js";
import { getCompletionSummary, getMemberReliabilitySummaries, SummaryError } from "../services/summary.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const groups = await listUserGroups(req.user!.id);
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

router.get("/manager/obligations", async (req, res, next) => {
  try {
    const overview = await getManagerObligationsOverview(req.user!.id);
    res.json(overview);
  } catch (err) {
    next(err);
  }
});

const createGroupSchema = z
  .object({
    name: z.string().min(1).max(100),
    contributionAmount: z.number().positive(),
    frequency: z.enum(["weekly", "biweekly", "monthly", "custom"]),
    frequencyDays: z.number().int().min(1).max(365).optional(),
    slotCount: z.number().int().min(2).max(30),
    startDate: z.string().date(),
    shortfallInterestRatePercent: z.number().min(0).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === "custom") {
      if (data.frequencyDays == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom frequency requires an interval in days",
          path: ["frequencyDays"],
        });
      }
    } else if (data.frequencyDays != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "frequencyDays is only valid with custom frequency",
        path: ["frequencyDays"],
      });
    }
  });

router.post("/", validateBody(createGroupSchema), async (req, res, next) => {
  try {
    const {
      name,
      contributionAmount,
      frequency,
      frequencyDays,
      slotCount,
      startDate,
      shortfallInterestRatePercent,
    } = req.body;
    const userId = req.user!.id;

    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name,
          contributionAmount,
          frequency,
          frequencyDays: frequency === "custom" ? frequencyDays : null,
          slotCount,
          startDate: new Date(startDate),
          shortfallInterestRatePercent: shortfallInterestRatePercent ?? 0,
          managerId: userId,
          memberships: {
            create: {
              userId,
              displayName: req.user!.displayName,
              isManager: true,
            },
          },
        },
      });

      const managerMembership = await tx.membership.findFirstOrThrow({
        where: { groupId: created.id, userId },
      });

      await tx.auditLog.create({
        data: {
          groupId: created.id,
          actorId: userId,
          action: "group.created",
          entityType: "group",
          entityId: created.id,
          metadata: {
            name,
            slotCount,
            frequency,
            ...(frequency === "custom" ? { frequencyDays } : {}),
            shortfallInterestRatePercent: shortfallInterestRatePercent ?? 0,
          },
        },
      });

      return { created, managerMembership };
    });

    const filledCount = 1;
    res.status(201).json({
      group: serializeGroup(group.created, filledCount, "manager"),
      membershipId: group.managerMembership.id,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", loadGroup, requireGroupManager, async (req, res, next) => {
  try {
    await deleteFormingGroup(req.group!.id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get("/:id", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const group = req.group!;

    const [members, rounds, openDisputeCount, unsettledObligationCount] = await Promise.all([
      prisma.membership.findMany({
        where: { groupId: group.id },
        orderBy: [{ turnNumber: "asc" }, { createdAt: "asc" }],
      }),
      group.status === "forming"
        ? Promise.resolve([])
        : prisma.round.findMany({
            where: { groupId: group.id },
            orderBy: { number: "asc" },
          }),
      group.status === "forming"
        ? Promise.resolve(0)
        : prisma.dispute.count({
            where: {
              status: "open",
              contribution: { round: { groupId: group.id } },
            },
          }),
      group.status === "forming"
        ? Promise.resolve(0)
        : prisma.obligation.count({
            where: {
              sourceRound: { groupId: group.id },
              status: { in: [ObligationStatus.unsettled, ObligationStatus.partially_settled] },
            },
          }),
    ]);

    const filledCount = members.length;
    const needsPayoutOrder = members.some((m) => m.turnNumber === null);
    const unclaimedSeats = members.filter((m) => m.userId === null).length;
    const openSlots = Math.max(0, group.slotCount - filledCount);
    const memberById = new Map(members.map((m) => [m.id, m]));

    let currentRound = null;
    let schedule: ReturnType<typeof serializeRound>[] = [];

    if (rounds.length > 0) {
      schedule = rounds.map((r) => ({
        ...serializeRound(r),
        recipientName: memberById.get(r.recipientMembershipId)?.displayName ?? "Unknown",
      }));

      const current = rounds.find((r) => r.status === "current");
      if (current) {
        const [contributions, openDisputes] = await Promise.all([
          prisma.contribution.findMany({ where: { roundId: current.id } }),
          prisma.dispute.findMany({
            where: {
              status: "open",
              contribution: { roundId: current.id },
            },
            select: { contributionId: true },
          }),
        ]);
        const openDisputeIds = new Set(openDisputes.map((d) => d.contributionId));
        const isManager = req.membership!.isManager;
        const viewerUserId = req.user!.id;
        const canRaiseDispute = group.status !== "forming";
        currentRound = {
          ...serializeRound(current),
          recipientName: memberById.get(current.recipientMembershipId)?.displayName ?? "Unknown",
          contributions: contributions.map((c) => {
            const member = memberById.get(c.membershipId)!;
            const base = serializeContributionForViewer(
              c,
              member,
              viewerUserId,
              isManager,
              group.contributionAmount,
            );
            const canDispute = canRaiseContributionDispute({
              groupStarted: canRaiseDispute,
              isManager,
              viewerMembershipId: req.membership!.id,
              contributionMembershipId: c.membershipId,
              contributionStatus: c.status,
              hasOpenDispute: openDisputeIds.has(c.id),
            });
            return { ...base, canDispute };
          }),
        };
      }
    }

    res.json({
      group: serializeGroup(
        group,
        filledCount,
        req.membership!.isManager ? "manager" : "member",
      ),
      members: members.map(serializeMember),
      pending: {
        payoutOrder: needsPayoutOrder,
        startDateMissing: !group.startDate,
        openSlots,
        unclaimedSeats,
        cycleStarted: group.status !== "forming",
        canActivate:
          group.status === "forming" &&
          openSlots === 0 &&
          !needsPayoutOrder &&
          !!group.startDate,
      },
      currentRound,
      schedule,
      issueCounts: {
        openDisputes: openDisputeCount,
        unsettledObligations: unsettledObligationCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/member-reliability", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const reliability = await getMemberReliabilitySummaries(req.group!.id);
    res.json({ reliability });
  } catch (err) {
    next(err);
  }
});

const addMemberSchema = z.object({
  displayName: z.string().min(1).max(100),
  contact: z.string().max(200).optional(),
});

router.post(
  "/:id/members",
  loadGroup,
  requireGroupManager,
  validateBody(addMemberSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      assertForming(group);

      const membership = await prisma.$transaction(async (tx) => {
        const filledCount = await tx.membership.count({ where: { groupId: group.id } });
        if (filledCount >= group.slotCount) {
          throw new GroupError(409, "Group is full");
        }

        return tx.membership.create({
          data: {
            groupId: group.id,
            displayName: req.body.displayName,
            contact: req.body.contact ?? null,
          },
        });
      });

      void writeAuditLog({
        groupId: group.id,
        actorId: req.user!.id,
        action: "membership.placeholder_added",
        entityType: "membership",
        entityId: membership.id,
        metadata: { displayName: membership.displayName },
      }).catch((err) => console.error("Failed to write audit log", err));

      res.status(201).json({ member: serializeMember(membership) });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

const updateMemberSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  contact: z.string().max(200).nullable().optional(),
});

router.patch(
  "/:id/members/:mid",
  loadGroup,
  requireGroupManager,
  validateBody(updateMemberSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      assertForming(group);

      const existing = await prisma.membership.findFirst({
        where: { id: String(req.params.mid), groupId: group.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Member not found" });
        return;
      }

      const membership = await prisma.membership.update({
        where: { id: existing.id },
        data: req.body,
      });

      await writeAuditLog({
        groupId: group.id,
        actorId: req.user!.id,
        action: "membership.updated",
        entityType: "membership",
        entityId: membership.id,
      });

      res.json({ member: serializeMember(membership) });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.delete(
  "/:id/members/:mid",
  loadGroup,
  requireGroupManager,
  async (req, res, next) => {
    try {
      const group = req.group!;
      assertForming(group);

      const existing = await prisma.membership.findFirst({
        where: { id: String(req.params.mid), groupId: group.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Member not found" });
        return;
      }
      if (existing.isManager) {
        res.status(409).json({ error: "Cannot remove the manager from the roster" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.membership.delete({ where: { id: existing.id } });
        const reset = await resetPayoutOrderIfRosterIncomplete(tx, group.id);
        if (reset) {
          await tx.auditLog.create({
            data: {
              groupId: group.id,
              actorId: req.user!.id,
              action: "group.payout_order_reset",
              entityType: "group",
              entityId: group.id,
              metadata: { reason: "roster_no_longer_full" },
            },
          });
        }
      });

      await writeAuditLog({
        groupId: group.id,
        actorId: req.user!.id,
        action: "membership.removed",
        entityType: "membership",
        entityId: existing.id,
        metadata: { displayName: existing.displayName },
      });

      res.status(204).send();
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

const createInviteSchema = z.object({
  type: z.enum(["group_invite", "membership_claim"]),
  membershipId: z.string().uuid().optional(),
});

router.post(
  "/:id/invites",
  loadGroup,
  requireGroupManager,
  validateBody(createInviteSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      const { type, membershipId } = req.body;

      if (type === InviteTokenType.group_invite) {
        assertForming(group);
        const filledCount = await countFilledSlots(group.id);
        if (filledCount >= group.slotCount) {
          res.status(409).json({ error: "Group is full; no invite link can be generated" });
          return;
        }
      }

      if (type === InviteTokenType.membership_claim) {
        if (!membershipId) {
          res.status(400).json({ error: "membershipId is required for claim links" });
          return;
        }
        const placeholder = await prisma.membership.findFirst({
          where: { id: membershipId, groupId: group.id, userId: null },
        });
        if (!placeholder) {
          res.status(404).json({ error: "Placeholder membership not found or already claimed" });
          return;
        }
      }

      const invite = await prisma.inviteToken.create({
        data: {
          type,
          groupId: group.id,
          targetMembershipId: type === InviteTokenType.membership_claim ? membershipId : null,
          expiresAt: inviteExpiry(),
        },
      });

      await writeAuditLog({
        groupId: group.id,
        actorId: req.user!.id,
        action: "invite.created",
        entityType: "invite_token",
        entityId: invite.id,
        metadata: { type },
      });

      res.status(201).json({
        invite: {
          id: invite.id,
          type: invite.type,
          token: invite.token,
          expiresAt: invite.expiresAt,
          url: inviteUrl(invite.type, invite.token, resolveAppOrigin(req)),
        },
      });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

const payoutOrderSchema = z.object({
  method: z.enum(["random", "manual"]),
  order: z
    .array(
      z.object({
        membershipId: z.string().uuid(),
        turnNumber: z.number().int().min(1),
      }),
    )
    .optional(),
});

router.post(
  "/:id/payout-order",
  loadGroup,
  requireGroupManager,
  validateBody(payoutOrderSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      assertForming(group);
      const members = await setPayoutOrder(
        group.id,
        req.user!.id,
        req.body.method,
        req.body.order,
      );
      res.json({ members: members.map(serializeMember) });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: "Payout order conflict — please try again" });
        return;
      }
      next(err);
    }
  },
);

const startDateSchema = z.object({
  startDate: z.string().date(),
});

router.patch(
  "/:id/start-date",
  loadGroup,
  requireGroupManager,
  validateBody(startDateSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      assertForming(group);

      const updated = await prisma.group.update({
        where: { id: group.id },
        data: { startDate: new Date(req.body.startDate) },
      });

      await writeAuditLog({
        groupId: group.id,
        actorId: req.user!.id,
        action: "group.start_date_set",
        entityType: "group",
        entityId: group.id,
        metadata: { startDate: req.body.startDate },
      });

      const filledCount = await countFilledSlots(group.id);
      res.json({
        group: serializeGroup(updated, filledCount, "manager"),
      });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

const activateSchema = z.object({
  startDate: z.string().date().optional(),
});

router.post(
  "/:id/activate",
  loadGroup,
  requireGroupManager,
  validateBody(activateSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      await activateGroup(group.id, req.user!.id, req.body.startDate);

      const updated = await getGroupOrThrow(group.id);
      const members = await prisma.membership.findMany({
        where: { groupId: group.id },
        orderBy: { turnNumber: "asc" },
      });
      const rounds = await prisma.round.findMany({
        where: { groupId: group.id },
        orderBy: { number: "asc" },
      });
      const current = rounds.find((r) => r.status === "current");
      let currentRound = null;
      if (current) {
        const contributions = await prisma.contribution.findMany({
          where: { roundId: current.id },
        });
        const recipient = members.find((m) => m.id === current.recipientMembershipId);
        currentRound = {
          ...serializeRound(current),
          recipientName: recipient?.displayName ?? "Unknown",
          contributions: contributions.map(serializeContribution),
        };
      }

      res.json({
        group: serializeGroup(updated, members.length, "manager"),
        members: members.map(serializeMember),
        currentRound,
        schedule: rounds.map(serializeRound),
      });
    } catch (err) {
      if (err instanceof GroupError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.get("/:id/rounds/current", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const group = req.group!;
    if (group.status === "forming") {
      res.status(404).json({ error: "Group has not started yet" });
      return;
    }

    const current = await prisma.round.findFirst({
      where: { groupId: group.id, status: "current" },
    });
    if (!current) {
      res.json({ currentRound: null });
      return;
    }

    const [members, contributions] = await Promise.all([
      prisma.membership.findMany({ where: { groupId: group.id } }),
      prisma.contribution.findMany({ where: { roundId: current.id } }),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const isManager = req.membership!.isManager;

    res.json({
      currentRound: {
        ...serializeRound(current),
        recipientName: memberById.get(current.recipientMembershipId)?.displayName ?? "Unknown",
        contributions: contributions.map((c) =>
          serializeContributionForViewer(
            c,
            memberById.get(c.membershipId)!,
            req.user!.id,
            isManager,
            group.contributionAmount,
          ),
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/rounds", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const group = req.group!;
    if (group.status === "forming") {
      res.status(404).json({ error: "Group has not started yet" });
      return;
    }

    const [rounds, members] = await Promise.all([
      prisma.round.findMany({
        where: { groupId: group.id },
        orderBy: { number: "asc" },
      }),
      prisma.membership.findMany({ where: { groupId: group.id } }),
    ]);

    res.json({
      schedule: rounds.map((r) => ({
        ...serializeRound(r),
        recipientName:
          members.find((m) => m.id === r.recipientMembershipId)?.displayName ?? "Unknown",
      })),
    });
  } catch (err) {
    next(err);
  }
});

const reportContributionSchema = z.object({
  note: z.string().max(500).optional(),
  proofUrl: z.string().url().max(500).optional(),
  amount: z.number().positive().optional(),
});

router.post(
  "/:id/contributions/:cid/report",
  loadGroup,
  requireGroupMember,
  validateBody(reportContributionSchema),
  async (req, res, next) => {
    try {
      const contribution = await reportContribution(
        req.group!.id,
        String(req.params.cid),
        req.user!.id,
        req.body,
      );
      res.json({ contribution: serializeContribution(contribution) });
    } catch (err) {
      if (err instanceof GroupError || err instanceof ContributionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.post(
  "/:id/contributions/:cid/confirm",
  loadGroup,
  requireGroupManager,
  async (req, res, next) => {
    try {
      const contribution = await confirmContribution(
        req.group!.id,
        String(req.params.cid),
        req.user!.id,
      );
      res.json({ contribution: serializeContribution(contribution) });
    } catch (err) {
      if (err instanceof GroupError || err instanceof ContributionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

const recordContributionSchema = z.object({
  note: z.string().max(500).optional(),
  amount: z.number().positive().optional(),
});

router.post(
  "/:id/contributions/:cid/record",
  loadGroup,
  requireGroupManager,
  validateBody(recordContributionSchema),
  async (req, res, next) => {
    try {
      const contribution = await recordContribution(
        req.group!.id,
        String(req.params.cid),
        req.user!.id,
        req.body,
      );
      res.json({ contribution: serializeContribution(contribution) });
    } catch (err) {
      if (err instanceof GroupError || err instanceof ContributionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.get("/:id/ledger", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const group = req.group!;
    if (group.status === "forming") {
      res.status(404).json({ error: "Group has not started yet" });
      return;
    }
    const entries = await getGroupLedger(group.id);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/audit-log", loadGroup, requireGroupManager, async (req, res, next) => {
  try {
    const entries = await getGroupAuditLog(req.group!.id);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/obligations", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const obligations = await getGroupObligations(req.group!.id);
    res.json({ obligations });
  } catch (err) {
    if (err instanceof ObligationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

const settleDebtsSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
});

router.post(
  "/:id/members/:mid/settle",
  loadGroup,
  requireGroupManager,
  validateBody(settleDebtsSchema),
  async (req, res, next) => {
    try {
      const group = req.group!;
      const memberId = String(req.params.mid);
      const member = await prisma.membership.findFirst({
        where: { id: memberId, groupId: group.id },
      });
      if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
      }

      const result = await settleMemberDebts(
        group.id,
        memberId,
        req.user!.id,
        req.body.amount,
        req.body.note,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ObligationError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);


const coverExternallySchema = z.object({
  note: z.string().min(1).max(500),
});

router.post(
  "/:id/obligations/:oid/cover-externally",
  loadGroup,
  requireGroupManager,
  validateBody(coverExternallySchema),
  async (req, res, next) => {
    try {
      const result = await coverObligationExternally(
        req.group!.id,
        String(req.params.oid),
        req.user!.id,
        req.body.note,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ObligationError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);


router.get("/:id/dashboard", loadGroup, requireGroupManager, async (req, res, next) => {
  try {
    const dashboard = await getGroupDashboard(req.group!.id);
    res.json({ dashboard });
  } catch (err) {
    if (err instanceof DashboardError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get("/:id/completion-summary", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const summary = await getCompletionSummary(req.group!.id);
    res.json({ summary });
  } catch (err) {
    if (err instanceof SummaryError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get("/:id/disputes", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const disputes = await getGroupDisputes(req.group!.id);
    res.json({ disputes });
  } catch (err) {
    next(err);
  }
});

const raiseDisputeSchema = z.object({
  note: z.string().min(1).max(1000),
  proofUrl: z.string().url().max(500).optional(),
});

router.post(
  "/:id/contributions/:cid/disputes",
  loadGroup,
  requireGroupMember,
  validateBody(raiseDisputeSchema),
  async (req, res, next) => {
    try {
      const dispute = await raiseDispute(
        req.group!.id,
        String(req.params.cid),
        req.membership!.id,
        req.user!.id,
        req.body,
      );
      res.status(201).json({ dispute: { id: dispute.id, status: dispute.status } });
    } catch (err) {
      if (err instanceof DisputeError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

const resolveDisputeSchema = z.object({
  resolution: z.string().min(1).max(2000),
});

router.patch(
  "/:id/disputes/:did/resolve",
  loadGroup,
  requireGroupManager,
  validateBody(resolveDisputeSchema),
  async (req, res, next) => {
    try {
      const dispute = await resolveDispute(
        req.group!.id,
        String(req.params.did),
        req.user!.id,
        req.body.resolution,
      );
      res.json({ dispute: { id: dispute.id, status: dispute.status } });
    } catch (err) {
      if (err instanceof DisputeError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.post("/:id/leave", loadGroup, requireGroupMember, async (req, res, next) => {
  try {
    const group = req.group!;
    const membership = req.membership!;
    assertForming(group);

    if (membership.isManager) {
      res.status(409).json({
        error: "Managers cannot leave during forming. Remove members or delete the group instead.",
      });
      return;
    }

    let payoutOrderReset = false;
    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: membership.id } });
      payoutOrderReset = await resetPayoutOrderIfRosterIncomplete(tx, group.id);
      if (payoutOrderReset) {
        await tx.auditLog.create({
          data: {
            groupId: group.id,
            actorId: req.user!.id,
            action: "group.payout_order_reset",
            entityType: "group",
            entityId: group.id,
            metadata: { reason: "roster_no_longer_full" },
          },
        });
      }
    });

    await writeAuditLog({
      groupId: group.id,
      actorId: req.user!.id,
      action: "membership.left",
      entityType: "membership",
      entityId: membership.id,
      metadata: { displayName: membership.displayName },
    });

    const managerMembership = await prisma.membership.findFirst({
      where: { groupId: group.id, isManager: true },
    });
    if (managerMembership?.userId) {
      await createNotification({
        userId: managerMembership.userId,
        groupId: group.id,
        type: "member_left",
        title: `${group.name}: member left`,
        body: `${membership.displayName} left the group during forming.`,
        link: `/groups/${group.id}`,
      });
    }

    res.status(204).send();
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export default router;
