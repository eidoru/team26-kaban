import { formatPeso } from "../domain/money.js";
import { frequencyLabel } from "../domain/setup.js";
import { csvMoney, Report, toCsv, type Column } from "../lib/documents.js";
import { forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { APP_TIME_ZONE } from "../lib/today.js";
import { slotName } from "./common.js";
import { completionSummary, recordEvents, type MemberTotals, type RecordEvent } from "./records.js";
import { formatDisplayDate } from "../lib/dates.js";

export type ExportKind = "statement" | "ledger" | "summary";
export type ExportFormat = "pdf" | "csv";

const FOOTER = "Kaban records payments made outside the app. It never holds money.";
const when = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: APP_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(date);
const csvWhen = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: APP_TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(date);
const signed = (centavos: number) => `${centavos < 0 ? "−" : "+"}${formatPeso(Math.abs(centavos))}`;
const slug = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paluwagan";

function debtChange(e: RecordEvent): string {
  if (e.principalDelta == null || e.interestDelta == null) return "";
  const total = e.principalDelta + e.interestDelta;
  return e.interestDelta !== 0 && e.principalDelta !== 0
    ? `${signed(total)} (${formatPeso(Math.abs(e.interestDelta))} interest)`
    : signed(total);
}

function totalsFacts(m: MemberTotals): [string, string][] {
  return [
    ["Contributed", formatPeso(m.contributed)],
    ["Received", formatPeso(m.received)],
    ["Refunds owed to you", formatPeso(m.refunds)],
    ["Debt incurred (with interest)", formatPeso(m.debtIncurred)],
    ["Debt settled", formatPeso(m.debtSettled)],
    ["Debt outstanding", formatPeso(m.debtOutstanding)],
  ];
}

/**
 * §14: a member statement (that slot's history), the organizer ledger (everything), or the
 * completion summary (R-CMP-02), as a PDF or a CSV. Members get their own statement and the
 * summary; the ledger, and other members' statements, are the organizer's.
 */
export async function buildExport(input: {
  groupId: string;
  viewerUserId: string;
  kind: ExportKind;
  format: ExportFormat;
  slotId?: string;
}): Promise<{ filename: string; contentType: string; body: Buffer }> {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: input.groupId },
    include: { organizer: { select: { displayName: true } }, rounds: true, slots: { include: { user: true } } },
  });
  const viewer = group.slots.find((s) => s.userId === input.viewerUserId)!;
  const terms = `${formatPeso(Number(group.contribution))} ${frequencyLabel(group.frequency, group.intervalDays).toLowerCase()} · ${group.slotCount} slots · ${formatPeso(Number(group.pot))} pot`;
  const generated = `Generated ${when(new Date())} (Philippine time)`;
  const base = slug(group.name);

  if (input.kind === "ledger" && !viewer.isOrganizer) throw forbidden("Only the organizer can export the full ledger.");

  if (input.kind === "summary") {
    const { members, totals } = await completionSummary(group.id);
    const complete = group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT";
    const header = ["Member", "Payout turn", "Contributed", "Received", "Refunds", "Covered by organizer", "Debt incurred", "Debt settled", "Debt outstanding"];
    const rows = members.map((m) => [m.name, m.position, m.contributed, m.received, m.refunds, m.coveredByOrganizer, m.debtIncurred, m.debtSettled, m.debtOutstanding] as const);
    if (input.format === "csv") {
      return {
        filename: `${base}-summary.csv`,
        contentType: "text/csv; charset=utf-8",
        body: toCsv(header, [
          ...rows.map(([name, pos, ...money]) => [name, pos ?? "", ...money.map(csvMoney)]),
          ["Total", "", csvMoney(totals.collected), csvMoney(totals.paidOut), csvMoney(totals.refunds), csvMoney(totals.coveredByOrganizer), "", "", csvMoney(totals.debtOutstanding)],
        ]),
      };
    }
    const report = new Report(FOOTER)
      .title(complete ? "Completion summary" : "Summary so far", group.name, [terms, `Organized by ${group.organizer.displayName}`, generated])
      .facts([
        ["Collected from members", formatPeso(totals.collected)],
        ["Paid out", formatPeso(totals.paidOut)],
        ["Shortfalls the organizer covered", formatPeso(totals.coveredByOrganizer)],
        ["Still owed to the organizer", formatPeso(totals.debtOutstanding)],
      ]);
    if (!complete) report.note("The paluwagan is still running, so these totals will change.");
    const columns: Column[] = [
      { header: "Member", width: 2.2 },
      { header: "Turn", width: 0.7, align: "right" },
      // Short headers that wrap between words, not inside them.
      ...["Paid in", "Received", "Refunds", "Covered", "Debt incurred", "Settled", "Still owed"].map((h) => ({ header: h, width: 1.2, align: "right" as const })),
    ];
    report.table(columns, rows.map(([name, pos, ...money]) => [name, pos == null ? "" : String(pos), ...money.map((c) => formatPeso(c))]));
    return { filename: `${base}-summary.pdf`, contentType: "application/pdf", body: await report.finish() };
  }

  if (input.kind === "statement") {
    const slot = group.slots.find((s) => s.id === (input.slotId ?? viewer.id));
    if (!slot) throw notFound("Slot");
    if (slot.id !== viewer.id && !viewer.isOrganizer) throw forbidden("You can only export your own statement.");
    const [{ members }, events] = await Promise.all([completionSummary(group.id), recordEvents(group.id, slot.id)]);
    const totals = members.find((m) => m.slotId === slot.id)!;
    const name = slotName(slot);
    const round = group.rounds.find((r) => r.recipientSlotId === slot.id);
    const header = ["Date", "Round", "Event", "Amount", "Debt change", "Status", "Notes", "Inherited"];
    if (input.format === "csv") {
      return {
        filename: `${base}-statement-${slug(name)}.csv`,
        contentType: "text/csv; charset=utf-8",
        body: toCsv(
          header,
          events.map((e) => [
            csvWhen(e.at),
            e.round ?? "",
            e.event,
            csvMoney(e.amount),
            e.principalDelta == null ? "" : csvMoney(e.principalDelta + (e.interestDelta ?? 0)),
            e.status ?? "",
            e.notes,
            e.inherited ? "yes" : "",
          ]),
        ),
      };
    }
    const lines = [
      `${group.name} · ${terms}`,
      round ? `Payout turn: round ${round.number}, ${formatDisplayDate(round.payoutDate)}` : "Payout turn not set yet",
      ...(slot.claimedAt ? [`Claimed from a placeholder on ${when(slot.claimedAt)}. Earlier records are marked inherited.`] : []),
      generated,
    ];
    const report = new Report(FOOTER).title("Member statement", name, lines).facts(totalsFacts(totals)).heading("History");
    report.table(
      [
        { header: "Date", width: 1.5 },
        { header: "Round", width: 0.8, align: "right" },
        { header: "Event", width: 1.9 },
        { header: "Amount", width: 1.1, align: "right" },
        { header: "Debt change", width: 1.5, align: "right" },
        { header: "Status", width: 1.2 },
        { header: "Notes", width: 2.6 },
      ],
      events.map((e) => [
        when(e.at),
        e.round == null ? "" : String(e.round),
        e.event,
        e.amount == null ? "" : formatPeso(e.amount),
        debtChange(e),
        e.status ?? "",
        [e.inherited && "Inherited", e.notes].filter(Boolean).join(". "),
      ]),
    );
    return { filename: `${base}-statement-${slug(name)}.pdf`, contentType: "application/pdf", body: await report.finish() };
  }

  // The organizer ledger: everything, every member, every period.
  const [{ totals }, events, results, payouts] = await Promise.all([
    completionSummary(group.id),
    recordEvents(group.id),
    prisma.roundSlotResult.findMany({ where: { round: { groupId: group.id } }, include: { round: true } }),
    prisma.payout.findMany({ where: { round: { groupId: group.id } }, include: { round: true } }),
  ]);
  const nameOf = (id: string) => {
    const slot = group.slots.find((s) => s.id === id);
    return slot ? slotName(slot) : "Former member";
  };
  if (input.format === "csv") {
    return {
      filename: `${base}-ledger.csv`,
      contentType: "text/csv; charset=utf-8",
      body: toCsv(
        ["Date", "Round", "Member", "Event", "Amount", "Debt principal change", "Debt interest change", "Status", "Notes", "Inherited"],
        events.map((e) => [
          csvWhen(e.at),
          e.round ?? "",
          e.name,
          e.event,
          csvMoney(e.amount),
          csvMoney(e.principalDelta),
          csvMoney(e.interestDelta),
          e.status ?? "",
          e.notes,
          e.inherited ? "yes" : "",
        ]),
      ),
    };
  }
  const report = new Report(FOOTER)
    .title("Organizer ledger", group.name, [terms, `Organized by ${group.organizer.displayName}`, generated])
    .facts([
      ["Collected from members", formatPeso(totals.collected)],
      ["Paid out", formatPeso(totals.paidOut)],
      ["Shortfalls you covered", formatPeso(totals.coveredByOrganizer)],
      ["Still owed to you", formatPeso(totals.debtOutstanding)],
      ["Refunds owed by you", formatPeso(totals.refunds)],
    ])
    .heading("Periods")
    .table(
      [
        { header: "Round", width: 0.8, align: "right" },
        { header: "Member", width: 2.4 },
        { header: "Due", width: 1.2, align: "right" },
        { header: "Approved", width: 1.2, align: "right" },
        { header: "Shortfall", width: 1.2, align: "right" },
        { header: "Covered by you", width: 1.3, align: "right" },
      ],
      results
        .sort((a, b) => a.round.number - b.round.number || nameOf(a.slotId).localeCompare(nameOf(b.slotId)))
        .map((r) => [String(r.round.number), nameOf(r.slotId), ...[r.due, r.approved, r.shortfall, r.coveredByOrganizer].map((v) => formatPeso(Number(v)))]),
      "No period has closed yet.",
    )
    .heading("Payouts")
    .table(
      [
        { header: "Round", width: 0.8, align: "right" },
        { header: "Recipient", width: 2.2 },
        { header: "Pot", width: 1.2, align: "right" },
        { header: "Deducted", width: 1.2, align: "right" },
        { header: "Handed over", width: 1.2, align: "right" },
        { header: "Status", width: 1.4 },
      ],
      payouts
        .sort((a, b) => a.round.number - b.round.number)
        .map((p) => [
          String(p.round.number),
          nameOf(p.round.recipientSlotId),
          formatPeso(Number(p.gross)),
          formatPeso(Number(p.ownShortfall) + Number(p.interestDeducted) + Number(p.principalDeducted)),
          formatPeso(Number(p.net)),
          { AWAITING_HANDOVER: "Not handed over yet", HANDED_OVER: "Handed over", CONFIRMED: "Received" }[p.status],
        ]),
      "No payout yet.",
    )
    .heading("All records")
    .table(
      [
        { header: "Date", width: 1.4 },
        { header: "Round", width: 0.8, align: "right" },
        { header: "Member", width: 1.5 },
        { header: "Event", width: 1.7 },
        { header: "Amount", width: 1.1, align: "right" },
        { header: "Debt change", width: 1.4, align: "right" },
        { header: "Status", width: 1.1 },
        { header: "Notes", width: 2.2 },
      ],
      events.map((e) => [
        when(e.at),
        e.round == null ? "" : String(e.round),
        e.name,
        e.event,
        e.amount == null ? "" : formatPeso(e.amount),
        debtChange(e),
        e.status ?? "",
        [e.inherited && "Inherited", e.notes].filter(Boolean).join(". "),
      ]),
    );
  return { filename: `${base}-ledger.pdf`, contentType: "application/pdf", body: await report.finish() };
}
