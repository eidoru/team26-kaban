import type { DebtEntryKind, Slot } from "@prisma/client";
import { applyRepayment, inDebtMessage, outstanding, type DebtOwed, type DebtState } from "../domain/debt.js";
import { AppError } from "../lib/errors.js";
import type { Db } from "./common.js";

export function debtOf(slot: Pick<Slot, "debtPrincipal" | "debtInterest">): DebtState {
  return { principal: Number(slot.debtPrincipal), interest: Number(slot.debtInterest) };
}

/**
 * Record one change to a slot's debt (§8): an append-only DebtEntry, and the cached balance on the
 * slot moved by the same deltas. Zero changes write nothing.
 */
export async function recordDebtChange(
  db: Db,
  entry: {
    groupId: string;
    slotId: string;
    kind: DebtEntryKind;
    principalDelta: number;
    interestDelta: number;
    roundId?: string;
    submissionId?: string;
  },
) {
  if (entry.principalDelta === 0 && entry.interestDelta === 0) return;
  await db.debtEntry.create({
    data: {
      groupId: entry.groupId,
      slotId: entry.slotId,
      kind: entry.kind,
      principalDelta: BigInt(entry.principalDelta),
      interestDelta: BigInt(entry.interestDelta),
      roundId: entry.roundId,
      submissionId: entry.submissionId,
    },
  });
  await db.slot.update({
    where: { id: entry.slotId },
    data: {
      debtPrincipal: { increment: BigInt(entry.principalDelta) },
      debtInterest: { increment: BigInt(entry.interestDelta) },
    },
  });
}

/**
 * R-DBT-04 / R-DBT-05: an approved repayment goes to accrued interest first, then principal.
 * Returns the split, or null when it's more than the slot owes (R-DEC-19: the organizer denies it).
 */
export async function repayDebt(db: Db, slot: Slot, amount: number, submissionId: string) {
  const debt = debtOf(slot);
  if (amount > outstanding(debt)) return null;
  const { toInterest, toPrincipal } = applyRepayment(debt, amount);
  await recordDebtChange(db, {
    groupId: slot.groupId,
    slotId: slot.id,
    kind: "REPAYMENT",
    principalDelta: -toPrincipal,
    interestDelta: -toInterest,
    submissionId,
  });
  return { toInterest, toPrincipal, remaining: outstanding(debt) - amount };
}

/** Whether anyone in the group still owes the organizer. */
export async function groupHasDebt(db: Db, groupId: string) {
  const owing = await db.slot.count({
    where: { groupId, OR: [{ debtPrincipal: { gt: 0 } }, { debtInterest: { gt: 0 } }] },
  });
  return owing > 0;
}

/**
 * R-DEC-39: every paluwagan where this user's slot still owes the organizer, inherited debt
 * included (R-CLM-06). Reads the cached balances, so only approved repayments count.
 */
export async function debtsOwedBy(db: Db, userId: string): Promise<DebtOwed[]> {
  const slots = await db.slot.findMany({
    where: { userId, OR: [{ debtPrincipal: { gt: 0 } }, { debtInterest: { gt: 0 } }] },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return slots.map((s) => ({ groupId: s.groupId, groupName: s.group.name, owed: outstanding(debtOf(s)) }));
}

/** R-DEC-39: refuse to start, join or claim while the user owes in any paluwagan. */
export async function assertNoDebts(db: Db, userId: string, action: "create" | "join") {
  const debts = await debtsOwedBy(db, userId);
  if (debts.length > 0) throw new AppError(409, inDebtMessage(debts, action), "IN_DEBT");
}
