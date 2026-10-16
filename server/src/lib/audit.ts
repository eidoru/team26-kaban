import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

/** Every audited action (R-AUD-01). Dotted names group them for filters. */
export type AuditAction =
  | "group.created"
  | "group.edited"
  | "group.cancelled"
  | "group.launched"
  | "group.activated"
  | "invite_link.created"
  | "member.joined"
  | "member.left"
  | "member.kicked"
  | "placeholder.added"
  | "placeholder.deleted"
  | "claim_link.created"
  | "claim_link.revoked"
  | "placeholder.claimed"
  | "order.changed"
  | "order.shuffled"
  | "order.locked"
  | "order.reset"
  | "submission.created"
  | "submission.approved"
  | "submission.denied"
  | "submission.cancelled";

/**
 * Append one immutable entry (R-AUD-02, R-AUD-04). Amounts are centavos. `actorUserId` is null for
 * system actions. Write it in the same transaction as the change it records.
 */
export async function audit(
  db: Db,
  entry: {
    groupId: string;
    actorUserId: string | null;
    action: AuditAction;
    targetSlotId?: string | null;
    /** The target slot's name now; entries keep it even if the slot is later removed. */
    targetName?: string | null;
    amounts?: Record<string, number>;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    proofAttached?: boolean;
    selfApproved?: boolean;
  },
) {
  await db.auditEntry.create({
    data: {
      groupId: entry.groupId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetSlotId: entry.targetSlotId ?? null,
      targetName: entry.targetName ?? null,
      amounts: entry.amounts as Prisma.InputJsonValue | undefined,
      before: entry.before as Prisma.InputJsonValue | undefined,
      after: entry.after as Prisma.InputJsonValue | undefined,
      proofAttached: entry.proofAttached,
      selfApproved: entry.selfApproved ?? false,
    },
  });
}
