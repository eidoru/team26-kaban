import { submissionCap } from "@domain/submissions";
import type { GroupDetail } from "../../../api/client";

/** Pending submissions in the order they came in: the order they must be reviewed in (R-SUB-05). */
export function reviewQueue(detail: GroupDetail) {
  return detail.submissions
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** A slot's standing in the open period, plus what can still be reported for it (R-SUB-06). */
export function standingOf(detail: GroupDetail, slotId: string) {
  const standing = detail.period?.slots.find((s) => s.slotId === slotId);
  if (!standing) return null;
  return { ...standing, reportable: submissionCap(standing.due, standing.approved, standing.pending) };
}
