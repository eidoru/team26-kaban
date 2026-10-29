import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText } from "lucide-react";
import { ApiError, api, type ExportFormat, type ExportKind, type GroupDetail } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { groupKey } from "../../../lib/groupQueries";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";

/**
 * R-CMP-02 on a finished paluwagan: what went in and out overall, and each member's totals (who
 * still owes what is in Debts, so it isn't repeated per member here). Lives
 * under the group's query key, so any group refresh (a late debt payment) refreshes it too.
 */
export function Recap({ detail }: { detail: GroupDetail }) {
  const { data } = useQuery({
    queryKey: [...groupKey(detail.group.id), "summary"],
    queryFn: () => api.summary(detail.group.id),
  });
  if (!data) return <div className={`${ui.skeleton} h-48`} aria-busy />;
  const { totals, members } = data;
  const facts = [
    { label: "Collected", value: totals.collected },
    { label: "Paid out", value: totals.paidOut },
    { label: "Covered by the organizer", value: totals.coveredByOrganizer },
    { label: "Still owed", value: totals.debtOutstanding },
  ];
  return (
    <section aria-labelledby="recap-heading">
      <h2 id="recap-heading" className={`${ui.sectionHeading} mb-3`}>
        Recap
      </h2>
      <dl className="grid grid-cols-2 gap-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-2xl border border-ink-200 bg-white p-4">
            <dt className="text-xs text-ink-500">{f.label}</dt>
            <dd className="font-heading mt-0.5 text-lg font-bold tabular-nums text-ink-900">{formatPeso(f.value)}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {members.map((m) => {
          const slot = detail.slots.find((s) => s.id === m.slotId);
          return (
            <li key={m.slotId} className={`flex items-center gap-3 px-4 py-3 ${slot?.isViewer ? "bg-brand-50" : ""}`}>
              <Avatar name={m.name} size="md" placeholder={slot?.kind === "PLACEHOLDER"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink-900">
                  {m.name}
                </span>
                <span className="block text-xs text-ink-500 tabular-nums">
                  Paid in {formatPeso(m.contributed)} · got {formatPeso(m.received)}
                  {m.refunds > 0 && ` · refunds ${formatPeso(m.refunds)}`}
                  {m.fees > 0 && ` · fees ${formatPeso(m.fees)}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * §14 downloads: your statement and the summary for everyone; the full ledger and any member's
 * statement for the organizer. Each as PDF or CSV.
 */
export function RecordsSection({ detail }: { detail: GroupDetail }) {
  const { group, viewer } = detail;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statementFor, setStatementFor] = useState(viewer.slotId);
  const selectId = useId();
  const complete = group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT";

  async function download(kind: ExportKind, format: ExportFormat, slotId?: string) {
    const key = `${kind}-${format}`;
    setBusy(key);
    setError("");
    try {
      await api.downloadExport(group.id, kind, format, slotId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't download it. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const row = (title: string, detailText: string, kind: ExportKind, slotId?: string) => (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-900">{title}</span>
        <span className="block text-xs text-ink-500">{detailText}</span>
      </span>
      <span className="flex gap-2">
        {(["pdf", "csv"] as const).map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => void download(kind, format, slotId)}
            disabled={busy !== null}
            className={`${ui.btnSecondarySm} min-h-9`}
            aria-label={`${title} as ${format.toUpperCase()}`}
          >
            {format === "pdf" ? <FileText className="h-3.5 w-3.5" aria-hidden /> : <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />}
            {busy === `${kind}-${format}` ? "…" : format.toUpperCase()}
          </button>
        ))}
      </span>
    </li>
  );

  const others = detail.slots.filter((s) => !s.isViewer);
  return (
    <section aria-labelledby="records-heading">
      {/* The Money & records tab names this; the heading is for screen readers. */}
      <h2 id="records-heading" className="sr-only">
        Records
      </h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {viewer.isOrganizer && others.length > 0 ? (
          <li className="px-4 pt-3">
            <label htmlFor={selectId} className="text-xs font-semibold text-ink-500">
              Statement for
            </label>
            <select
              id={selectId}
              value={statementFor}
              onChange={(e) => setStatementFor(e.target.value)}
              className={`${ui.input} mt-1 py-2`}
            >
              <option value={viewer.slotId}>You</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </li>
        ) : null}
        {row(
          statementFor === viewer.slotId ? "Your statement" : `${detail.slots.find((s) => s.id === statementFor)?.name}'s statement`,
          "Payments, debts and payouts for one slot",
          "statement",
          statementFor === viewer.slotId ? undefined : statementFor,
        )}
        {viewer.isOrganizer && row("Full ledger", "Every member and every round", "ledger")}
        {row(complete ? "Completion summary" : "Summary so far", "Each member's totals", "summary")}
      </ul>
      {error && (
        <p className={`${ui.error} mt-2`} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
