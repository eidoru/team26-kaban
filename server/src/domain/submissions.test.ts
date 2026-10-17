import { describe, expect, it } from "vitest";
import { pesos, type Centavos } from "./money.js";
import {
  contributionApprovalError,
  disputeAmountError,
  leftAfterPending,
  periodStatus,
  refundFor,
  submissionAmountError,
  submissionCap,
} from "./submissions.js";

/**
 * One member's contributions for one open round, run through the same rules the server applies in
 * services/submissions and services/disputes: the cap on sending (R-SUB-06), review in order
 * (R-SUB-05), the cap on approving (R-DEC-29), and problem reports that change an
 * approved amount (R-DSP-01/02/03). Each step throws the server's message where the server refuses.
 */
function round(contribution: Centavos) {
  type Payment = { amount: Centavos; effective: Centavos | null; status: "PENDING" | "APPROVED" | "DENIED" };
  type Report = { payment: number; proposed: Centavos; status: "PENDING" | "APPROVED" | "DENIED" };
  const payments: Payment[] = [];
  const reports: Report[] = [];
  const refunds: Centavos[] = [];
  const total = (status: Payment["status"]) =>
    payments.filter((p) => p.status === status).reduce((sum, p) => sum + (p.effective ?? p.amount), 0);
  const approved = () => total("APPROVED");
  const pending = () => total("PENDING");
  const fail = (error: string | null) => {
    if (error) throw new Error(error);
  };

  return {
    approved,
    pending,
    refunds,
    status: () => periodStatus(contribution, approved(), payments.filter((p) => p.status === "PENDING").length).status,
    /** What the member's pay form still allows. */
    cap: () => submissionCap(contribution, approved(), pending()),
    send(amount: number) {
      fail(submissionAmountError(pesos(amount), submissionCap(contribution, approved(), pending())));
      return payments.push({ amount: pesos(amount), effective: null, status: "PENDING" }) - 1;
    },
    approve(i: number) {
      if (payments.slice(0, i).some((p) => p.status === "PENDING")) throw new Error("Review the earlier one first.");
      fail(contributionApprovalError("Ana", payments[i].amount, approved(), contribution));
      payments[i].status = "APPROVED";
      payments[i].effective = payments[i].amount;
    },
    deny(i: number) {
      payments[i].status = "DENIED";
    },
    /** What the review sheet suggests for payment `i` that no longer fits: left now, and after the rest. */
    leftFor(i: number) {
      const left = Math.max(0, contribution - approved());
      const others = payments.filter((p, j) => j !== i && p.status === "PENDING").map((p) => p.amount);
      return { left, ...leftAfterPending(left, others) };
    },
    report(i: number, amount: number) {
      const current = payments[i].effective ?? payments[i].amount;
      if (payments[i].status !== "APPROVED") throw new Error("Only approved contributions can be reported.");
      fail(disputeAmountError(pesos(amount), current, approved(), contribution));
      return reports.push({ payment: i, proposed: pesos(amount), status: "PENDING" }) - 1;
    },
    /** Re-checked on approval: other approvals since it was raised may have used up the room. */
    approveReport(r: number) {
      const report = reports[r];
      const payment = payments[report.payment];
      const current = payment.effective ?? payment.amount;
      fail(disputeAmountError(report.proposed, current, approved(), contribution));
      payment.effective = report.proposed;
      report.status = "APPROVED";
      const refund = refundFor(current, report.proposed);
      if (refund > 0) refunds.push(refund);
    },
  };
}

