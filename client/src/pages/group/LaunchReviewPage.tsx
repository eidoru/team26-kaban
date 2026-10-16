import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../../api/client";
import { ActionBar } from "../../components/flow/ActionBar";
import { useDialog } from "../../context/DialogContext";
import { formatDueDate } from "../../lib/dates";
import { useGroup, useGroupActions } from "../../lib/groupQueries";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";
import { GroupDetails } from "./GroupDetails";
import { PayoutSchedule } from "./PayoutSchedule";

/** R-LCH-01: one last look at everything (details, every payout date and recipient, members) before launch. */
export function LaunchReviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { data: detail } = useGroup(id);
  const { run, pending, error } = useGroupActions(id);

  if (!detail) return <div className={`${ui.skeleton} h-96`} aria-busy />;
  const { group } = detail;
  if (!detail.viewer.isOrganizer || group.state !== "LOBBY") return <Navigate to={`/groups/${id}`} replace />;
  const blockers = detail.launch?.blockers ?? [];
  const last = detail.schedule[detail.schedule.length - 1];

  async function launch() {
    const confirmed = await dialog.confirm({
      title: `Launch ${group.name}?`,
      description:
        "After this, the settings, members and payout order are final, and the invite link stops working. Everyone is notified.",
      confirmLabel: "Launch",
    });
    if (confirmed && (await run("launch", () => api.launch(id)))) navigate(`/groups/${id}`, { replace: true });
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/groups/${id}`} className={`${ui.btnGhost} mb-6`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Link>
        <h1 className={ui.pageTitle}>Review and launch</h1>
        <p className={ui.pageSubtitle}>
          {group.slotCount} members each pay {formatPeso(group.contribution)} {group.frequencyLabel.toLowerCase()}, from{" "}
          {formatDueDate(group.startDate)} to {last ? formatDueDate(last.payoutDate) : "the last payout"}. Each payout is{" "}
          {formatPeso(group.pot)}.
        </p>
      </div>
      <PayoutSchedule detail={detail} />
      <GroupDetails detail={detail} />
      {blockers.length > 0 && <p className={ui.warning}>{blockers.join(" ")}</p>}
      {error && <p className={ui.error}>{error.message}</p>}
      <ActionBar>
        <button type="button" onClick={() => void launch()} disabled={blockers.length > 0 || pending === "launch"} className={ui.btnPrimary}>
          {pending === "launch" ? "Launching…" : "Launch paluwagan"}
        </button>
      </ActionBar>
    </div>
  );
}
