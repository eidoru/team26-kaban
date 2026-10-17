import { describe, expect, it } from "vitest";
import { roundHealth } from "./health.js";

const period = { expected: 10_000, periodStart: "2026-11-01", payoutDate: "2026-12-01" };

describe("roundHealth (§15.1, R-DEC-26)", () => {
  it("is on track while collection keeps pace with the calendar", () => {
    expect(roundHealth({ ...period, approved: 0, today: "2026-11-02" })).toBe("ON_TRACK");
    expect(roundHealth({ ...period, approved: 5_000, today: "2026-11-16" })).toBe("ON_TRACK");
  });

  it("is at risk when collection falls more than 10 points behind", () => {
    // Half the period gone (15 of 30 days), a third collected.
    expect(roundHealth({ ...period, approved: 3_300, today: "2026-11-16" })).toBe("AT_RISK");
  });

  it("is short inside the reminder window unless the pot is full", () => {
    expect(roundHealth({ ...period, approved: 9_000, today: "2026-11-28" })).toBe("SHORT");
    expect(roundHealth({ ...period, approved: 10_000, today: "2026-11-30" })).toBe("ON_TRACK");
  });
});
