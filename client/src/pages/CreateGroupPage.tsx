import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type GroupDetail, type GroupMember } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { invalidateHomeLists } from "../lib/homeQueries";
import { groupQueryKey } from "../lib/groupQueries";
import { formatFrequency, type GroupFrequencyValue } from "../lib/frequency";
import {
  formatShortfallInterestHint,
  formatShortfallInterestRate,
} from "../lib/shortfallInterest";
import { ui } from "../lib/ui";
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-gray-50 py-2.5 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
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
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-xs font-medium text-white"
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
          className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/25"}`}
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

  // The stored amount is always a single shared per-member contribution — "total pot" mode
  // just computes it from the amount the organizer actually has in mind for the round.
  const effectiveContribution =
    amountMode === "total"
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
      startDate: startDate || "—",
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
    if (Number.isNaN(slots) || slots < 2 || slots > 30) {
      setError("Slots must be between 2 and 30.");
      return;
    }
    if (amountMode === "total") {
      if (Number.isNaN(requestedTotal) || requestedTotal <= 0) {
        setError("Enter a total pot amount.");
        return;
      }
    } else if (Number.isNaN(effectiveContribution) || effectiveContribution <= 0) {
      setError("Enter a contribution amount.");
      return;
    }
    if (!startDate) {
      setError("Start date is required.");
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
      <GroupHeader title="Create paluwagan" phase="create" facts={headerFacts} />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <aside className="space-y-4 lg:order-last lg:w-72 lg:shrink-0 lg:self-start lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
            <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 px-6 py-6 text-white">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-200">
                {name.trim() || "New paluwagan"}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{summary.total}</p>
              <p className="mt-1 text-sm text-emerald-100">
                total pot · {summary.contribution} per member
              </p>
              <div className="mt-5">
                <RosterDots totalSlots={slots} />
                <p className="mt-2 text-xs text-emerald-200">{summary.roster} slots claimed</p>
              </div>
            </div>
            <dl className="px-6 py-2">
              <SummaryRow label="Schedule" value={summary.frequency} />
              <SummaryRow label="Starts" value={summary.startDate} />
              <SummaryRow label="Shortfall interest" value={summary.shortfallInterest} />
            </dl>
          </div>
          <p className="text-sm text-slate-500">
            After creating, fill the roster, set payout order, then activate to open Round 1.
          </p>
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
                { value: "total", label: "Set total pot" },
                { value: "perMember", label: "Set per-member amount" },
              ]}
            />

            <div className="grid gap-6 sm:grid-cols-2">
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
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="50000"
                    className={ui.input}
                  />
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
                    step="0.01"
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    placeholder="1000"
                    className={ui.input}
                  />
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
                />
                <p className={ui.helperText}>2–30 members</p>
              </div>
            </div>

            {amountMode === "total" && summary.contribution !== "—" && (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                That's <span className="font-medium">{summary.contribution}</span> per member, per
                round.
                {totalRoundedUp && (
                  <>
                    {" "}
                    Rounded up so the pot doesn't fall short: the total collected comes to{" "}
                    <span className="font-medium">{summary.total}</span> instead of the{" "}
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
                  />
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
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={ui.input}
                />
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
                />
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

          <div className="flex justify-end">
            <button type="submit" disabled={mutation.isPending} className={ui.btnPrimary}>
              {mutation.isPending ? "Creating…" : "Create paluwagan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
