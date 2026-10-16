import type { Prisma } from "@prisma/client";
import { formatPeso } from "../domain/money.js";
import type { AuditAction } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { formatDisplayDate } from "../lib/dates.js";

/** Filters on the activity log. */
export type ActivityCategory = "payments" | "debts" | "payouts" | "disputes" | "swaps" | "members" | "settings";

const PREFIXES: Record<ActivityCategory, string[]> = {
  payments: ["submission.", "reminder."],
  debts: ["debt."],
  payouts: ["payout.", "round."],
  disputes: ["dispute.", "refund."],
  swaps: ["swap.", "order."],
  members: ["member.", "placeholder.", "claim_link.", "invite_link."],
  settings: ["group."],
};

export function categoryOf(action: string): ActivityCategory {
  return (Object.keys(PREFIXES) as ActivityCategory[]).find((c) => PREFIXES[c].some((p) => action.startsWith(p))) ?? "settings";
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  slotCount: "Slots",
  contribution: "Contribution",
  pot: "Pot",
  frequency: "Frequency",
  startDate: "Start date",
  interestRate: "Shortfall interest",
};

type Json = Record<string, unknown>;
const peso = (value: unknown) => formatPeso(Number(value ?? 0));

/**
 * One audit entry as a sentence anyone in the group can read (R-AUD-03), plus an optional detail
 * line. `actor` is "System" for scheduled actions.
 */
