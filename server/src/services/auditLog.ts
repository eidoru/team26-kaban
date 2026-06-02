import { AuditLog, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type AuditMetadata = Record<string, unknown>;

interface AuditContext {
  membersById: Map<string, { displayName: string }>;
  roundsById: Map<string, { number: number }>;
  contributionsById: Map<
    string,
    { amount: Prisma.Decimal; membershipId: string; roundId: string }
  >;
}

function metaString(metadata: AuditMetadata | null, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = metadata[key];
  return typeof value === "string" ? value : undefined;
}

function metaNumber(metadata: AuditMetadata | null, key: string): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function metaBool(metadata: AuditMetadata | null, key: string): boolean | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = metadata[key];
  return typeof value === "boolean" ? value : undefined;
}

function memberName(ctx: AuditContext, membershipId?: string) {
  if (!membershipId) return undefined;
  return ctx.membersById.get(membershipId)?.displayName;
}

function roundLabel(ctx: AuditContext, roundId?: string, roundNumber?: number) {
  if (roundNumber != null) return `Round ${roundNumber}`;
  if (!roundId) return undefined;
  const round = ctx.roundsById.get(roundId);
  return round ? `Round ${round.number}` : undefined;
}

function formatAction(
  log: Pick<AuditLog, "action" | "entityType" | "entityId" | "metadata">,
  ctx: AuditContext,
): { title: string; summary: string; details: string[]; category: string } {
  const metadata = (log.metadata as AuditMetadata | null) ?? {};
  const details: string[] = [];

  switch (log.action) {
    case "group.created": {
      const name = metaString(metadata, "name");
      const slots = metaNumber(metadata, "slotCount");
      const frequency = metaString(metadata, "frequency");
      if (name) details.push(`Group name: ${name}`);
      if (slots != null) details.push(`Slots: ${slots}`);
      if (frequency) details.push(`Frequency: ${frequency}`);
      return {
        category: "group",
        title: "Group created",
        summary: name ? `"${name}" was created` : "The paluwagan group was created",
        details,
      };
    }
    case "group.payout_order_set": {
      const method = metaString(metadata, "method");
      if (method) details.push(`Method: ${method === "random" ? "Random draw" : "Manual order"}`);
      return {
        category: "group",
        title: "Payout order set",
        summary: "Turn order for the rotation was assigned",
        details,
      };
    }
    case "group.payout_order_reset": {
      details.push("Roster is no longer full");
      return {
        category: "group",
        title: "Payout order reset",
        summary: "Turn order was cleared because the roster opened up again",
        details,
      };
    }
    case "group.start_date_set": {
      const startDate = metaString(metadata, "startDate");
      if (startDate) details.push(`Start date: ${startDate.slice(0, 10)}`);
      return {
        category: "group",
        title: "Start date set",
        summary: startDate
          ? `Cycle start date set to ${startDate.slice(0, 10)}`
          : "Cycle start date was updated",
        details,
      };
    }
    case "group.activated": {
      const startDate = metaString(metadata, "startDate");
      const rounds = metaNumber(metadata, "rounds");
      if (startDate) details.push(`Start date: ${startDate.slice(0, 10)}`);
      if (rounds != null) details.push(`Schedule: ${rounds} rounds generated`);
      details.push("Round 1 opened for contributions");
      return {
        category: "group",
        title: "Paluwagan activated",
        summary: "The group started and Round 1 opened",
        details,
      };
    }
    case "group.completed":
      return {
        category: "group",
        title: "Paluwagan completed",
        summary: "All rounds finished — the cycle is complete",
        details,
      };
    case "group.deleted": {
      const name = metaString(metadata, "name");
      if (name) details.push(`Group name: ${name}`);
      return {
        category: "group",
        title: "Paluwagan cancelled",
        summary: name ? `"${name}" was deleted during forming` : "The paluwagan was deleted during forming",
        details,
      };
    }
    case "membership.placeholder_added": {
      const displayName = metaString(metadata, "displayName");
      if (displayName) details.push(`Member: ${displayName}`);
      return {
        category: "membership",
        title: "Placeholder added",
        summary: displayName ? `${displayName} was added to the roster` : "A placeholder member was added",
        details,
      };
    }
    case "membership.updated": {
      const displayName = memberName(ctx, log.entityId);
      if (displayName) details.push(`Member: ${displayName}`);
      return {
        category: "membership",
        title: "Member updated",
        summary: displayName ? `${displayName}'s roster entry was edited` : "A roster entry was updated",
        details,
      };
    }
    case "membership.removed": {
      const displayName = metaString(metadata, "displayName") ?? memberName(ctx, log.entityId);
      if (displayName) details.push(`Member: ${displayName}`);
      return {
        category: "membership",
        title: "Member removed",
        summary: displayName ? `${displayName} was removed from the roster` : "A member was removed",
        details,
      };
    }
    case "membership.left": {
      const displayName = metaString(metadata, "displayName");
      if (displayName) details.push(`Member: ${displayName}`);
      return {
        category: "membership",
        title: "Member left",
        summary: displayName
          ? `${displayName} left during forming`
          : "A member left during forming",
        details,
      };
    }
    case "membership.joined_via_invite": {
      const displayName =
        metaString(metadata, "displayName") ?? memberName(ctx, log.entityId);
      if (displayName) details.push(`Member: ${displayName}`);
      details.push("Joined via group invite link");
      return {
        category: "membership",
        title: "Member joined",
        summary: displayName ? `${displayName} joined via invite` : "Someone joined via invite link",
        details,
      };
    }
    case "membership.claimed": {
      const displayName =
        metaString(metadata, "displayName") ?? memberName(ctx, log.entityId);
      const placeholderName = metaString(metadata, "placeholderName");
      if (displayName) details.push(`Claimed by: ${displayName}`);
      if (placeholderName) details.push(`Seat was: ${placeholderName}`);
      return {
        category: "membership",
        title: "Seat claimed",
        summary:
          displayName && placeholderName
            ? `${displayName} claimed the "${placeholderName}" seat`
            : displayName
              ? `${displayName} claimed their seat`
              : "A placeholder seat was claimed",
        details,
      };
    }
    case "invite.created": {
      const type = metaString(metadata, "type");
      if (type === "group_invite") details.push("Type: Open group invite");
      else if (type === "membership_claim") details.push("Type: Seat claim link");
      return {
        category: "invite",
        title: "Invite link created",
        summary:
          type === "membership_claim"
            ? "A claim link was generated for a placeholder"
            : "A group invite link was generated",
        details,
      };
    }
    case "round.opened": {
      const number = metaNumber(metadata, "number");
      if (number != null) details.push(`Round ${number} is now current`);
      details.push("Contribution rows opened for all members");
      return {
        category: "round",
        title: "Round opened",
        summary: number != null ? `Round ${number} opened for contributions` : "A new round opened",
        details,
      };
    }
    case "round.closed": {
      const number = metaNumber(metadata, "number");
      const obligationsCreated = metaNumber(metadata, "obligationsCreated");
      if (number != null) details.push(`Round ${number} closed on schedule`);
      if (obligationsCreated != null && obligationsCreated > 0) {
        details.push(`${obligationsCreated} shortfall obligation(s) created`);
      }
      return {
        category: "round",
        title: "Round closed",
        summary:
          number != null
            ? obligationsCreated
              ? `Round ${number} closed — ${obligationsCreated} unpaid shortfall(s) recorded`
              : `Round ${number} closed`
            : "The current round closed",
        details,
      };
    }
    case "obligation.created": {
      const roundNumber = metaNumber(metadata, "roundNumber");
      const shortfall = metaString(metadata, "shortfall");
      const membershipId = metaString(metadata, "membershipId");
      const name = memberName(ctx, membershipId);
      const status = metaString(metadata, "contributionStatus");
      if (name) details.push(`Member: ${name}`);
      if (roundNumber != null) details.push(`From round ${roundNumber}`);
      if (shortfall) details.push(`Shortfall: ₱${Number(shortfall).toLocaleString()}`);
      if (status) details.push(`Contribution was: ${status}`);
      return {
        category: "obligation",
        title: "Shortfall recorded",
        summary:
          name && roundNumber
            ? `${name} owes ₱${Number(shortfall ?? 0).toLocaleString()} from round ${roundNumber}`
            : "An unpaid shortfall obligation was created",
        details,
      };
    }
    case "obligation.settled": {
      const totalApplied = metaString(metadata, "totalApplied");
      const debtorId = metaString(metadata, "debtorMembershipId");
      const name = memberName(ctx, debtorId);
      if (name) details.push(`Member: ${name}`);
      if (totalApplied) details.push(`Applied: ₱${Number(totalApplied).toLocaleString()}`);
      details.push("Settled oldest obligations first (FIFO)");
      return {
        category: "obligation",
        title: "Debt settlement",
        summary: name
          ? `₱${Number(totalApplied ?? 0).toLocaleString()} applied to ${name}'s outstanding debts`
          : "A FIFO debt settlement was recorded",
        details,
      };
    }
    case "obligation.covered_externally": {
      const roundNumber = metaNumber(metadata, "roundNumber");
      const principalRemaining = metaString(metadata, "principalRemaining");
      const accruedInterest = metaString(metadata, "accruedInterest");
      const note = metaString(metadata, "note");
      const name = metaString(metadata, "memberDisplayName");
      if (name) details.push(`Member: ${name}`);
      if (roundNumber != null) details.push(`From round ${roundNumber}`);
      if (principalRemaining) {
        details.push(`Principal still owed: ₱${Number(principalRemaining).toLocaleString()}`);
      }
      if (accruedInterest && Number(accruedInterest) > 0) {
        details.push(`Accrued interest: ₱${Number(accruedInterest).toLocaleString()}`);
      }
      if (note) details.push(`Note: ${note}`);
      details.push("Manager fronted the pot; member debt continues until settled");
      return {
        category: "obligation",
        title: "Pot covered by manager",
        summary: name
          ? `Manager fronted ${name}'s shortfall for the round pot`
          : "Manager fronted a shortfall for the round pot",
        details,
      };
    }
    case "contribution.reported":
    case "contribution.confirmed":
    case "contribution.recorded": {
      const membershipId = metaString(metadata, "membershipId");
      const roundId = metaString(metadata, "roundId");
      const roundNumber = metaNumber(metadata, "roundNumber");
      const name =
        metaString(metadata, "memberDisplayName") ??
        memberName(ctx, membershipId);
      const round =
        roundNumber != null
          ? `Round ${roundNumber}`
          : roundLabel(ctx, roundId);
      const amount = metaString(metadata, "amount");
      const expectedAmount = metaString(metadata, "expectedAmount");
      const partial = metaBool(metadata, "partial");
      const placeholder = metaBool(metadata, "placeholder");
      if (name) details.push(`Member: ${name}${placeholder ? " (placeholder)" : ""}`);
      if (round) details.push(round);
      if (amount) details.push(`Paid: ₱${Number(amount).toLocaleString()}`);
      if (expectedAmount && partial) {
        details.push(`Expected: ₱${Number(expectedAmount).toLocaleString()} (partial payment)`);
      }
      if (log.action === "contribution.reported") {
        details.push("Status: Pending → Reported");
        return {
          category: "contribution",
          title: "Payment reported",
          summary:
            name && round
              ? `${name} reported payment for ${round.toLowerCase()}`
              : "A member reported making their payment",
          details,
        };
      }
      if (log.action === "contribution.confirmed") {
        details.push("Status: Reported → Confirmed");
        return {
          category: "contribution",
          title: "Payment confirmed",
          summary:
            name && round
              ? `Manager confirmed ${name}'s payment for ${round.toLowerCase()}`
              : "A reported payment was confirmed",
          details,
        };
      }
      details.push("Recorded by manager on behalf of member");
      details.push("Status: Pending → Confirmed");
      return {
        category: "contribution",
        title: "Payment recorded",
        summary:
          name && round
            ? `Manager marked ${name} as paid for ${round.toLowerCase()}`
            : "Manager recorded a payment on a member's behalf",
        details,
      };
    }
    case "dispute.raised": {
      const name = metaString(metadata, "memberDisplayName") ?? memberName(ctx, metaString(metadata, "membershipId"));
      const roundNumber = metaNumber(metadata, "roundNumber");
      const note = metaString(metadata, "note");
      if (name) details.push(`Member: ${name}`);
      if (roundNumber != null) details.push(`Round ${roundNumber}`);
      if (note) details.push(`Reason: ${note}`);
      return {
        category: "dispute",
        title: "Dispute raised",
        summary:
          name && roundNumber != null
            ? `Payment dispute opened for ${name} (round ${roundNumber})`
            : "A payment dispute was opened",
        details,
      };
    }
    case "dispute.resolved": {
      const name = metaString(metadata, "memberDisplayName") ?? memberName(ctx, metaString(metadata, "membershipId"));
      const roundNumber = metaNumber(metadata, "roundNumber");
      const resolution = metaString(metadata, "resolution");
      if (name) details.push(`Member: ${name}`);
      if (roundNumber != null) details.push(`Round ${roundNumber}`);
      if (resolution) details.push(`Resolution: ${resolution}`);
      return {
        category: "dispute",
        title: "Dispute resolved",
        summary:
          name && roundNumber != null
            ? `Manager resolved dispute for ${name} (round ${roundNumber})`
            : "A payment dispute was resolved",
        details,
      };
    }
    default:
      return {
        category: log.entityType,
        title: log.action.replace(/\./g, " · "),
        summary: `${log.entityType} event`,
        details: Object.entries(metadata).map(([k, v]) => `${k}: ${String(v)}`),
      };
  }
}

export async function getGroupAuditLog(groupId: string, limit = 50) {
  const [logs, members, rounds, contributions] = await Promise.all([
    prisma.auditLog.findMany({
      where: { groupId },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.membership.findMany({
      where: { groupId },
      select: { id: true, displayName: true },
    }),
    prisma.round.findMany({
      where: { groupId },
      select: { id: true, number: true },
    }),
    prisma.contribution.findMany({
      where: { round: { groupId } },
      select: { id: true, amount: true, membershipId: true, roundId: true },
    }),
  ]);

  const ctx: AuditContext = {
    membersById: new Map(members.map((m) => [m.id, { displayName: m.displayName }])),
    roundsById: new Map(rounds.map((r) => [r.id, { number: r.number }])),
    contributionsById: new Map(contributions.map((c) => [c.id, c])),
  };

  return logs.map((log) => {
    const formatted = formatAction(log, ctx);
    return {
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorName: log.actor?.displayName ?? "System",
      createdAt: log.createdAt.toISOString(),
      title: formatted.title,
      summary: formatted.summary,
      details: formatted.details,
      category: formatted.category,
      categoryLabel: formatted.category.charAt(0).toUpperCase() + formatted.category.slice(1),
    };
  });
}
