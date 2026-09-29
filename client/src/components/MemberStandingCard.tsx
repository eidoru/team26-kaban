import { Coins } from "lucide-react";
import type { MemberRoundStatus, MemberSummary } from "../api/client";
import { dueHint, formatDueDate, formatLocalDate } from "../lib/dates";
import { ui } from "../lib/ui";

const peso = (value: string | number) => `₱${Number(value).toLocaleString()}`;

const ROUND_STYLES: Record<MemberRoundStatus, { chip: string; dot: string; label: string }> = {
  paid: { chip: "bg-brand-600 text-white", dot: "bg-brand-600", label: "Paid" },
  partial: {
    chip: "bg-sun-300 text-ink-900",
    dot: "bg-sun-300",
    label: "Partial",
  },
  awaiting: {
    chip: "border-2 border-sun-400 bg-sun-50 text-ink-800",
    dot: "border-2 border-sun-400 bg-sun-50",
    label: "Waiting to confirm",
  },
  unpaid: {
    chip: "border-2 border-danger-400 bg-white text-danger-700",
    dot: "border-2 border-danger-400 bg-white",
    label: "Unpaid",
  },
  missed: {
    chip: "bg-danger-600 text-white",
    dot: "bg-danger-600",
    label: "Missed",
  },
  upcoming: {
    chip: "bg-ink-100 text-ink-500",
    dot: "bg-ink-100",
    label: "Upcoming",
  },
};

function payoutTile(payout: MemberSummary["payout"]) {
  if (!payout) {
    return {
      value: "—",
      hint: "No payout turn assigned",
      tone: "neutral" as const,
    };
  }
  if (payout.status === "received") {
    const when = payout.receivedAt ? ` · ${formatLocalDate(payout.receivedAt)}` : "";
    return {
      value: "Received",
      hint: `${peso(payout.potAmount)} in Round ${payout.roundNumber}${when}`,
      tone: "success" as const,
    };
  }
  if (payout.status === "current") {
    return {
      value: "This round",
      hint: `${peso(payout.potAmount)} pot · due ${formatDueDate(payout.dueDate)}`,
      tone: "success" as const,
    };
  }
  const away =
    payout.roundsAway == null
      ? ""
      : payout.roundsAway === 1
        ? " · next round"
        : ` · in ${payout.roundsAway} rounds`;
  return {
    value: `Round ${payout.roundNumber}`,
    hint: `${peso(payout.potAmount)} on ${formatDueDate(payout.dueDate)}${away}`,
    tone: "neutral" as const,
  };
}

type TileTone = "neutral" | "success" | "warning" | "danger";

const TILE_VALUE: Record<TileTone, string> = {
  neutral: "text-ink-900",
  success: "text-brand-700",
  warning: "text-ink-900",
  danger: "text-danger-700",
};

/** Compact metric so the card doesn't push the round hero off a phone screen. */
function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: TileTone }) {
  return (
    <div className="rounded-2xl bg-ink-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`font-heading mt-0.5 text-xl font-bold tabular-nums ${TILE_VALUE[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-600">{hint}</p>
    </div>
  );
}

/** The current round from the viewer's side: what's left to pay, or that it's handled. */
function currentRoundTile(summary: MemberSummary) {
  const { currentRound } = summary;
  if (!currentRound) return null;
  const record = summary.rounds.find((r) => r.number === currentRound.number);
  const remaining = Number(currentRound.remaining);
  if (record?.status === "awaiting") {
    return { value: "Reported", hint: "Waiting for the organizer to confirm", tone: "neutral" as const };
  }
  if (remaining <= 0) {
    return {
      value: "Paid",
      hint: `You're paid up for Round ${currentRound.number}`,
      tone: "success" as const,
    };
  }
  const due = dueHint(currentRound.dueDate);
  return {
    value: peso(remaining),
    hint: `Due ${formatDueDate(currentRound.dueDate)}${due ? ` · ${due.label}` : ""}`,
    tone: due?.overdue ? ("danger" as const) : ("warning" as const),
  };
}

