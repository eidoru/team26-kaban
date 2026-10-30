import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { earliestStartDate, frequencyLabel, type SetupErrors } from "@domain/setup";
import { STANDARD_TERMS } from "@domain/terms";
import { ApiError, api } from "../../api/client";
import { ActionBar } from "../../components/flow/ActionBar";
import { Sheet } from "../../components/flow/Sheet";
import { Stepper } from "../../components/flow/Stepper";
import { TermsText } from "../../components/Terms";
import { formatDueDate, todayInManila } from "../../lib/dates";
import { groupKey } from "../../lib/groupQueries";
import { invalidateHomeLists } from "../../lib/homeQueries";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";
import { BasicsSection, InterestSection, MoneySection, PotCard, ScheduleSection } from "./SetupFields";
import { draftErrors, emptyDraft, previewAmounts, STEP_FIELDS, toInput, type SetupDraft } from "./setupDraft";

const STEPS = [
  { label: "Basics", title: "Name your paluwagan", subtitle: "You can change these until it launches." },
  { label: "Money", title: "How much goes in?", subtitle: "Set what each member pays, or the total pot." },
  { label: "Schedule", title: "When are payouts?", subtitle: "One member gets the whole pot on each payout date." },
  { label: "Shortfalls", title: "If someone pays short", subtitle: "Optional. Decide this now so everyone knows upfront." },
  { label: "Review", title: "Check everything", subtitle: "Next, you'll invite members from the lobby." },
];

/** §4: a five-step wizard. Rules come from the shared domain code, so it says what the server says. */
export function CreateGroupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SetupDraft>(emptyDraft);
  const [serverErrors, setServerErrors] = useState<SetupErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const today = todayInManila();
  const errors = useMemo(() => ({ ...draftErrors(draft, today), ...serverErrors }), [draft, today, serverErrors]);
  const stepErrors = STEP_FIELDS[step].filter((field) => errors[field]);
  const set = (patch: Partial<SetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setServerErrors({});
  };

  async function create() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const detail = await api.createGroup(toInput(draft));
      queryClient.setQueryData(groupKey(detail.group.id), detail);
      invalidateHomeLists(queryClient);
      navigate(`/groups/${detail.group.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setServerErrors(err.fields);
        const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => err.fields?.[f]));
        if (firstStep >= 0) setStep(firstStep);
      } else {
        setSubmitError(err instanceof ApiError ? err.message : "Couldn't create the paluwagan. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const sectionProps = { draft, set, errors };
  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        {step === 0 ? (
          <Link to="/home" className={ui.btnGhost}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Cancel
          </Link>
        ) : (
          <button type="button" onClick={() => setStep(step - 1)} className={ui.btnGhost}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        )}
      </div>
      <Stepper steps={STEPS.map((s) => s.label)} current={step} />
      <h1 className={`${ui.pageTitle} mt-5`}>{STEPS[step].title}</h1>
      <p className={ui.pageSubtitle}>{STEPS[step].subtitle}</p>

      <form
        id="create-group-form"
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (stepErrors.length > 0) return;
          if (isLast) void create();
          else setStep(step + 1);
        }}
      >
        {step >= 1 && step <= 3 && <PotCard draft={draft} />}
        {step === 0 && <BasicsSection {...sectionProps} />}
        {step === 1 && <MoneySection {...sectionProps} />}
        {step === 2 && <ScheduleSection {...sectionProps} earliestStart={earliestStartDate(today)} />}
        {step === 3 && <InterestSection {...sectionProps} />}
        {step === 4 && <Review draft={draft} onEdit={setStep} />}
        {submitError && <p className={ui.error}>{submitError}</p>}

        <ActionBar hint={stepErrors.length > 0 ? "Fix the highlighted fields to continue." : undefined}>
          {/* The bar renders outside the form (ActionBar portals it), so the button names its form. */}
          <button
            type="submit"
            form="create-group-form"
            disabled={stepErrors.length > 0 || submitting}
            className={`${ui.btnPrimary} sm:min-w-44`}
          >
            {isLast ? (submitting ? "Creating…" : "Create paluwagan") : "Continue"}
          </button>
        </ActionBar>
      </form>
    </div>
  );
}

function Review({ draft, onEdit }: { draft: SetupDraft; onEdit: (step: number) => void }) {
  const amounts = previewAmounts(draft);
  const [termsOpen, setTermsOpen] = useState(false);
  const rows: { label: string; value: string; step: number }[] = [
    { label: "Name", value: draft.name.trim(), step: 0 },
    { label: "Slots", value: String(draft.slotCount), step: 0 },
    { label: "Contribution", value: amounts ? formatPeso(amounts.contribution) : "—", step: 1 },
    { label: "Pot", value: amounts ? formatPeso(amounts.pot) : "—", step: 1 },
    { label: "Frequency", value: frequencyLabel(draft.frequency, Number(draft.intervalText) || null), step: 2 },
    { label: "Start date", value: formatDueDate(draft.startDate), step: 2 },
    { label: "Shortfall interest", value: draft.interestOn ? `${draft.interestText}% per period` : "None", step: 3 },
  ];
  return (
    <>
      <PotCard draft={draft} />
      <dl className="divide-y divide-ink-100 rounded-3xl border border-ink-200 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-5 py-3">
            <dt className="w-32 shrink-0 text-sm text-ink-500">{row.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">{row.value}</dd>
            <button type="button" onClick={() => onEdit(row.step)} className={`${ui.link} shrink-0`}>
              Edit<span className="sr-only"> {row.label.toLowerCase()}</span>
            </button>
          </div>
        ))}
        {/* R-SET-07, R-DEC-38: every paluwagan uses the standard terms for now, so they're shown, not edited. */}
        <div className="flex items-center gap-3 px-5 py-3">
          <dt className="w-32 shrink-0 text-sm text-ink-500">Member terms</dt>
          <dd className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">Standard</dd>
          <button type="button" onClick={() => setTermsOpen(true)} className={`${ui.link} shrink-0`}>
            View<span className="sr-only"> member terms</span>
          </button>
        </div>
      </dl>
      <Sheet
        open={termsOpen}
        title="Member terms"
        subtitle="Members agree to these before joining."
        onClose={() => setTermsOpen(false)}
      >
        <TermsText terms={STANDARD_TERMS} />
      </Sheet>
    </>
  );
}
