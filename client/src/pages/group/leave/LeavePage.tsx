import { type ReactNode, useId, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, CircleCheck, CircleDashed, Download, Hourglass, Link2 } from "lucide-react";
import { DISPUTE_REASON_MAX_LENGTH } from "@domain/constants";
import { api, type GroupDetail, type LeavingCheck, type WithdrawalView } from "../../../api/client";
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
 * §9.1: leaving by handing the slot to a replacement. First the member's standing and the to-dos that
 * must settle (R-WDR-03), then the reason and proof (R-WDR-06); once sent, the request's status and
 * the link to share. Reached from the group menu.
 */
export function LeavePage() {
  const { detail } = useGroupShell();
  const open = detail.withdrawals.find((w) => w.mine && OPEN.includes(w.status));
  if (!detail.leaving && !open) return <Navigate to={`/groups/${detail.group.id}`} replace />;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link to={`/groups/${detail.group.id}`} className={ui.btnGhost}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Dashboard
      </Link>
      <h2 className={ui.sectionHeading}>Leave {detail.group.name}</h2>
      {open ? <RequestStatus detail={detail} request={open} /> : <Prepare detail={detail} leaving={detail.leaving!} />}
      <StatementDownload groupId={detail.group.id} />
    </div>
  );
}

type Row = { label: string; value: string; danger?: boolean };

