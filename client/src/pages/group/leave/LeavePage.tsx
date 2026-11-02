import { type ReactNode, useId, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, CircleCheck, CircleDashed, Download, Hourglass, Link2 } from "lucide-react";
import { DISPUTE_REASON_MAX_LENGTH } from "@domain/constants";
import { api, type GroupDetail, type LeavingCheck, type WithdrawalView } from "../../../api/client";
import { ActionBar } from "../../../components/flow/ActionBar";
import { ProofPicker } from "../../../components/flow/ProofPicker";
import { ShareLink } from "../../../components/flow/ShareLink";
import { useDialog } from "../../../context/useDialog";
import { formatDueDate } from "../../../lib/dates";
import { useGroupActions } from "../../../lib/groupQueries";
import { formatPeso } from "../../../lib/money";
import { uploadProof } from "../../../lib/proofUpload";
import { ui } from "../../../lib/ui";
import { DisputeSheet, type DisputeInput } from "../active/DisputeSheet";
import { standingOf } from "../active/period";
import { useGroupShell } from "../groupShell";

const OPEN: WithdrawalView["status"][] = ["AWAITING_REPLACEMENT", "AWAITING_ORGANIZER"];

/**
 * §9.1: leaving by handing the slot to a replacement. The slot's standing sits beside the steps (a
 * column on phones): the to-dos that must settle (R-WDR-03), then the reason and proof (R-WDR-06);
 * once sent, the request's status and the link to share. Reached from the group menu.
 */
export function LeavePage() {
  const { detail } = useGroupShell();
  const open = detail.withdrawals.find((w) => w.mine && OPEN.includes(w.status));
  if (!detail.leaving && !open) return <Navigate to={`/groups/${detail.group.id}`} replace />;
  return (
    <div className="space-y-6 md:grid md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:items-start md:gap-6 md:space-y-0 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:gap-8">
      <h2 className="sr-only">Leave {detail.group.name}</h2>
      <aside className="space-y-3 md:sticky md:top-24">
        <Standing
          detail={detail}
          contributed={open?.contributed ?? detail.leaving?.contributed ?? null}
          leftAhead={open ? open.leftAhead : (detail.leaving?.leftAhead ?? 0)}
        />
        <StatementDownload groupId={detail.group.id} />
      </aside>
      <div className="min-w-0 space-y-6">
        {open ? <RequestStatus detail={detail} request={open} /> : <Prepare detail={detail} leaving={detail.leaving!} />}
      </div>
    </div>
  );
}

type Row = { label: string; value: string; danger?: boolean };