describe("stacked payments with problem reports (R-DEC-29, R-DEC-30)", () => {
  it("₱1,000 + ₱500 + ₱500, the ₱1,000 corrected to ₱1,500: only one ₱500 still fits", () => {
    const r = round(pesos(2_000));
    const [first, a, b] = [r.send(1_000), r.send(500), r.send(500)];
    expect(r.cap()).toBe(0);
    r.approve(first);
    r.approveReport(r.report(first, 1_500));
    expect(r.approved()).toBe(pesos(1_500));
    r.approve(a);
    expect(r.status()).toBe("PAID");
    expect(() => r.approve(b)).toThrow("Ana has already paid in full this round");
    r.deny(b);
    expect(r.approved()).toBe(pesos(2_000));
    expect(r.refunds).toEqual([]);
  });

  it("₱1,212 + ₱755 + ₱33, the ₱1,212 corrected to ₱1,794: the ₱755 is refused and ₱173 is what to send", () => {
    const r = round(pesos(2_000));
    const [first, big, small] = [r.send(1_212), r.send(755), r.send(33)];
    r.approve(first);
    r.approveReport(r.report(first, 1_794));
    expect(() => r.approve(big)).toThrow("only ₱206 left");
    expect(r.leftFor(big)).toEqual({ left: pesos(206), waiting: [pesos(33)], sendable: pesos(173) });
    r.deny(big);
    r.approve(small);
    expect(r.approved()).toBe(pesos(1_827));
    // The suggested amount matches the pay form once the ₱33 is in.
    expect(r.cap()).toBe(pesos(173));
    r.approve(r.send(173));
    expect(r.status()).toBe("PAID");
  });

  it("several corrections, up and down, all count before the stacked payments are reviewed", () => {
    const r = round(pesos(2_000));
    const [p600, p400, p500, p300] = [r.send(600), r.send(400), r.send(500), r.send(300)];
    expect(r.cap()).toBe(pesos(200));
    r.approve(p600);
    r.approve(p400);
    r.approveReport(r.report(p600, 900)); // up ₱300: no refund
    r.approveReport(r.report(p400, 200)); // down ₱200: a refund (R-DSP-03)
    expect(r.approved()).toBe(pesos(1_100));
    expect(r.refunds).toEqual([pesos(200)]);
    r.approve(p500);
    r.approve(p300);
    expect(r.approved()).toBe(pesos(1_900));
    expect(r.cap()).toBe(pesos(100));
    expect(r.status()).toBe("PARTIAL");
  });

  it("corrections that fill the round leave every later payment to be denied", () => {
    const r = round(pesos(2_000));
    const [p1, p2, p3, p4] = [r.send(500), r.send(500), r.send(500), r.send(500)];
    r.approve(p1);
    r.approve(p2);
    r.approveReport(r.report(p1, 1_000));
    r.approveReport(r.report(p2, 1_000));
    expect(r.leftFor(p3)).toEqual({ left: 0, waiting: [], sendable: 0 });
    expect(() => r.approve(p3)).toThrow("already paid in full");
    r.deny(p3);
    expect(() => r.approve(p4)).toThrow("already paid in full");
    r.deny(p4);
    expect(r.approved()).toBe(pesos(2_000));
    expect(r.cap()).toBe(0);
  });

  it("a correction still waiting: approving the stacked payment first makes the correction too big", () => {
    const r = round(pesos(2_000));
    const [first, later] = [r.send(1_212), r.send(755)];
    r.approve(first);
    const report = r.report(first, 1_794); // fits while the ₱755 is only pending
    r.approve(later);
    expect(r.approved()).toBe(pesos(1_967));
    expect(() => r.approveReport(report)).toThrow("The most it can be is ₱1,245");
  });

  it("a correction still waiting: approving the correction first makes the stacked payment too big", () => {
    const r = round(pesos(2_000));
    const [first, later] = [r.send(1_212), r.send(755)];
    r.approve(first);
    r.approveReport(r.report(first, 1_794));
    expect(() => r.approve(later)).toThrow("only ₱206 left");
  });

  it("a correction raised while payments are pending is checked against approved amounts only", () => {
    // R-DEC-13 caps the approved total, so pending payments don't limit the report; approval does (above).
    const r = round(pesos(2_000));
    const [first] = [r.send(1_000), r.send(500), r.send(500)];
    r.approve(first);
    expect(() => r.report(first, 2_000)).not.toThrow();
    expect(() => r.report(first, 2_001)).toThrow("The most it can be is ₱2,000");
  });

  it("a correction down after the round filled opens room again", () => {
    const r = round(pesos(2_000));
    const [p1500, p500] = [r.send(1_500), r.send(500)];
    r.approve(p1500);
    r.approve(p500);
    expect(r.cap()).toBe(0);
    r.approveReport(r.report(p500, 0)); // the member asks for the ₱500 back
    expect(r.refunds).toEqual([pesos(500)]);
    expect(r.status()).toBe("PARTIAL");
    expect(r.cap()).toBe(pesos(500));
    r.approve(r.send(500));
    expect(r.status()).toBe("PAID");
  });

  it("stacked payments are still reviewed in the order they came in", () => {
    const r = round(pesos(2_000));
    const [first, second] = [r.send(1_000), r.send(1_000)];
    expect(() => r.approve(second)).toThrow("earlier one first");
    r.approve(first);
    r.approve(second);
    expect(r.status()).toBe("PAID");
  });
});

describe("what's left after the payments still waiting (R-DEC-29)", () => {
  it("counts each waiting payment that fits, in order", () => {
    expect(leftAfterPending(pesos(206), [pesos(33)])).toEqual({ waiting: [pesos(33)], sendable: pesos(173) });
    expect(leftAfterPending(pesos(206), [pesos(33), pesos(100)])).toEqual({
      waiting: [pesos(33), pesos(100)],
      sendable: pesos(73),
    });
  });

  it("skips one that doesn't fit; it will be refused on its own turn", () => {
    expect(leftAfterPending(pesos(206), [pesos(33), pesos(300), pesos(100)])).toEqual({
      waiting: [pesos(33), pesos(100)],
      sendable: pesos(73),
    });
  });

  it("says when the waiting payments cover what's left, or when nothing is left", () => {
    expect(leftAfterPending(pesos(206), [pesos(206)])).toEqual({ waiting: [pesos(206)], sendable: 0 });
    expect(leftAfterPending(pesos(206), [])).toEqual({ waiting: [], sendable: pesos(206) });
    expect(leftAfterPending(0, [pesos(33)])).toEqual({ waiting: [], sendable: 0 });
  });
});