/** The slot at a glance: what the replacement would take over. */
function Standing({ detail, leaving }: { detail: GroupDetail; leaving: LeavingCheck }) {
  const me = detail.slots.find((s) => s.isViewer)!;
  const turn = detail.schedule.find((r) => r.recipientSlotId === me.id);
  const thisRound = standingOf(detail, me.id);
  const debt = me.debt.principal + me.debt.interest;
  const rows: (Row | false | null | undefined)[] = [
    turn && { label: "Your payout", value: `Round ${turn.number} · ${formatDueDate(turn.payoutDate)}` },
    { label: "Contributed so far", value: formatPeso(leaving.contributed) },
    thisRound && { label: `Round ${detail.period!.number}`, value: `${formatPeso(thisRound.approved)} of ${formatPeso(thisRound.due)} paid` },
    leaving.leftAhead > 0 && { label: "This and later rounds", value: formatPeso(leaving.leftAhead) },
    debt > 0 && { label: "Debt", value: formatPeso(debt), danger: true },
  ];
  return (
    <dl className="divide-y divide-ink-100 rounded-3xl border border-ink-200 bg-white px-5">
      {rows.filter((r): r is Row => !!r).map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-3">
          <dt className="text-sm text-ink-600">{r.label}</dt>
          <dd className={`text-sm font-bold tabular-nums ${r.danger ? "text-danger-700" : "text-ink-900"}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Check({ done, children }: { done: boolean; children: ReactNode }) {
  const Icon = done ? CircleCheck : CircleDashed;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${done ? "text-brand-700" : "text-ink-400"}`} aria-label={done ? "Done" : "To do"} />
      <div className="min-w-0 flex-1 text-sm text-ink-800">{children}</div>
    </li>
  );
}

/** R-WDR-02/03/05/06: the standing, the to-dos, then the request itself. */
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

  if (leaving.blocker) {
    return (
      <>
        <Standing detail={detail} leaving={leaving} />
        <p className={ui.warning}>{leaving.blocker}</p>
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-ink-600">
        Someone with a Kaban account takes over your slot: your turn, your payments and any debt. {organizer} approves it.
      </p>
      {lastRejected?.reviewNote && (
        <p className={ui.warning}>
          {organizer} didn&apos;t approve your last request: {lastRejected.reviewNote}
        </p>
      )}
      <Standing detail={detail} leaving={leaving} />

      <section aria-labelledby="leave-todos">
        <h3 id="leave-todos" className="mb-1 text-sm font-bold text-ink-900">
          Before you can leave
        </h3>
        <ul className="divide-y divide-ink-100">
          {leaving.todos.map((todo) => (
            <Check key={todo} done={false}>
              {todo}
            </Check>
          ))}
          {leaving.todos.length === 0 && <Check done>Nothing is waiting for review.</Check>}
          {leaving.aheadPayments.map((p) => {
            const waiting = waitingBack(p.submissionId);
            const isLeft = left.has(p.submissionId);
            return (
              <Check key={p.submissionId} done={isLeft}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b className="tabular-nums">{formatPeso(p.amount)}</b> for round {p.round}
                    <span className="block text-xs text-ink-500">
                      {waiting
                        ? `Asked back · waiting for ${organizer}`
                        : isLeft
                          ? "Goes to your replacement"
                          : "Leave it to your replacement, or ask for it back."}
                    </span>
                  </span>
                  {!waiting && (
                    <span className="flex gap-2">
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
                        className={isLeft ? ui.btnPrimarySm : ui.btnSecondarySm}
                      >
                        Leave it
                      </button>
                      <button type="button" onClick={() => setAskingBack(p.submissionId)} className={ui.btnSecondarySm}>
                        Ask back
                      </button>
                    </span>
                  )}
                </div>
              </Check>
            );
          })}
          {/* R-WDR-05: debt doesn't block; the replacement sees it before accepting. */}
          {debt > 0 && (
            <Check done>
              Your {formatPeso(debt)} debt goes with the slot. Your replacement sees it before they accept.
            </Check>
          )}
        </ul>
      </section>

      <form
        id="leave-form"
        className="space-y-5 border-t border-ink-100 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div>
          <label htmlFor={reasonId} className={ui.label}>
            Why are you leaving?
          </label>
          <textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={ui.input} />
          {reasonError && <p className="mt-1.5 text-xs font-semibold text-danger-700">{reasonError}</p>}
          <p className={ui.helperText}>Only {organizer} sees this and the photo.</p>
        </div>
        <ProofPicker
          file={file}
          onChange={(f) => {
            setFormError("");
            setFile(f);
          }}
          onError={setFormError}
          prompt="Add a photo that supports your reason"
        />
        {(formError || error) && (
          <p className={ui.error} role="alert">
            {formError || error?.message}
          </p>
        )}
        <button type="submit" disabled={!canSend || pending === "leave"} className={`${ui.btnPrimaryFull} min-h-11`}>
          {sending ? "Sending…" : "Send and get a replacement link"}
        </button>
        {!ready && <p className="text-center text-xs text-ink-500">Finish the list above first.</p>}
      </form>

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

  return (
    <>
      <div className="rounded-3xl border-2 border-brand-200 bg-brand-50 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-brand-800">
          {awaitingOrganizer ? <Hourglass className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {awaitingOrganizer
            ? `${request.replacement?.name} agreed. Waiting for ${organizer} to approve.`
            : reaccept
              ? `Waiting for ${request.replacement?.name} to accept again`
              : "Share this link with the person taking your slot"}
        </p>
        <p className="mt-1 text-sm text-brand-900">
          {awaitingOrganizer
            ? "Keep paying as usual until it's approved. Once it is, you leave and they take over."
            : reaccept
              ? "Your slot's debt grew after they agreed, so they're asked to look again."
              : "They need a Kaban account and no debt in any paluwagan. They see your slot's record before agreeing."}
        </p>
        {request.link && !reaccept && (
          <div className="mt-4">
            <ShareLink url={request.link} shareText={`Take over my slot in ${detail.group.name} on Kaban`} />
          </div>
        )}
        {request.expiresAt && (
          <p className="mt-3 text-xs text-brand-800">Expires {formatDueDate(request.expiresAt.slice(0, 10))} if it isn&apos;t settled.</p>
        )}
      </div>
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
      <div className="text-center">
        <button type="button" onClick={() => void cancel()} disabled={pending === "cancel-leave"} className={ui.btnDangerGhost}>
          Cancel my request
        </button>
      </div>
    </>
  );
}

/** R-WDR-12: the member's own records, to keep before they lose access. */
function StatementDownload({ groupId }: { groupId: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="border-t border-ink-100 pt-6 text-center">
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
        className={ui.btnSecondary}
      >
        <Download className="h-4 w-4" aria-hidden />
        {busy ? "Preparing…" : "Download my statement"}
      </button>
      <p className="mt-2 text-xs text-ink-500">
        {failed ? "Couldn't download it. Try again." : "You lose access to this paluwagan once you leave."}
      </p>
    </div>
  );
}
