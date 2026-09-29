import { describe, expect, it } from "vitest";
import { ContributionStatus, Prisma, RoundStatus } from "@prisma/client";
import { buildMemberSummary } from "./memberSummary.js";

const d = (value: number | string) => new Prisma.Decimal(value);
const ME = "me";

function round(number: number, status: RoundStatus, recipient: string) {
  return {
    number,
    dueDate: new Date(Date.UTC(2026, 0, number)),
    status,
    closedAt: status === RoundStatus.closed ? new Date(Date.UTC(2026, 0, number, 12)) : null,
    recipientMembershipId: recipient,
  };
}

describe("buildMemberSummary", () => {
  const rounds = [
    round(1, RoundStatus.closed, "a"),
    round(2, RoundStatus.closed, "b"),
    round(3, RoundStatus.current, "c"),
    round(4, RoundStatus.scheduled, ME),
  ];

  it("summarizes payout, payments, debt and each round for the viewer", () => {
    const summary = buildMemberSummary({
      membershipId: ME,
      contributionAmount: d(1000),
      rounds,
      contributions: [
        // Paid on the due day (on time), a day late, and before the due date.
        { roundNumber: 1, status: ContributionStatus.confirmed, amount: d(1000), paidAt: new Date("2026-01-01T15:00:00Z") },
        { roundNumber: 2, status: ContributionStatus.confirmed, amount: d(600), paidAt: new Date("2026-01-03T01:00:00Z") },
        { roundNumber: 3, status: ContributionStatus.reported, amount: d(1000), paidAt: new Date("2026-01-02T00:00:00Z") },
      ],
      debts: [{ remaining: d(420), principalRemaining: d(400) }],
      interestSettled: d(15),
      openDisputes: 1,
    });

    expect(summary.currentRound).toEqual({ number: 3, dueDate: "2026-01-03", remaining: "0" });
    expect(summary.interestSettled).toBe("15");
    expect(summary.openDisputes).toBe(1);
    expect(summary.payout).toMatchObject({
      roundNumber: 4,
      potAmount: "4000",
      status: "upcoming",
      roundsAway: 1,
      receivedAt: null,
    });
    expect(summary.payments).toEqual({
      paid: "1600",
      expectedSoFar: "3000",
      expectedTotal: "4000",
      roundsPaidInFull: 1,
      roundsStarted: 3,
      totalRounds: 4,
      stillToPay: "1000",
      roundsLeftToPay: 1,
      paymentsMade: 3,
      paymentsOnTime: 2,
    });
    expect(summary.debt).toEqual({ remaining: "420", interest: "20", obligationCount: 1 });
    expect(summary.rounds.map((r) => r.status)).toEqual(["paid", "partial", "awaiting", "upcoming"]);
    expect(summary.rounds.map((r) => r.isPayout)).toEqual([false, false, false, true]);
  });

  it("marks unpaid rounds as missed once closed, and a closed payout round as received", () => {
    const summary = buildMemberSummary({
      membershipId: "a",
      contributionAmount: d(500),
      rounds: [round(1, RoundStatus.closed, "a"), round(2, RoundStatus.current, "b")],
      contributions: [
        { roundNumber: 1, status: ContributionStatus.pending, amount: d(0) },
        { roundNumber: 2, status: ContributionStatus.pending, amount: d(0) },
      ],
      debts: [],
    });

    expect(summary.payout).toMatchObject({ roundNumber: 1, status: "received", roundsAway: null });
    expect(summary.payout?.receivedAt).not.toBeNull();
    expect(summary.rounds.map((r) => r.status)).toEqual(["missed", "unpaid"]);
    expect(summary.currentRound?.remaining).toBe("500");
    expect(summary.payments.stillToPay).toBe("500");
    expect(summary.debt).toEqual({ remaining: "0", interest: "0", obligationCount: 0 });
    expect(summary.receivable).toBeNull();
  });

  it("gives organizers what members owe them instead of a debt of their own", () => {
    const summary = buildMemberSummary({
      membershipId: ME,
      contributionAmount: d(1000),
      rounds,
      contributions: [],
      debts: [],
      receivables: [
        { remaining: d(400), principalRemaining: d(400) },
        { remaining: d(1050), principalRemaining: d(1000) },
      ],
    });

    expect(summary.receivable).toEqual({ remaining: "1450", obligationCount: 2 });
    expect(summary.debt.remaining).toBe("0");
  });
});
