import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type ReplacementLanding } from "../../api/client";
import { Avatar } from "../../components/Avatar";
import { DebtBlock } from "../../components/DebtBlock";
import { Spinner } from "../../components/Splash";
import { TermsAgreement } from "../../components/Terms";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import { formatDueDate } from "../../lib/dates";
import { invalidateHomeLists } from "../../lib/homeQueries";
import { formatPeso, formatRate } from "../../lib/money";
import { clearPendingLink, stashPendingLink } from "../../lib/pendingInvite";
import { ui } from "../../lib/ui";
import { JoinShell, LinkProblem, Ticket } from "./Ticket";

/**
 * §9.1: taking over a member's slot. Signed-in visitors see everything they'd inherit before agreeing
 * (R-WDR-05, R-WDR-07): turn, payments, this round, money left to them and debt. Accepting sends it
 * to the organizer; nothing changes hands until they approve (R-WDR-09).
 */
export function ReplacePage() {
  const { token = "" } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const queryKey = ["replacement", token, user?.id ?? null];
  const { data, error, isPending } = useQuery({ queryKey, queryFn: () => api.getReplacement(token), retry: false });
  useEffect(() => {
    if (data) clearPendingLink();
  }, [data]);

  if (isPending) {
    return (
      <JoinShell>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </JoinShell>
    );
  }
  if (error || !data) {
    return (
      <JoinShell>
        <LinkProblem
          title="This link doesn't work"
          body={
            error instanceof ApiError && error.status === 404
              ? "It may have been replaced with a new one. Ask the member who sent it for the latest link."
              : "Check your connection and try again."
          }
        />
      </JoinShell>
    );
  }

  const { group, leaverName } = data;

  async function act(kind: "accept" | "decline") {
    const confirmed = await dialog.confirm(
      kind === "accept"
        ? {
            title: `Take over ${leaverName}'s slot?`,
            description: `${group.organizerName} approves it next. Once approved, the slot is yours with everything on it.`,
            confirmLabel: "Accept",
          }
        : {
            title: data!.status === "ACCEPTED" ? "Back out?" : "Decline?",
            description: `${leaverName} is told and can ask someone else.`,
            confirmLabel: data!.status === "ACCEPTED" ? "Back out" : "Decline",
            variant: "danger",
          },
    );
    if (!confirmed) return;
    setBusy(kind);
    setActionError("");
    try {
      if (kind === "accept") await api.acceptReplacement(token);
      else await api.declineReplacement(token);
      if (kind === "decline") {
        invalidateHomeLists(queryClient);
        navigate("/home", { replace: true });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["replacement", token] });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      void queryClient.invalidateQueries({ queryKey: ["replacement", token] });
    } finally {
      setBusy(null);
    }
  }

  function goAuth(path: "/login" | "/register") {
    stashPendingLink({ kind: "replace", token });
    navigate(path);
  }

  return (
    <JoinShell>
      <Ticket group={group} signedIn={!!user} eyebrow={<>{leaverName} asks you to take over their slot</>}>
        {data.record && <SlotRecord data={data} />}

        {data.status === "CLOSED" ? (
          <p className="text-center text-sm text-ink-700">
            <b>This request is closed.</b> {leaverName} may have cancelled it, or it was settled.
          </p>
        ) : data.status === "TAKEN" ? (
          <p className="text-center text-sm text-ink-700">
            <b>Someone else is taking this slot.</b>
          </p>
        ) : data.status === "ALREADY_MEMBER" ? (
          <p className="text-center text-sm text-ink-700">
            <b>You already have a slot in {group.name}.</b> One person can hold only one slot.{" "}
            <Link to={`/groups/${group.id}`} className={ui.link}>
              Open it
            </Link>
          </p>
        ) : data.status === "REPLACING_ANOTHER" ? (
          <p className="text-center text-sm text-ink-700">
            <b>You&apos;re already stepping in for another member of {group.name}.</b>
          </p>
        ) : data.status === "IN_DEBT" ? (
          <DebtBlock debts={data.debts} action="join" />
        ) : !user ? (
          <div className="space-y-2">
            <button type="button" onClick={() => goAuth("/login")} className={`${ui.btnPrimaryFull} min-h-11`}>
              Log in to see the slot
            </button>
            <button type="button" onClick={() => goAuth("/register")} className={`${ui.btnSecondaryFull} min-h-11`}>
              Register to see the slot
            </button>
          </div>
        ) : data.status === "ACCEPTED" ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-ink-700">
              <b>You accepted.</b> Waiting for {group.organizerName} to approve. You&apos;ll get a notification.
            </p>
            <button type="button" onClick={() => void act("decline")} disabled={busy !== null} className={ui.btnDangerGhost}>
              {busy === "decline" ? "Backing out…" : "Back out"}
            </button>
            {actionError && <p className={ui.error}>{actionError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {data.reaccept && (
              <p className={ui.warning}>The slot&apos;s debt grew since you agreed. Check it and accept again.</p>
            )}
            {/* R-WDR-07, R-DEC-38: the group's terms, agreed before taking the slot. */}
            {data.terms && <TermsAgreement terms={data.terms} agreed={agreed} onAgreedChange={setAgreed} />}
            <button
              type="button"
              onClick={() => void act("accept")}
              disabled={busy !== null || !agreed}
              className={`${ui.btnPrimaryFull} min-h-11`}
            >
              {busy === "accept" ? "Accepting…" : `Accept as ${user.displayName}`}
            </button>
            <button
              type="button"
              onClick={() => void act("decline")}
              disabled={busy !== null}
              className={`${ui.btnSecondaryFull} min-h-11`}
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
            {actionError && <p className={ui.error}>{actionError}</p>}
          </div>
        )}
      </Ticket>
    </JoinShell>
  );
}

