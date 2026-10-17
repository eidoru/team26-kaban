/** §3 */
export type GroupState =
  | "LOBBY"
  | "LAUNCHED"
  | "ACTIVE"
  | "COMPLETED"
  | "COMPLETED_WITH_OUTSTANDING_DEBT"
  | "CANCELLED";

const TRANSITIONS: Record<GroupState, GroupState[]> = {
  // R-LCH-03; R-LOB-06 and R-DEC-03 (cancel only from LOBBY)
  LOBBY: ["LAUNCHED", "CANCELLED"],
  // R-LCH-04
  LAUNCHED: ["ACTIVE"],
  // R-CMP-01
  ACTIVE: ["COMPLETED", "COMPLETED_WITH_OUTSTANDING_DEBT"],
  COMPLETED: [],
  // R-CMP-03 (assumption)
  COMPLETED_WITH_OUTSTANDING_DEBT: ["COMPLETED"],
  CANCELLED: [],
};

export function canTransition(from: GroupState, to: GroupState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** What each state allows. Settings, roster and order are only editable in LOBBY (R-LCH-03, §11). */
export const can = {
  editSettings: (s: GroupState) => s === "LOBBY",
  changeRoster: (s: GroupState) => s === "LOBBY",
  arrangeOrder: (s: GroupState) => s === "LOBBY",
  join: (s: GroupState) => s === "LOBBY", // R-INV-06 (assumption)
  claimPlaceholder: (s: GroupState) => s === "LOBBY" || s === "LAUNCHED" || s === "ACTIVE", // R-CLM-03
  submitContribution: (s: GroupState) => s === "ACTIVE",
  submitDebtPayment: (s: GroupState) => s === "ACTIVE" || s === "COMPLETED_WITH_OUTSTANDING_DEBT", // R-DBT-11
  requestSwap: (s: GroupState) => s === "ACTIVE",
  cancel: (s: GroupState) => s === "LOBBY",
};
