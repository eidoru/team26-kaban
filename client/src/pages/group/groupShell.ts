import { useOutletContext } from "react-router-dom";
import type { GroupDetail } from "../../api/client";

export interface GroupShellContext {
  detail: GroupDetail;
  /** The paluwagan has launched: its pages share the header and the view navigation. */
  navMode: boolean;
}

/** For pages inside the shell: the group, and whether the shell draws the header and navigation. */
export function useGroupShell(): GroupShellContext {
  return useOutletContext<GroupShellContext>();
}

/** Once launched, a paluwagan's pages are views of one place, switched from the navigation. */
export function hasViews(state: GroupDetail["group"]["state"]): boolean {
  return state === "LAUNCHED" || state === "ACTIVE" || state === "COMPLETED" || state === "COMPLETED_WITH_OUTSTANDING_DEBT";
}
