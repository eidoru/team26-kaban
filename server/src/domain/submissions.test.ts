import { describe, expect, it } from "vitest";
import { pesos, type Centavos } from "./money.js";
import {
  contributionApprovalError,
  correctionIncrease,
  disputeAmountError,
  contributionAmountError,
  contributionRooms,
  roundsLabel,
  splitContribution,
  periodStatus,
  refundFor,
  submissionAmountError,
  submissionCap,
} from "./submissions.js";

const EARLIER_FIRST = "Review the earlier one first.";

/**
 * One member's contributions for one open round, run through the same rules the server applies in
 * services/submissions and services/disputes: the room rule when sending and when raising a
 * correction (R-DEC-29), review in order (R-SUB-05), and the safety-net checks on approval. Each step
 * throws the server's message where the server refuses.
 */
function round(contribution: Centavos) {
  type Status = "PENDING" | "APPROVED" | "CANCELLED";
  const payments: { amount: Centavos; effective: Centavos | null; status: Status }[] = [];
  const reports: { payment: number; previous: Centavos; proposed: Centavos; status: Status }[] = [];
  const refunds: Centavos[] = [];
  const total = (status: Status) =>
    payments.filter((p) => p.status === status).reduce((sum, p) => sum + (p.effective ?? p.amount), 0);
  const approved = () => total("APPROVED");
  const increases = (except?: number) =>
    reports
      .filter((r, i) => r.status === "PENDING" && i !== except)
      .reduce((sum, r) => sum + correctionIncrease(r.previous, r.proposed), 0);
  /** Everything holding room until reviewed (R-DEC-29). */
  const waiting = (except?: number) => total("PENDING") + increases(except);
  const fail = (error: string | null) => {
    if (error) throw new Error(error);
  };

  return {
    approved,
    refunds,
    status: () => periodStatus(contribution, approved(), payments.filter((p) => p.status === "PENDING").length).status,
    /** What the member's pay form still allows. */
    cap: () => submissionCap(contribution, approved(), waiting()),
    send(amount: number) {
      fail(submissionAmountError(pesos(amount), submissionCap(contribution, approved(), waiting())));
      return payments.push({ amount: pesos(amount), effective: null, status: "PENDING" }) - 1;
    },
    withdraw(i: number) {
      payments[i].status = "CANCELLED";
    },
    approve(i: number) {
      if (payments.slice(0, i).some((p) => p.status === "PENDING")) throw new Error(EARLIER_FIRST);
      fail(contributionApprovalError("Ana", payments[i].amount, approved(), contribution));
      payments[i].status = "APPROVED";
      payments[i].effective = payments[i].amount;
    },
    report(i: number, amount: number) {
      const current = payments[i].effective ?? payments[i].amount;
      if (payments[i].status !== "APPROVED") throw new Error("Only approved contributions can be reported.");
      fail(disputeAmountError(pesos(amount), current, approved(), contribution, waiting()));
      return reports.push({ payment: i, previous: current, proposed: pesos(amount), status: "PENDING" }) - 1;
    },
    approveReport(r: number) {
      const report = reports[r];
      const payment = payments[report.payment];
      const current = payment.effective ?? payment.amount;
      fail(disputeAmountError(report.proposed, current, approved(), contribution, waiting(r)));
      payment.effective = report.proposed;
      report.status = "APPROVED";
      const refund = refundFor(current, report.proposed);
      if (refund > 0) refunds.push(refund);
    },
  };
}

type Round = ReturnType<typeof round>;

function orders<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

/**
 * R-DEC-29: decide everything `setup` leaves waiting, in every order the review order allows
 * (R-SUB-05). None may be refused, the approved total never passes the contribution on the way, and
 * it ends at `expected`.
 */
function everyOrder(setup: () => { r: Round; steps: ((r: Round) => void)[] }, expected: number) {
  let tried = 0;
  for (const order of orders(setup().steps.map((_, i) => i))) {
    const { r, steps } = setup();
    try {
      for (const i of order) {
        steps[i](r);
        expect(r.approved()).toBeLessThanOrEqual(pesos(2_000));
      }
    } catch (err) {
      if (err instanceof Error && err.message === EARLIER_FIRST) continue;
      throw err;
    }
    expect(r.approved()).toBe(pesos(expected));
    tried++;
  }
  expect(tried).toBeGreaterThan(0);
}

