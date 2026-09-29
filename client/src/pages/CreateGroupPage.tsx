import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type GroupDetail, type GroupMember } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { invalidateHomeLists } from "../lib/homeQueries";
import { groupQueryKey } from "../lib/groupQueries";
import { formatFrequency, type GroupFrequencyValue } from "../lib/frequency";
import { formatDueDate, parseDateOnly } from "../lib/dates";
import {
  formatShortfallInterestHint,
  formatShortfallInterestRate,
} from "../lib/shortfallInterest";
import { ui } from "../lib/ui";
import { FieldError } from "../components/FieldError";
import {
  LIMITS,
  MAX_CONTRIBUTION,
  isPastDateInput,
  pesoAmountError,
  todayDateInput,
} from "../lib/validation";
import { GroupHeader } from "../components/GroupChrome";
import { SegmentedControl } from "../components/SegmentedControl";
import { ToggleSwitch } from "../components/ToggleSwitch";

const PRESET_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

type AmountMode = "total" | "perMember";

/** Per-member contribution can only be a single shared amount, so a total that doesn't
 * divide evenly is rounded up to the nearest cent — a short pot is worse than a small surplus. */
function computeContributionFromTotal(total: number, slots: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(slots) || slots < 2) {
    return NaN;
  }
  return Math.ceil((total / slots) * 100) / 100;
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Due date of the last round (YYYY-MM-DD in, display text out); mirrors the server's addFrequencyInterval. */
function lastPayoutDate(startDate: string, frequency: GroupFrequencyValue, customDays: number, rounds: number): string {
  const start = parseDateOnly(startDate);
  if (!start || isPastDateInput(startDate) || !Number.isInteger(rounds) || rounds < 2) return "—";
  const steps = rounds - 1;
  const end = new Date(start);
  if (frequency === "weekly") end.setDate(end.getDate() + 7 * steps);
  else if (frequency === "biweekly") end.setDate(end.getDate() + 14 * steps);
  else if (frequency === "monthly") end.setMonth(end.getMonth() + steps);
  else if (Number.isInteger(customDays) && customDays >= 1) end.setDate(end.getDate() + customDays * steps);
  else return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return formatDueDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-2.5 last:border-0">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-right text-sm font-bold text-ink-900">{value}</dd>
    </div>
  );
}

function FormSection({
  step,
  title,
  description,
  children,
}: {
  step?: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${ui.sectionCard} space-y-4`}>
      <div className="flex items-start gap-3">
        {step != null && (
          <span
            className="font-heading flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
            aria-hidden
          >
            {step}
          </span>
        )}
        <div>
          <h2 className={ui.sectionHeader}>{title}</h2>
          {description && <p className={ui.sectionSubtitle}>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A quiet visual of the roster: the manager's seat is already filled the moment the group exists.
 * Caps at the actual max slot count regardless of what's passed in — this renders one DOM node
 * per slot, so an unclamped huge value here would hang the page (30 slots is already the hard
 * server-side/business limit, so there's never a legitimate reason to render more). */
function RosterDots({ totalSlots }: { totalSlots: number }) {
  if (!Number.isFinite(totalSlots) || totalSlots < 2) return null;
  const dotCount = Math.min(totalSlots, 30);
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden>
      {Array.from({ length: dotCount }, (_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full ${i === 0 ? "bg-sun-300" : "bg-white/25"}`}
        />
      ))}
    </div>
  );
}