/** The viewer's own standing in a started paluwagan: payout turn, payments, debt and round record. */
export function MemberStandingCard({
  summary,
  isCompleted,
  onOpenIssues,
}: {
  summary: MemberSummary;
  isCompleted: boolean;
  onOpenIssues?: () => void;
}) {
  const { currentRound, payout, payments, debt, receivable, rounds } = summary;
  const paid = Number(payments.paid);
  const expected = Number(isCompleted ? payments.expectedTotal : payments.expectedSoFar);
  const owed = Number(debt.remaining);
  const interest = Number(debt.interest);
  const payoutInfo = payoutTile(payout);
  const thisRound = currentRoundTile(summary);
  const stillToPay = Number(payments.stillToPay);
  const roundsLeft = rounds.filter((r) => r.status === "upcoming").length + (summary.currentRound ? 1 : 0);
  const interestSettled = Number(summary.interestSettled);

  const statusesPresent = (Object.keys(ROUND_STYLES) as MemberRoundStatus[]).filter((status) =>
    rounds.some((r) => r.status === status),
  );

  return (
    <section className={ui.sectionCard} aria-labelledby="member-standing-heading">
      <h3 id="member-standing-heading" className={ui.sectionHeader}>
        You in this paluwagan
      </h3>
      <p className={ui.sectionSubtitle}>Your payout, payments and balance. Only you see this.</p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        <Tile label="Your payout" value={payoutInfo.value} hint={payoutInfo.hint} tone={payoutInfo.tone} />
        <Tile
          label={isCompleted ? "You paid in" : "Paid so far"}
          value={peso(paid)}
          hint={`of ${peso(expected)} ${isCompleted ? "total" : "due so far"} · ${payments.roundsPaidInFull} of ${
            payments.roundsStarted
          } rounds in full`}
          tone={paid >= expected ? "success" : "warning"}
        />
        {receivable ? (
          <Tile
            label="Owed to you"
            value={peso(receivable.remaining)}
            hint={
              receivable.obligationCount > 0
                ? `From ${receivable.obligationCount} unsettled debt${receivable.obligationCount === 1 ? "" : "s"}, interest included`
                : "Everyone is settled up"
            }
            tone={receivable.obligationCount > 0 ? "warning" : "success"}
          />
        ) : (
          <Tile
            label="You owe"
            value={peso(owed)}
            hint={
              owed > 0
                ? interest > 0
                  ? `Includes ${peso(interest)} interest`
                  : `From ${debt.obligationCount} missed or partial round${debt.obligationCount === 1 ? "" : "s"}`
                : "Nothing owed"
            }
            tone={owed > 0 ? "danger" : "success"}
          />
        )}
      </div>

      <div
        className={`mt-2 grid grid-cols-2 gap-2 sm:gap-3 ${isCompleted ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        {thisRound ? (
          <Tile label={`Round ${summary.currentRound!.number}`} {...thisRound} />
        ) : (
          <Tile
            label="Rounds in full"
            value={`${payments.roundsPaidInFull} of ${payments.totalRounds}`}
            hint={`Paid the full ${peso(summary.contributionAmount)}`}
            tone={payments.roundsPaidInFull === payments.totalRounds ? "success" : "neutral"}
          />
        )}
        {!isCompleted && (
          <Tile
            label="Still to pay"
            value={peso(stillToPay)}
            hint={
              stillToPay > 0
                ? `Across the ${roundsLeft} round${roundsLeft === 1 ? "" : "s"} left`
                : "Nothing left this cycle"
            }
            tone="neutral"
          />
        )}
        <Tile
          label="On-time payments"
          value={payments.paymentsMade > 0 ? `${payments.paymentsOnTime} of ${payments.paymentsMade}` : "—"}
          hint={payments.paymentsMade > 0 ? "Paid on or before the due date" : "No payments yet"}
          tone={
            payments.paymentsMade > 0 && payments.paymentsOnTime === payments.paymentsMade
              ? "success"
              : "neutral"
          }
        />
        <Tile
          label={receivable ? "Interest earned" : "Interest paid"}
          value={peso(interestSettled)}
          hint={receivable ? "Collected on members' shortfalls" : "On late or short payments"}
          tone="neutral"
        />
      </div>

      {onOpenIssues && (owed > 0 || (receivable?.obligationCount ?? 0) > 0) && (
        <button type="button" onClick={onOpenIssues} className={`mt-3 ${ui.link}`}>
          {receivable ? "Review unsettled debts in Issues" : "Settle what you owe in Issues"}
        </button>
      )}

      {summary.openDisputes > 0 && (
        <p className="mt-3 rounded-2xl bg-sun-50 px-4 py-2.5 text-sm font-semibold text-ink-800">
          {summary.openDisputes === 1
            ? "A dispute about one of your payments is still open."
            : `${summary.openDisputes} disputes about your payments are still open.`}{" "}
          {onOpenIssues && (
            <button type="button" onClick={onOpenIssues} className={ui.link}>
              See Issues
            </button>
          )}
        </p>
      )}

      {rounds.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Your rounds</p>
          <ol className="mt-3 flex flex-wrap gap-x-2.5 gap-y-2">
            {rounds.map((round) => {
              const style = ROUND_STYLES[round.status];
              const amount = round.status === "partial" ? ` (${peso(round.amount)})` : "";
              const payoutNote = round.isPayout ? ", your payout" : "";
              const isNow = round.number === currentRound?.number;
              const description = `Round ${round.number}${isNow ? " (current)" : ""}, due ${formatDueDate(
                round.dueDate,
              )}: ${style.label}${amount}${payoutNote}`;
              return (
                <li
                  key={round.number}
                  title={description}
                  aria-label={description}
                  aria-current={isNow ? "step" : undefined}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`relative flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${style.chip} ${
                      isNow ? "ring-2 ring-brand-700 ring-offset-2" : ""
                    }`}
                  >
                    {round.number}
                    {round.isPayout && (
                      <Coins
                        className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 text-sun-700 shadow"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase leading-none tracking-wide ${
                      isNow ? "text-brand-700" : "invisible"
                    }`}
                    aria-hidden
                  >
                    Now
                  </span>
                </li>
              );
            })}
          </ol>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-600" aria-label="Legend">
            {statusesPresent.map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded-full ${ROUND_STYLES[status].dot}`} aria-hidden />
                {ROUND_STYLES[status].label}
              </li>
            ))}
            {payout && (
              <li className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-sun-700" aria-hidden />
                Your payout
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
