import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type GroupDetail } from "../api/client";
import { invalidateHomeLists } from "../lib/homeQueries";
import { groupQueryKey } from "../lib/groupQueries";
import { formatFrequency, type GroupFrequencyValue } from "../lib/frequency";
import {
  formatShortfallInterestHint,
  formatShortfallInterestRate,
} from "../lib/shortfallInterest";
import { ui } from "../lib/ui";
import { GroupHeader } from "../components/GroupChrome";

const PRESET_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-gray-50 py-2.5 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${ui.sectionCard} space-y-4`}>
      <div>
        <h2 className={ui.sectionHeader}>{title}</h2>
        {description && <p className={ui.sectionSubtitle}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function CreateGroupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [frequency, setFrequency] = useState<GroupFrequencyValue>("monthly");
  const [frequencyDays, setFrequencyDays] = useState("14");
  const [slotCount, setSlotCount] = useState("10");
  const [startDate, setStartDate] = useState("");
  const [shortfallInterestRatePercent, setShortfallInterestRatePercent] = useState("0");
  const [error, setError] = useState("");

  const customDays = parseInt(frequencyDays, 10);

  const summary = useMemo(() => {
    const amount = parseFloat(contributionAmount);
    const slots = parseInt(slotCount, 10);
    return {
      contribution:
        !Number.isNaN(amount) && amount > 0 ? `₱${amount.toLocaleString()}` : "—",
      frequency: formatFrequency(
        frequency,
        frequency === "custom" && !Number.isNaN(customDays) ? customDays : null,
      ),
      roster: !Number.isNaN(slots) && slots >= 2 ? `0 / ${slots}` : "—",
      startDate: startDate || "—",
      shortfallInterest: formatShortfallInterestRate(
        shortfallInterestRatePercent,
        frequency,
        frequency === "custom" && !Number.isNaN(customDays) ? customDays : null,
      ),
    };
  }, [contributionAmount, customDays, frequency, slotCount, startDate, shortfallInterestRatePercent]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createGroup({
        name: name.trim(),
        contributionAmount: parseFloat(contributionAmount),
        frequency,
        ...(frequency === "custom" ? { frequencyDays: customDays } : {}),
        slotCount: parseInt(slotCount, 10),
        startDate,
        shortfallInterestRatePercent: parseFloat(shortfallInterestRatePercent) || 0,
      }),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
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
      queryClient.setQueryData<GroupDetail>(groupQueryKey(data.group.id), {
        group: { ...data.group, role: "manager" },
        members: [],
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
      invalidateHomeLists(queryClient);
      navigate(`/groups/${data.group.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create group");
    }
  }

  const headerFacts = [
    { label: "Contribution", value: summary.contribution },
    { label: "Schedule", value: summary.frequency },
    { label: "Roster", value: summary.roster },
    { label: "Starts", value: summary.startDate },
  ];

  return (
    <div className="min-w-0">
      <GroupHeader title="Create paluwagan" phase="create" facts={headerFacts} />

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <aside className="space-y-4 md:order-last md:w-60 md:shrink-0 md:self-start lg:sticky lg:top-24">
          <div className={ui.sectionCard}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Preview</p>
            <h2 className="mt-1 truncate text-base font-medium text-slate-900">
              {name.trim() || "New paluwagan"}
            </h2>
            <dl className="mt-4">
              <SummaryRow label="Contribution" value={summary.contribution} />
              <SummaryRow label="Schedule" value={summary.frequency} />
              <SummaryRow label="Roster" value={summary.roster} />
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

          <FormSection title="Group name" description="How members will recognize this paluwagan.">
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
            title="Contributions & roster"
            description="Each member pays this amount every round. Slot count equals the number of rounds."
          >
            <div className="grid gap-6 sm:grid-cols-2">
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
              </div>
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
                  onChange={(e) => setSlotCount(e.target.value)}
                  className={ui.input}
                />
                <p className={ui.helperText}>2–30 members</p>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Shortfall interest"
            description="If a member underpays when a round closes, they owe the organizer. Interest accrues on the unpaid balance until settled."
          >
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
                className={ui.input}
              />
              <p className={ui.helperText}>
                {formatShortfallInterestHint(
                  frequency,
                  frequency === "custom" && !Number.isNaN(customDays) ? customDays : null,
                )}
                . Use 0 for no interest.
              </p>
            </div>
          </FormSection>

          <FormSection title="Schedule" description="Round 1 is due on the start date.">
            <div className="space-y-6">
              <div>
                <label htmlFor="frequency" className={ui.label}>
                  Frequency
                </label>
                <select
                  id="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as GroupFrequencyValue)}
                  className={`${ui.select} w-full sm:max-w-xs`}
                >
                  {PRESET_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                  <option value="custom">Custom interval</option>
                </select>
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
