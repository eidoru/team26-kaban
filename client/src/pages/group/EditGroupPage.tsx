import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { earliestStartDate, type SetupErrors } from "@domain/setup";
import { api, type GroupDetail } from "../../api/client";
import { ActionBar } from "../../components/flow/ActionBar";
import { todayInManila } from "../../lib/dates";
import { useGroup, useGroupActions } from "../../lib/groupQueries";
import { ui } from "../../lib/ui";
import { BasicsSection, FeeSection, InterestSection, MoneySection, PotCard, ScheduleSection } from "../create/SetupFields";
import { draftErrors, draftFromGroup, toInput, type SetupDraft } from "../create/setupDraft";

/** R-LOB-09: every setting stays editable in the lobby, with the same rules as setup. */
export function EditGroupPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: detail } = useGroup(id);
  if (!detail) return <div className={`${ui.skeleton} h-96`} aria-busy />;
  if (!detail.viewer.isOrganizer || detail.group.state !== "LOBBY") return <Navigate to={`/groups/${id}`} replace />;
  return <EditForm detail={detail} />;
}

function EditForm({ detail }: { detail: GroupDetail }) {
  const navigate = useNavigate();
  const { group } = detail;
  const [draft, setDraft] = useState<SetupDraft>(() => draftFromGroup(group));
  const [serverErrors, setServerErrors] = useState<SetupErrors>({});
  const { run, pending, error } = useGroupActions(group.id);
  const today = todayInManila();
  const occupied = detail.slots.length;
  const errors = useMemo(
    () => ({ ...draftErrors(draft, today, occupied), ...serverErrors }),
    [draft, today, occupied, serverErrors],
  );
  const hasErrors = Object.keys(errors).length > 0;
  const set = (patch: Partial<SetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setServerErrors({});
  };
  const othersToNotify = detail.slots.filter((s) => s.kind === "MEMBER" && !s.isViewer).length;
  const sectionProps = { draft, set, errors };

  async function save() {
    const saved = await run("save", () => api.editGroup(group.id, toInput(draft)), {
      // Field errors land under their fields; anything else shows at the bottom.
      onError: (err) => setServerErrors(err.fields ?? {}),
    });
    if (saved) navigate(`/groups/${group.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/groups/${group.id}`} className={`${ui.btnGhost} mb-6`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>
      <h1 className={ui.pageTitle}>Edit details</h1>
      <p className="mt-3 flex gap-2 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {othersToNotify > 0
            ? `The ${othersToNotify} other member${othersToNotify === 1 ? "" : "s"} will be told exactly what changed.`
            : "Members who join later will see the new details."}{" "}
          Changing the number of slots resets the payout order.
        </span>
      </p>
      <form
        id="edit-group-form"
        className="mt-8 space-y-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (!hasErrors) void save();
        }}
      >
        <BasicsSection {...sectionProps} />
        <div className="space-y-6">
          <PotCard draft={draft} />
          <MoneySection {...sectionProps} />
        </div>
        <ScheduleSection {...sectionProps} earliestStart={earliestStartDate(today)} />
        <div>
          <h2 className={`${ui.sectionHeading} mb-3`}>Shortfalls</h2>
          <InterestSection {...sectionProps} />
        </div>
        <div>
          <h2 className={`${ui.sectionHeading} mb-3`}>Organizing fee</h2>
          <FeeSection {...sectionProps} />
        </div>
        {error && !error.fields && <p className={ui.error}>{error.message}</p>}
        <ActionBar hint={hasErrors ? "Fix the highlighted fields to save." : undefined}>
          {/* The bar renders outside the form (ActionBar portals it), so the button names its form. */}
          <button type="submit" form="edit-group-form" disabled={hasErrors || pending === "save"} className={ui.btnPrimary}>
            {pending === "save" ? "Saving…" : "Save changes"}
          </button>
        </ActionBar>
      </form>
    </div>
  );
}