type Row = { label: string; value: string; note?: string; danger?: boolean };

/** R-WDR-07: what comes with the slot, in the order it matters. */
function SlotRecord({ data }: { data: ReplacementLanding }) {
  const record = data.record!;
  const debt = record.debt.principal + record.debt.interest;
  const shortRounds = record.rounds.filter((r) => r.shortfall > 0);
  const rows: (Row | false | null)[] = [
    { label: "Contributed so far", value: formatPeso(record.contributed) },
    record.openRound && {
      label: `Still to pay for round ${record.openRound.round}`,
      value: formatPeso(record.openRound.unpaid),
      note: record.openRound.unpaid > 0 ? `By ${formatDueDate(record.openRound.payoutDate)}` : undefined,
    },
    record.leftAhead > 0 && { label: "Paid ahead, left to you", value: formatPeso(record.leftAhead) },
    {
      label: "Debt you'd take on",
      value: formatPeso(debt),
      note:
        debt > 0
          ? `${formatPeso(record.debt.principal)} owed + ${formatPeso(record.debt.interest)} interest${
              data.group.interestRate > 0 ? `, ${formatRate(data.group.interestRate)} more per payout until paid` : ""
            }. It comes off your payout.`
          : undefined,
      danger: debt > 0,
    },
  ];
  return (
    <section aria-label="This slot's record" className="mb-5 space-y-3 rounded-2xl bg-ink-50 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={data.leaverName} size="md" />
        <div>
          <p className="text-sm font-bold text-ink-900">{data.leaverName}&apos;s slot</p>
          <p className="text-xs text-ink-500">
            {record.turn ? `Gets the pot in round ${record.turn.round}, on ${formatDueDate(record.turn.payoutDate)}` : "Payout turn not set"}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-ink-200">
        {rows.filter((r): r is Row => !!r).map((r) => (
          <div key={r.label} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-ink-600">{r.label}</dt>
              <dd className={`text-sm font-bold tabular-nums ${r.danger ? "text-danger-700" : "text-ink-900"}`}>{r.value}</dd>
            </div>
            {r.note && <p className="mt-0.5 text-xs text-ink-500">{r.note}</p>}
          </div>
        ))}
      </dl>
      {shortRounds.length > 0 && (
        <p className="text-xs text-ink-600">
          Paid short in {shortRounds.map((r) => `round ${r.round} (${formatPeso(r.shortfall)})`).join(", ")}.
        </p>
      )}
      <p className="text-xs text-ink-600">
        You take on every contribution from here to the last round, including after your payout.
      </p>
    </section>
  );
}