export function describe(entry: {
  action: string;
  actor: string;
  target: string | null;
  amounts: Json;
  before: Json;
  after: Json;
}): { title: string; detail: string | null } {
  const { actor, amounts: a, before: b, after: f } = entry;
  const target = entry.target ?? "a member";
  const self = actor === entry.target;
  const round = f.round != null ? ` in round ${f.round}` : "";
  const T = (title: string, detail: string | null = null) => ({ title, detail });

  switch (entry.action as AuditAction) {
    case "group.created":
      return T(`${actor} created the paluwagan`);
    case "group.edited":
      return T(
        `${actor} changed the details`,
        Object.keys(f)
          .map((k) => `${FIELD_LABELS[k] ?? k}: ${b[k]} → ${f[k]}`)
          .join(" · "),
      );
    case "group.cancelled":
      return T(`${actor} cancelled the paluwagan`);
    case "group.launched":
      return T(`${actor} launched the paluwagan`, f.startDate ? `It starts ${formatDisplayDate(String(f.startDate))}.` : null);
    case "group.activated":
      return T("The paluwagan started", "Round 1 is open for contributions.");
    case "group.completed":
      return T(f.outstandingDebt ? "Every payout is done" : "The paluwagan is complete", f.outstandingDebt ? "Some debts are still open." : "Nobody owes anything.");
    case "invite_link.created":
      return T(`${actor} made a new invite link`);
    case "member.joined":
      return T(`${target} joined`);
    case "member.left":
      return T(`${target} left`);
    case "member.kicked":
      return T(`${actor} removed ${target}`);
    case "placeholder.added":
      return T(`${actor} saved a slot for ${target}`, "A placeholder, for someone without an account.");
    case "placeholder.deleted":
      return T(`${actor} removed the placeholder ${target}`);
    case "claim_link.created":
      return T(`${actor} made a claim link for ${target}`);
    case "claim_link.revoked":
      return T(`${actor} turned off ${target}'s claim link`);
    case "placeholder.claimed":
      return T(`${f.name ?? target} claimed ${b.placeholderName ?? "a placeholder"}'s slot`, "Its turn and history carry over.");
    case "order.changed":
      return T(`${actor} arranged the payout order`);
    case "order.shuffled":
      return T(`${actor} shuffled the payout order`);
    case "order.reset":
      return T("The payout order was reset", typeof f.reason === "string" ? `${f.reason}.` : null);
    case "submission.created": {
      const debt = f.type === "DEBT_PAYMENT";
      return T(`${actor} reported ${peso(a.amount)}${self ? "" : ` for ${target}`}${debt ? " toward debt" : round}`);
    }
    case "submission.approved":
      return T(
        `${actor} approved ${self ? "their own" : `${target}'s`} ${peso(a.amount)}${f.appliedAs === "DEBT_PAYMENT" ? " toward debt" : round}`,
        a.toInterest != null ? `${peso(a.toInterest)} to interest, ${peso(a.toPrincipal)} to principal.` : null,
      );
    case "submission.denied":
      return T(`${actor} denied ${target}'s ${peso(a.amount)}`, typeof f.reason === "string" ? `Reason: ${f.reason}` : null);
    case "submission.cancelled":
      return T(`${actor} withdrew a ${peso(a.amount)} report`);
    case "round.opened":
      return T(`Round ${f.round} opened`);
    case "round.closed":
      return T(`Round ${f.round} closed`);
    case "payout.processed": {
      const deducted = Number(a.ownShortfall ?? 0) + Number(a.interestDeducted ?? 0) + Number(a.principalDeducted ?? 0);
      return T(
        `Round ${f.round} paid out: ${target} gets ${peso(a.net)}`,
        deducted > 0 ? `${peso(a.pot)} pot, less ${peso(deducted)} they owed.` : `The full ${peso(a.pot)} pot.`,
      );
    }
    case "payout.handed_over":
      return T(
        f.organizerOwnPayout ? `${actor} took their ${peso(a.net)} payout` : `${actor} handed ${peso(a.net)} to ${target}`,
        f.round ? `Round ${f.round}.` : null,
      );
    case "payout.confirmed":
      return f.automatic
        ? T(`${target}'s ${peso(a.net)} payout was marked received automatically`, `Round ${f.round}: not confirmed in time.`)
        : T(`${target} confirmed receiving ${peso(a.net)}`, f.round ? `Round ${f.round}.` : null);
    case "debt.created":
      return T(
        `${target} was ${peso(a.shortfall)} short${round}`,
        `The organizer covered it; it's now debt${Number(a.interest) > 0 ? `, with ${peso(a.interest)} interest` : ""}.`,
      );
    case "debt.interest_charged":
      return T(`${peso(a.interest)} interest added to ${target}'s debt`, `On ${peso(a.principal)} still unpaid${round}.`);
    case "debt.deducted":
      return T(
        `${peso(Number(a.interest ?? 0) + Number(a.principal ?? 0))} of ${target}'s debt came out of their payout`,
        round ? `Round ${f.round}.` : null,
      );
    case "debt.repaid":
      return T(`${target} paid down their debt`);
    case "dispute.raised":
      return T(`${actor} reported a problem with ${self ? "their" : `${target}'s`} payment: ${peso(b.amount)} → ${peso(f.amount)}`, typeof f.reason === "string" ? f.reason : null);
    case "dispute.approved":
      return T(`${actor} approved changing ${target}'s payment to ${peso(f.amount)}`, `It was ${peso(b.amount)}.`);
    case "dispute.denied":
      return T(`${actor} kept ${target}'s payment at ${peso(b.amount)}`, typeof f.reason === "string" ? `Reason: ${f.reason}` : null);
    case "dispute.cancelled":
      return T(`${actor} withdrew a problem report`);
    case "dispute.expired":
      return T(`${target}'s problem report expired at the payout`, `${peso(b.amount)} stands.`);
    case "refund.recorded":
      return T(`The organizer owes ${target} a ${peso(a.refund)} refund`);
    case "swap.requested": {
      const rounds = Object.entries(b).map(([who, n]) => `${who}: round ${n}`).join(", ");
      return T(`${actor} asked ${target} to swap turns`, rounds || null);
    }
    case "swap.accepted":
      return T(`${actor} agreed to swap turns with ${target}`);
    case "swap.declined":
      return T(`${actor} declined to swap turns with ${target}`);
    case "swap.approved": {
      const moves = Object.entries(f).map(([who, n]) => `${who} → round ${n}`).join(", ");
      return T("Two members swapped turns", moves || null);
    }
    case "swap.denied":
      return T(`${actor} didn't approve a turn swap`, typeof f.reason === "string" ? `Reason: ${f.reason}` : null);
    case "swap.cancelled":
      return T(`${actor} withdrew a swap request`);
    case "swap.expired":
      return T("A turn swap expired", f.reason === "paid out" ? "One of the turns was paid out first." : "It wasn't settled in time.");
    case "reminder.sent":
      return T(`${actor} reminded ${target} to pay`, `${peso(a.unpaid)} still unpaid${round}.`);
    default:
      return T(entry.action);
  }
}

/**
 * The public audit log (R-AUD-03), newest first, `limit` at a time. `before` is the id of the last
 * entry already shown. Every entry carries its flags (R-AUD-04).
 */
export async function activityLog(groupId: string, options: { before?: string; category?: ActivityCategory; limit?: number }) {
  const limit = Math.min(options.limit ?? 40, 100);
  const cursor = options.before ? await prisma.auditEntry.findFirst({ where: { id: options.before, groupId } }) : null;
  const filters: Prisma.AuditEntryWhereInput[] = [{ groupId }];
  if (options.category) filters.push({ OR: PREFIXES[options.category].map((p) => ({ action: { startsWith: p } })) });
  if (cursor) {
    filters.push({ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] });
  }
  const rows = await prisma.auditEntry.findMany({
    where: { AND: filters },
    include: { actor: { select: { displayName: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    hasMore: rows.length > limit,
    entries: page.map((row) => {
      const actor = row.actor?.displayName ?? "System";
      const text = describe({
        action: row.action,
        actor,
        target: row.targetName,
        amounts: (row.amounts as Json) ?? {},
        before: (row.before as Json) ?? {},
        after: (row.after as Json) ?? {},
      });
      return {
        id: row.id,
        at: row.createdAt.toISOString(),
        action: row.action,
        category: categoryOf(row.action),
        actor,
        system: !row.actorUserId,
        ...text,
        proofAttached: row.proofAttached,
        selfApproved: row.selfApproved,
      };
    }),
  };
}