describe("the room rule (R-DEC-29)", () => {
  it("₱1,000 + ₱500 + ₱500: raising the ₱1,000 waits until the ₱500s are withdrawn or reviewed", () => {
    const r = round(pesos(2_000));
    const [first, a] = [r.send(1_000), r.send(500), r.send(500)];
    r.approve(first);
    expect(() => r.report(first, 1_500)).toThrow("₱1,000 is still waiting for review, so this can't go higher");
    // The tester meant the ₱500s to be part of the ₱1,500: withdraw one, then the correction fits.
    r.withdraw(a);
    expect(() => r.report(first, 1_500)).not.toThrow();
  });

  it("…and then everything waiting can be decided in any order", () => {
    everyOrder(() => {
      const r = round(pesos(2_000));
      const [first, a, b] = [r.send(1_000), r.send(500), r.send(500)];
      r.approve(first);
      r.withdraw(a);
      const report = r.report(first, 1_500);
      return { r, steps: [(x) => x.approveReport(report), (x) => x.approve(b)] };
    }, 2_000);
  });

  it("₱1,212 + ₱755 + ₱33: a correction to ₱1,794 fits once the ₱755 is withdrawn", () => {
    const r = round(pesos(2_000));
    const [first, big] = [r.send(1_212), r.send(755), r.send(33)];
    r.approve(first);
    expect(() => r.report(first, 1_794)).toThrow("₱788 is still waiting for review");
    r.withdraw(big);
    r.report(first, 1_794);
    // The pay form keeps the correction's ₱582 and the ₱33 aside.
    expect(r.cap()).toBe(pesos(173));
    expect(() => r.send(174)).toThrow("more than what's left");
  });

  it("caps an increase at what's left after what's waiting", () => {
    const r = round(pesos(2_000));
    const [first] = [r.send(1_000), r.send(300)];
    r.approve(first);
    expect(() => r.report(first, 1_701)).toThrow("the most it can be is ₱1,700");
    expect(() => r.report(first, 1_700)).not.toThrow();
  });

  it("a pending correction holds its increase: the pay form leaves room for it", () => {
    everyOrder(() => {
      const r = round(pesos(2_000));
      const first = r.send(1_000);
      r.approve(first);
      const report = r.report(first, 1_500);
      expect(r.cap()).toBe(pesos(500));
      expect(() => r.send(501)).toThrow("more than what's left");
      const later = r.send(500);
      return { r, steps: [(x) => x.approveReport(report), (x) => x.approve(later)] };
    }, 2_000);
  });

  it("two corrections and two stacked payments: every order fits", () => {
    everyOrder(() => {
      const r = round(pesos(2_000));
      const [p600, p400] = [r.send(600), r.send(400)];
      r.approve(p600);
      r.approve(p400);
      const up = r.report(p600, 900); // holds ₱300
      const alsoUp = r.report(p400, 700); // holds ₱300 more
      expect(r.cap()).toBe(pesos(400));
      const [x, y] = [r.send(250), r.send(150)];
      return {
        r,
        steps: [(z) => z.approveReport(up), (z) => z.approveReport(alsoUp), (z) => z.approve(x), (z) => z.approve(y)],
      };
    }, 2_000);
  });

  it("a decrease frees nothing until it's approved", () => {
    const r = round(pesos(2_000));
    const full = r.send(2_000);
    r.approve(full);
    const report = r.report(full, 1_500);
    expect(r.cap()).toBe(0);
    r.approveReport(report);
    expect(r.refunds).toEqual([pesos(500)]);
    expect(r.cap()).toBe(pesos(500));
    r.approve(r.send(500));
    expect(r.status()).toBe("PAID");
  });

  it("a decrease is never blocked by what's waiting", () => {
    const r = round(pesos(2_000));
    const [first] = [r.send(1_500), r.send(500)];
    r.approve(first);
    expect(() => r.report(first, 0)).not.toThrow();
  });

  it("stacked payments are still reviewed in the order they came in", () => {
    const r = round(pesos(2_000));
    const [first, second] = [r.send(1_000), r.send(1_000)];
    expect(() => r.approve(second)).toThrow(EARLIER_FIRST);
    r.approve(first);
    r.approve(second);
    expect(r.status()).toBe("PAID");
  });

  it("only an increase holds room", () => {
    expect(correctionIncrease(pesos(1_000), pesos(1_500))).toBe(pesos(500));
    expect(correctionIncrease(pesos(1_000), pesos(400))).toBe(0);
  });
});

describe("R-DEC-31 / R-DEC-33 paying ahead, and one payment across rounds", () => {
  const room = (round: number, pesosLeft: number) => ({ round, room: pesos(pesosLeft) });
  const upcoming = [room(3, 2_000), room(2, 2_000), room(4, 2_000), room(5, 2_000)];

  it("fills what's left of the open round first, then later rounds in order", () => {
    const rooms = contributionRooms({ open: room(1, 1_000), upcoming, debtLeft: 0 });
    expect(rooms.map((r) => r.round)).toEqual([1, 2, 3, 4, 5]);
    expect(splitContribution(pesos(7_000), rooms)).toEqual([
      { round: 1, amount: pesos(1_000) },
      { round: 2, amount: pesos(2_000) },
      { round: 3, amount: pesos(2_000) },
      { round: 4, amount: pesos(2_000) },
    ]);
  });

  it("the last round takes a partial amount", () => {
    const rooms = contributionRooms({ open: room(1, 0), upcoming, debtLeft: 0 });
    expect(splitContribution(pesos(3_000), rooms)).toEqual([
      { round: 2, amount: pesos(2_000) },
      { round: 3, amount: pesos(1_000) },
    ]);
  });

  it("skips rounds already covered", () => {
    const upcoming = [room(2, 0), room(3, 500)];
    const rooms = contributionRooms({ open: room(1, 0), upcoming, debtLeft: 0 });
    expect(rooms).toEqual([room(3, 500)]);
  });

  it("debt keeps a payment to the open round", () => {
    const rooms = contributionRooms({ open: room(2, 2_000), upcoming, debtLeft: pesos(1) });
    expect(rooms).toEqual([room(2, 2_000)]);
    expect(contributionAmountError(pesos(3_000), pesos(2_000), true)).toBe(
      "That's more than what's left to pay. Pay off the debt before paying ahead.",
    );
    expect(contributionAmountError(pesos(2_000), pesos(2_000), true)).toBeNull();
  });

  it("pays ahead into every remaining round, with no cap (R-DEC-36)", () => {
    const rooms = contributionRooms({ open: room(1, 0), upcoming, debtLeft: 0 });
    expect(rooms.map((r) => r.round)).toEqual([2, 3, 4, 5]);
  });

  it("labels a payment's rounds", () => {
    expect(roundsLabel([3])).toBe("round 3");
    expect(roundsLabel([4, 1, 2, 3])).toBe("rounds 1–4");
  });
});