/** The slot at a glance: what the replacement would take over. */
function Standing({ detail, contributed, leftAhead }: { detail: GroupDetail; contributed: number | null; leftAhead: number }) {
  const me = detail.slots.find((s) => s.isViewer)!;
  const turn = detail.schedule.find((r) => r.recipientSlotId === me.id);
  const thisRound = standingOf(detail, me.id);
  const debt = me.debt.principal + me.debt.interest;
  const rows: (Row | false | null | undefined)[] = [
    turn && { label: "Payout", value: `Round ${turn.number} · ${formatDueDate(turn.payoutDate)}` },
    contributed != null && { label: "Contributed", value: formatPeso(contributed) },
    thisRound && { label: `Round ${detail.period!.number}`, value: `${formatPeso(thisRound.approved)} of ${formatPeso(thisRound.due)}` },
    leftAhead > 0 && { label: "Paid ahead", value: formatPeso(leftAhead) },
    debt > 0 && { label: "Debt", value: formatPeso(debt), danger: true },
  ];
  return (
    <section aria-labelledby="leave-slot" className="rounded-3xl border border-ink-200 bg-white px-5 pt-4">
      <h3 id="leave-slot" className={ui.sectionHeading}>
        Your slot
      </h3>
      <dl className="divide-y divide-ink-100">
        {rows.filter((r): r is Row => !!r).map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-3.5">
            <dt className="text-sm text-ink-600">{r.label}</dt>
            <dd className={`text-right text-base font-bold tabular-nums ${r.danger ? "text-danger-700" : "text-ink-900"}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One numbered step of the request; its number turns into a check once it's done. */
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`leave-step-${n}`} className="rounded-3xl border border-ink-200 bg-white p-5 sm:p-6">
      <h3 id={`leave-step-${n}`} className={`${ui.sectionHeading} flex items-center gap-3`}>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-800"}`}
        >
          {done ? <Check className="h-4 w-4" aria-label="Done" /> : n}
        </span>
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CheckRow({ done, children }: { done: boolean; children: ReactNode }) {
  const Icon = done ? CircleCheck : CircleDashed;
  return (
    <li className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${done ? "text-brand-700" : "text-ink-400"}`} aria-label={done ? "Done" : "To do"} />
      <div className="min-w-0 flex-1 text-base text-ink-800">{children}</div>
    </li>
  );
}

/** R-WDR-02/03/05/06: the to-dos, then the request itself, sent from the action bar. */
function Prepare({ detail, leaving }: { detail: GroupDetail; leaving: LeavingCheck }) {
  const { run, pending, error, clearError } = useGroupActions(detail.group.id);
  const organizer = detail.group.organizerName;
  const reasonId = useId();
  // Payments the member chose to leave to the replacement; asking one back is a problem report.
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [askingBack, setAskingBack] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);

  const me = detail.slots.find((s) => s.isViewer)!;
  const debt = me.debt.principal + me.debt.interest;
  const waitingBack = (submissionId: string) =>
    detail.disputes.some((d) => d.submissionId === submissionId && d.forLeaving && d.status === "PENDING");
  const undecided = leaving.aheadPayments.filter((p) => !left.has(p.submissionId) && !waitingBack(p.submissionId));
  const latest = detail.withdrawals.find((w) => w.mine);
  const lastRejected = latest?.status === "REJECTED" ? latest : null;
  const reasonError = reason.trim().length > DISPUTE_REASON_MAX_LENGTH ? `Up to ${DISPUTE_REASON_MAX_LENGTH} characters.` : null;
  const ready = !leaving.blocker && leaving.todos.length === 0 && undecided.length === 0;
  const canSend = ready && !!reason.trim() && !reasonError && !!file && !sending;

  async function askBack(input: DisputeInput) {
    let message = "";
    const saved = await run("ask-back", () => api.raiseDispute(detail.group.id, input), { onError: (e) => (message = e.message) });
    if (!saved) {
      clearError();
      throw new Error(message);
    }
    return true;
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setFormError("");
    try {
      const proofPath = await uploadProof(detail.group.id, file!);
      await run("leave", () => api.requestWithdrawal(detail.group.id, { reason: reason.trim(), proofPath, leftAhead: leaving.leftAhead }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't send it. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (leaving.blocker) return <p className={ui.warning}>{leaving.blocker}</p>;

  return (
    <>
      {lastRejected?.reviewNote && (
        <p className={ui.warning}>
          {organizer} didn&apos;t approve your last request: {lastRejected.reviewNote}
        </p>
      )}

      <Step n={1} title="Settle first" done={ready}>
        <ul className="divide-y divide-ink-100">
          {leaving.todos.map((todo) => (
            <CheckRow key={todo} done={false}>
              {todo}
            </CheckRow>
          ))}
          {leaving.todos.length === 0 && <CheckRow done>Nothing waiting for review</CheckRow>}
          {leaving.aheadPayments.map((p) => {
            const waiting = waitingBack(p.submissionId);
            const isLeft = left.has(p.submissionId);
            return (
              <CheckRow key={p.submissionId} done={isLeft}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <b className="tabular-nums">{formatPeso(p.amount)}</b> paid for round {p.round}
                  </span>
                  {waiting ? (
                    <span className={`${ui.badgeTurn} self-start sm:self-auto`}>
                      <Hourglass className="h-3.5 w-3.5" aria-hidden />
                      Asked back · {organizer} decides
                    </span>
                  ) : (
                    <span className="grid grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        aria-pressed={isLeft}
                        onClick={() =>
                          setLeft((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.submissionId)) next.delete(p.submissionId);
                            else next.add(p.submissionId);
                            return next;
                          })
                        }
                        className={`${isLeft ? ui.btnPrimarySm : ui.btnSecondarySm} min-h-11`}
                      >
                        Leave it
                      </button>
                      <button type="button" onClick={() => setAskingBack(p.submissionId)} className={`${ui.btnSecondarySm} min-h-11`}>
                        Ask back
                      </button>
                    </span>
                  )}
                </div>
              </CheckRow>
            );
          })}
          {/* R-WDR-05: debt doesn't block; the replacement sees it before accepting. */}
          {debt > 0 && <CheckRow done>Your {formatPeso(debt)} debt goes with the slot</CheckRow>}
        </ul>
      </Step>

      <Step n={2} title="Why you're leaving" done={!!reason.trim() && !reasonError && !!file}>
        <form
          id="leave-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div>
            <label htmlFor={reasonId} className={ui.label}>
              Reason · only {organizer} sees it
            </label>
            <textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className={ui.input} />
            {reasonError && <p className="mt-1.5 text-xs font-semibold text-danger-700">{reasonError}</p>}
          </div>
          <ProofPicker
            file={file}
            onChange={(f) => {
              setFormError("");
              setFile(f);
            }}
            onError={setFormError}
            prompt="Add a supporting photo"
          />
          {(formError || error) && (
            <p className={ui.error} role="alert">
              {formError || error?.message}
            </p>
          )}
        </form>
      </Step>

      <ActionBar hint={ready ? undefined : "Finish step 1 first."}>
        <button type="submit" form="leave-form" disabled={!canSend || pending === "leave"} className={ui.btnPrimary}>
          {sending ? "Sending…" : "Send and get a link"}
        </button>
      </ActionBar>

      <DisputeSheet
        detail={detail}
        submission={detail.submissions.find((s) => s.id === askingBack) ?? null}
        forLeaving
        onClose={() => setAskingBack(null)}
        onSubmit={askBack}
      />
    </>
  );
}

/** R-WDR-06…11: where the open request stands, the link while it looks for someone, and cancelling. */
function RequestStatus({ detail, request }: { detail: GroupDetail; request: WithdrawalView }) {
  const { run, pending, error } = useGroupActions(detail.group.id);
  const dialog = useDialog();
  const organizer = detail.group.organizerName;
  const awaitingOrganizer = request.status === "AWAITING_ORGANIZER";
  // R-WDR-10: reserved for someone who must accept again.
  const reaccept = request.status === "AWAITING_REPLACEMENT" && request.replacement;

  async function cancel() {
    const confirmed = await dialog.confirm({
      title: "Cancel your request to leave?",
      description: "You keep your slot. You can start again later.",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep it",
      variant: "danger",
    });
    if (confirmed) await run("cancel-leave", () => api.cancelWithdrawal(detail.group.id, request.id));
  }

  const Icon = awaitingOrganizer || reaccept ? Hourglass : Link2;
  return (
    <>
      <section className="rounded-3xl border-2 border-brand-200 bg-brand-50 p-5 sm:p-6">
        <h3 className="font-heading flex items-start gap-3 text-lg font-bold text-brand-900">
          <Icon className="mt-1 h-5 w-5 shrink-0" aria-hidden />
          {awaitingOrganizer
            ? `${request.replacement?.name} agreed. ${organizer} approves next.`
            : reaccept
              ? `${request.replacement?.name} must accept again`
              : "Share this link with your replacement"}
        </h3>
        {(awaitingOrganizer || reaccept) && (
          <p className="mt-2 text-sm text-brand-900">
            {awaitingOrganizer ? "Keep paying as usual until then." : "Your slot's debt grew after they agreed."}
          </p>
        )}
        {request.link && !reaccept && (
          <div className="mt-4">
            <ShareLink url={request.link} shareText={`Take over my slot in ${detail.group.name} on Kaban`} />
          </div>
        )}
        {request.expiresAt && (
          <p className="mt-4 text-xs font-semibold text-brand-800">Expires {formatDueDate(request.expiresAt.slice(0, 10))}</p>
        )}
      </section>
      {request.blockers.length > 0 && (
        <ul className="space-y-2">
          {request.blockers.map((b) => (
            <li key={b} className={ui.warning}>
              {b}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className={ui.error} role="alert">
          {error.message}
        </p>
      )}
      <button
        type="button"
        onClick={() => void cancel()}
        disabled={pending === "cancel-leave"}
        className={`${ui.btnDangerGhost} min-h-11 w-full sm:w-auto sm:px-4`}
      >
        Cancel my request
      </button>
    </>
  );
}

/** R-WDR-12: the member's own records, to keep before they lose access. */
function StatementDownload({ groupId }: { groupId: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          setFailed(false);
          api
            .downloadExport(groupId, "statement", "pdf")
            .catch(() => setFailed(true))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className={`${ui.btnSecondaryFull} min-h-11`}
      >
        <Download className="h-4 w-4" aria-hidden />
        {busy ? "Preparing…" : "Download my statement"}
      </button>
      {failed && (
        <p className="mt-2 text-center text-xs font-semibold text-danger-700" role="alert">
          Couldn&apos;t download it. Try again.
        </p>
      )}
    </div>
  );
}