export function CreateGroupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("total");
  const [totalAmount, setTotalAmount] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [frequency, setFrequency] = useState<GroupFrequencyValue>("monthly");
  const [frequencyDays, setFrequencyDays] = useState("14");
  const [slotCount, setSlotCount] = useState("10");
  const [startDate, setStartDate] = useState("");
  const [interestEnabled, setInterestEnabled] = useState(false);
  const [shortfallInterestRatePercent, setShortfallInterestRatePercent] = useState("0");
  const [error, setError] = useState("");

  const customDays = parseInt(frequencyDays, 10);
  const slots = parseInt(slotCount, 10);

  function handleInterestToggle(next: boolean) {
    setInterestEnabled(next);
    if (!next) setShortfallInterestRatePercent("0");
  }

  // Checked as the organizer types, so an out-of-range value is flagged at the field right away
  // instead of only on submit. Empty fields are left to the required-field checks on submit.
  const slotsValue = Number(slotCount);
  const slotsValid = Number.isInteger(slotsValue) && slotsValue >= 2 && slotsValue <= 30;
  const maxTotal = MAX_CONTRIBUTION * (slotsValid ? slotsValue : 30);
  const daysValue = Number(frequencyDays);
  const rateValue = Number(shortfallInterestRatePercent);
  const fieldErrors = {
    totalAmount:
      amountMode === "total" && totalAmount !== ""
        ? Number(totalAmount) > maxTotal
          ? `Total pot can't be more than ${formatPeso(maxTotal)} for ${slotsValid ? slotsValue : 30} members (${formatPeso(
              MAX_CONTRIBUTION,
            )} each).`
          : pesoAmountError(Number(totalAmount), maxTotal)
        : null,
    contributionAmount:
      amountMode === "perMember" && contributionAmount !== ""
        ? pesoAmountError(Number(contributionAmount), MAX_CONTRIBUTION)
        : null,
    slots: slotCount !== "" && !slotsValid ? "Use a whole number from 2 to 30." : null,
    frequencyDays:
      frequency === "custom" && frequencyDays !== "" && !(Number.isInteger(daysValue) && daysValue >= 1 && daysValue <= 365)
        ? "Use a whole number of days from 1 to 365."
        : null,
    interest:
      interestEnabled &&
      shortfallInterestRatePercent !== "" &&
      !(rateValue >= 0 && rateValue <= 100 && Math.abs(rateValue * 100 - Math.round(rateValue * 100)) < 1e-6)
        ? "Use a rate from 0 to 100%, with at most 2 decimals."
        : null,
    startDate: startDate && isPastDateInput(startDate) ? "Pick today or a later date." : null,
  };
  const amountInvalid = !!(fieldErrors.totalAmount || fieldErrors.contributionAmount);

  // The stored amount is always a single shared per-member contribution — "total pot" mode
  // just computes it from the amount the organizer actually has in mind for the round.
  const effectiveContribution = amountInvalid
    ? NaN
    : amountMode === "total"
      ? computeContributionFromTotal(parseFloat(totalAmount), slots)
      : parseFloat(contributionAmount);

  const actualTotal =
    !Number.isNaN(effectiveContribution) && !Number.isNaN(slots) && slots >= 2
      ? effectiveContribution * slots
      : NaN;

  const requestedTotal = parseFloat(totalAmount);
  const totalRoundedUp =
    amountMode === "total" &&
    !Number.isNaN(actualTotal) &&
    !Number.isNaN(requestedTotal) &&
    actualTotal - requestedTotal > 0.004;

  const summary = useMemo(() => {
    return {
      contribution:
        !Number.isNaN(effectiveContribution) && effectiveContribution > 0
          ? formatPeso(effectiveContribution)
          : "—",
      total: !Number.isNaN(actualTotal) && actualTotal > 0 ? formatPeso(actualTotal) : "—",
      frequency: formatFrequency(
        frequency,
        frequency === "custom" && !Number.isNaN(customDays) ? customDays : null,
      ),
      roster: !Number.isNaN(slots) && slots >= 2 ? `1 / ${slots}` : "—",
      startDate: startDate && !isPastDateInput(startDate) ? formatDueDate(startDate) : "—",
      lastPayout: lastPayoutDate(startDate, frequency, customDays, slotsValid ? slotsValue : NaN),
      shortfallInterest: formatShortfallInterestRate(
        shortfallInterestRatePercent,
        frequency,
        frequency === "custom" && !Number.isNaN(customDays) ? customDays : null,
      ),
    };
  }, [
    effectiveContribution,
    actualTotal,
    customDays,
    frequency,
    slots,
    slotsValid,
    slotsValue,
    startDate,
    shortfallInterestRatePercent,
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createGroup({
        name: name.trim(),
        contributionAmount: effectiveContribution,
        frequency,
        ...(frequency === "custom" ? { frequencyDays: customDays } : {}),
        slotCount: slots,
        startDate,
        shortfallInterestRatePercent: parseFloat(shortfallInterestRatePercent) || 0,
      }),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (Object.values(fieldErrors).some(Boolean)) {
      setError("Fix the fields marked in red first.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a group name.");
      return;
    }
    if (Number.isNaN(slots) || slots < 2 || slots > 30) {
      setError("Slots must be between 2 and 30.");
      return;
    }
    if (amountMode === "total") {
      const totalError = pesoAmountError(requestedTotal, MAX_CONTRIBUTION * slots);
      if (totalError) {
        setError(`Total pot: ${totalError}`);
        return;
      }
    }
    const contributionError = pesoAmountError(effectiveContribution, MAX_CONTRIBUTION);
    if (contributionError) {
      setError(`Contribution: ${contributionError}`);
      return;
    }
    if (!startDate) {
      setError("Start date is required.");
      return;
    }
    if (isPastDateInput(startDate)) {
      setError("The first round can't be due in the past. Pick today or a later date.");
      return;
    }
    if (frequency === "custom") {
      if (Number.isNaN(customDays) || customDays < 1 || customDays > 365) {
        setError("Enter an interval between 1 and 365 days.");
        return;
      }
    }
    const interestRate = parseFloat(shortfallInterestRatePercent);
    if (Number.isNaN(interestRate) || interestRate < 0 || interestRate > 100) {
      setError("Shortfall interest must be between 0 and 100%.");
      return;
    }
    try {
      const data = await mutation.mutateAsync();
      // The server creates the manager's own membership in the same transaction as the group,
      // so the seeded cache must include it too — otherwise the Members table renders empty
      // until the cache goes stale and refetches.
      if (user) {
        const managerMember: GroupMember = {
          id: data.membershipId,
          displayName: user.displayName,
          contact: user.contact ?? null,
          isManager: true,
          isPlaceholder: false,
          userId: user.id,
          turnNumber: null,
        };
        queryClient.setQueryData<GroupDetail>(groupQueryKey(data.group.id), {
          group: { ...data.group, role: "manager" },
          members: [managerMember],
          pending: {
            payoutOrder: true,
            startDateMissing: !startDate,
            openSlots: Math.max(0, parseInt(slotCount, 10) - 1),
            unclaimedSeats: 0,
            cycleStarted: false,
            canActivate: false,
          },
          currentRound: null,
          schedule: [],
          issueCounts: { openDisputes: 0, unsettledObligations: 0 },
        });
      }
      invalidateHomeLists(queryClient);
      navigate(`/groups/${data.group.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create paluwagan");
    }
  }

  const headerFacts = [
    { label: "Total pot", value: summary.total },
    { label: "Roster", value: summary.roster },
    { label: "Starts", value: summary.startDate },
  ];

  return (
    <div className="min-w-0">
      {/* The live summary sits in the sidebar on large screens; phones get it under the title instead. */}
      <GroupHeader
        title="Create paluwagan"
        subtitle="Set the terms. You'll invite members and pick the payout order next."
        facts={headerFacts}
        factsClassName="lg:hidden"
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        {/* Live preview: the group as members will see it. Desktop only — phones get the facts under
            the title and the pot in the sticky submit bar. */}
        <aside className="hidden space-y-4 lg:order-last lg:block lg:w-72 lg:shrink-0 lg:self-start lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card">
            <div className="bg-gradient-to-br from-brand-700 to-brand-800 px-6 py-6 text-white">
              <p className="font-heading truncate text-lg font-bold">{name.trim() || "New paluwagan"}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-100">Each round&apos;s pot</p>
              <p className="font-heading mt-1 text-3xl font-bold tracking-tight tabular-nums">{summary.total}</p>
              <p className="mt-1 text-sm text-brand-50">
                <span className="font-bold text-white">{summary.contribution}</span> per member,{" "}
                {summary.frequency.toLowerCase()}
              </p>
              <div className="mt-5">
                <RosterDots totalSlots={slots} />
                <p className="mt-2 text-xs font-semibold text-brand-100">
                  {slotsValid ? `${slotsValue} members · your seat is the first` : "Set 2–30 members"}
                </p>
              </div>
            </div>
            <dl className="px-6 py-2">
              <SummaryRow label="Rounds" value={slotsValid ? `${slotsValue} (one payout each)` : "—"} />
              <SummaryRow label="First round due" value={summary.startDate} />
              <SummaryRow label="Last payout" value={summary.lastPayout} />
              <SummaryRow label="Shortfall interest" value={summary.shortfallInterest} />
            </dl>
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-6">
          {error && <p className={ui.error}>{error}</p>}

          <FormSection
            step={1}
            title="Group name"
            description="How members will recognize this paluwagan."
          >
            <div>
              <label htmlFor="name" className={ui.label}>
                Name
              </label>
              <input
                id="name"
                required
                maxLength={LIMITS.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Office savings"
                className={ui.input}
              />
            </div>
          </FormSection>

          <FormSection
            step={2}
            title="Contributions & roster"
            description="Slot count equals the number of rounds, and includes the manager."
          >
            <SegmentedControl
              name="Amount input mode"
              value={amountMode}
              onChange={setAmountMode}
              options={[
                { value: "total", label: "Total pot" },
                { value: "perMember", label: "Per member" },
              ]}
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {amountMode === "total" ? (
                <div>
                  <label htmlFor="totalAmount" className={ui.label}>
                    Total pot (₱)
                  </label>
                  <input
                    id="totalAmount"
                    type="number"
                    required
                    min="1"
                    max={maxTotal}
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="50000"
                    className={ui.input}
                    aria-invalid={!!fieldErrors.totalAmount}
                    aria-describedby={fieldErrors.totalAmount ? "totalAmount-error" : undefined}
                  />
                  <FieldError id="totalAmount-error" message={fieldErrors.totalAmount} />
                  <p className={ui.helperText}>Split evenly across every slot, manager included.</p>
                </div>
              ) : (
                <div>
                  <label htmlFor="amount" className={ui.label}>
                    Contribution (₱)
                  </label>
                  <input
                    id="amount"
                    type="number"
                    required
                    min="1"
                    max={MAX_CONTRIBUTION}
                    step="0.01"
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    placeholder="1000"
                    className={ui.input}
                    aria-invalid={!!fieldErrors.contributionAmount}
                    aria-describedby={fieldErrors.contributionAmount ? "amount-error" : undefined}
                  />
                  <FieldError id="amount-error" message={fieldErrors.contributionAmount} />
                  <p className={ui.helperText}>Each member pays this amount every round.</p>
                </div>
              )}
              <div>
                <label htmlFor="slots" className={ui.label}>
                  Slots
                </label>
                <input
                  id="slots"
                  type="number"
                  required
                  min="2"
                  max="30"
                  value={slotCount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Clamp only the upper bound live — anything above 30 has no legitimate
                    // use and, left unclamped, feeds straight into the roster-dot preview
                    // below (one DOM node per slot) and could hang the page. The lower bound
                    // is left alone here since a too-small value is harmless to render and is
                    // already caught by validation on submit.
                    const parsed = parseInt(raw, 10);
                    setSlotCount(!Number.isNaN(parsed) && parsed > 30 ? "30" : raw);
                  }}
                  className={ui.input}
                  aria-invalid={!!fieldErrors.slots}
                  aria-describedby={fieldErrors.slots ? "slots-error" : undefined}
                />
                {fieldErrors.slots ? (
                  <FieldError id="slots-error" message={fieldErrors.slots} />
                ) : (
                  <p className={ui.helperText}>2–30 members</p>
                )}
              </div>
            </div>

            {/* On large screens the preview already shows the per-member amount; keep the note there
                only when it has to explain rounding. */}
            {amountMode === "total" && summary.contribution !== "—" && (
              <p
                className={`rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900 ${totalRoundedUp ? "" : "lg:hidden"}`}
              >
                That&apos;s <span className="font-bold">{summary.contribution}</span> per member, per
                round.
                {totalRoundedUp && (
                  <>
                    {" "}
                    Rounded up so the pot doesn't fall short: the total collected comes to{" "}
                    <span className="font-bold">{summary.total}</span> instead of the{" "}
                    {formatPeso(requestedTotal)} requested.
                  </>
                )}
              </p>
            )}
          </FormSection>

          <FormSection step={3} title="Schedule" description="Round 1 is due on the start date.">
            <div className="space-y-6">
              <div>
                <label className={ui.label}>Frequency</label>
                <SegmentedControl
                  name="Frequency"
                  value={frequency}
                  onChange={setFrequency}
                  options={[...PRESET_FREQUENCIES, { value: "custom", label: "Custom" }]}
                />
              </div>
              {frequency === "custom" && (
                <div className="sm:max-w-xs">
                  <label htmlFor="frequencyDays" className={ui.label}>
                    Days between rounds
                  </label>
                  <input
                    id="frequencyDays"
                    type="number"
                    required
                    min={1}
                    max={365}
                    value={frequencyDays}
                    onChange={(e) => setFrequencyDays(e.target.value)}
                    className={ui.input}
                    aria-invalid={!!fieldErrors.frequencyDays}
                    aria-describedby={fieldErrors.frequencyDays ? "frequencyDays-error" : undefined}
                  />
                  <FieldError id="frequencyDays-error" message={fieldErrors.frequencyDays} />
                </div>
              )}
              <div className="sm:max-w-xs">
                <label htmlFor="startDate" className={ui.label}>
                  First round due
                </label>
                <input
                  id="startDate"
                  type="date"
                  required
                  min={todayDateInput()}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={ui.input}
                  aria-invalid={!!fieldErrors.startDate}
                  aria-describedby={fieldErrors.startDate ? "startDate-error" : undefined}
                />
                <FieldError id="startDate-error" message={fieldErrors.startDate} />
              </div>
            </div>
          </FormSection>

          <FormSection
            step={4}
            title="Shortfall interest"
            description="Optional. If a member underpays when a round closes, they owe the organizer."
          >
            <ToggleSwitch
              id="interestEnabled"
              checked={interestEnabled}
              onChange={handleInterestToggle}
              label="Charge interest on unpaid shortfalls"
            />
            {interestEnabled && (
              <div className="sm:max-w-xs">
                <label htmlFor="shortfallInterest" className={ui.label}>
                  Interest rate (% per round period)
                </label>
                <input
                  id="shortfallInterest"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={shortfallInterestRatePercent}
                  onChange={(e) => setShortfallInterestRatePercent(e.target.value)}
                  placeholder="2"
                  className={ui.input}
                  aria-invalid={!!fieldErrors.interest}
                  aria-describedby={fieldErrors.interest ? "shortfallInterest-error" : undefined}
                />
                <FieldError id="shortfallInterest-error" message={fieldErrors.interest} />
                <p className={ui.helperText}>
                  {formatShortfallInterestHint(
                    frequency,
                    frequency === "custom" && !Number.isNaN(customDays) ? customDays : null,
                  )}
                  .
                </p>
              </div>
            )}
          </FormSection>

          {/* Below lg the summary panel is hidden, so this bar carries the live total next to the
              submit button; it sits just above the mobile tab bar. */}
          <div className="sticky bottom-24 z-30 flex flex-col items-stretch gap-3 rounded-3xl border border-ink-200 bg-white/95 p-4 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-3 sm:pl-5 md:bottom-4 lg:static lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            {/* Phones stack the summary over a full-width button so nothing gets truncated. */}
            <div className="min-w-0 lg:hidden">
              <div className="flex items-baseline justify-between gap-3 sm:block">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Total pot</p>
                <p className="font-heading text-lg font-bold leading-tight tabular-nums text-ink-900 sm:truncate">
                  {summary.total}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-ink-500 sm:truncate">
                {summary.contribution} each · {summary.frequency}
              </p>
            </div>
            <button type="submit" disabled={mutation.isPending} className={`${ui.btnPrimary} w-full shrink-0 sm:w-auto`}>
              {mutation.isPending ? "Creating…" : "Create paluwagan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
