import { describe, expect, it } from "vitest";
import { pesos } from "./money.js";
import { launchBlockers, settingChanges, setupErrors, toSettings, type SetupInput } from "./setup.js";

const TODAY = "2026-10-16";

const valid: SetupInput = {
  name: "Barkada",
  slotCount: 5,
  amountMode: "CONTRIBUTION",
  amount: pesos(2_000),
  frequency: "MONTHLY",
  startDate: "2026-10-23",
  interestPercent: 1.25,
};

describe("setupErrors (§4.1)", () => {
  it("accepts a valid setup", () => {
    expect(setupErrors(valid, TODAY)).toEqual({});
  });

  it("requires a start date at least 7 days out (R-SET-05)", () => {
    expect(setupErrors({ ...valid, startDate: "2026-10-22" }, TODAY).startDate).toMatch(/7 days/);
    expect(setupErrors({ ...valid, startDate: "2026-10-23" }, TODAY).startDate).toBeUndefined();
  });

  it("requires a name and at least 2 slots (R-SET-01, R-SET-02)", () => {
    expect(setupErrors({ ...valid, name: "   " }, TODAY).name).toBeDefined();
    expect(setupErrors({ ...valid, slotCount: 1 }, TODAY).slotCount).toBeDefined();
    expect(setupErrors({ ...valid, slotCount: 2.5 }, TODAY).slotCount).toBeDefined();
  });

  it("keeps contributions to whole pesos, but lets a pot have centavos (R-AMT-03)", () => {
    expect(setupErrors({ ...valid, amount: pesos(2_000.5) }, TODAY).amount).toMatch(/whole pesos/);
    expect(setupErrors({ ...valid, amountMode: "POT", amount: pesos(10_000.5) }, TODAY).amount).toBeUndefined();
    expect(setupErrors({ ...valid, amount: 0 }, TODAY).amount).toBeDefined();
  });

  it("caps the organizing fee at 10% with at most 2 decimals; zero or blank means none (R-SET-08, R-DEC-39)", () => {
    expect(setupErrors({ ...valid, organizerFeePercent: 10 }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, organizerFeePercent: 2.25 }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, organizerFeePercent: 10.01 }, TODAY).organizerFeePercent).toBe(
      "The fee can be at most 10%.",
    );
    expect(setupErrors({ ...valid, organizerFeePercent: 1.255 }, TODAY).organizerFeePercent).toBeDefined();
    expect(setupErrors({ ...valid, organizerFeePercent: -1 }, TODAY).organizerFeePercent).toBeDefined();
    expect(setupErrors({ ...valid, organizerFeePercent: 0 }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, organizerFeePercent: null }, TODAY)).toEqual({});
  });

  it("needs an interval of at least 7 days for a custom frequency (R-FRQ-05)", () => {
    expect(setupErrors({ ...valid, frequency: "CUSTOM", intervalDays: 6 }, TODAY).intervalDays).toBeDefined();
    expect(setupErrors({ ...valid, frequency: "CUSTOM" }, TODAY).intervalDays).toBeDefined();
    expect(setupErrors({ ...valid, frequency: "CUSTOM", intervalDays: 7 }, TODAY)).toEqual({});
  });

  it("checks interest decimals; zero or blank means none (R-SET-06)", () => {
    expect(setupErrors({ ...valid, interestPercent: 1.255 }, TODAY).interestPercent).toBeDefined();
    expect(setupErrors({ ...valid, interestPercent: -1 }, TODAY).interestPercent).toBeDefined();
    expect(setupErrors({ ...valid, interestPercent: 0 }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, interestPercent: null }, TODAY)).toEqual({});
  });

  it("caps names at 250 characters and slots at 30 (R-SET-01, R-SET-02, R-DEC-35)", () => {
    expect(setupErrors({ ...valid, name: "a".repeat(250) }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, name: "a".repeat(251) }, TODAY).name).toBe("Names can be up to 250 characters.");
    expect(setupErrors({ ...valid, slotCount: 30 }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, slotCount: 31 }, TODAY).slotCount).toBe("A paluwagan can have up to 30 slots.");
  });

  it("caps interest at 100% per period (R-SET-06, R-DEC-34)", () => {
    expect(setupErrors({ ...valid, interestPercent: 100 }, TODAY)).toEqual({});
    expect(setupErrors({ ...valid, interestPercent: 100.01 }, TODAY).interestPercent).toBe("Interest can be at most 100%.");
    expect(setupErrors({ ...valid, interestPercent: 999_999.99 }, TODAY).interestPercent).toBeDefined();
  });

  it("won't shrink below the occupied slots on edit (R-LOB-10)", () => {
    expect(setupErrors({ ...valid, slotCount: 3 }, TODAY, 4).slotCount).toMatch(/4 slots are already taken/);
    expect(setupErrors({ ...valid, slotCount: 4 }, TODAY, 4).slotCount).toBeUndefined();
  });
});

describe("toSettings", () => {
  it("derives amounts and stores the rate in basis points", () => {
    expect(toSettings({ ...valid, amountMode: "POT", amount: pesos(10_000), slotCount: 3 })).toMatchObject({
      contribution: pesos(3_334),
      pot: pesos(10_002),
      enteredPot: pesos(10_000),
      interestRate: 125,
      organizerFeeRate: 0,
      intervalDays: null,
    });
  });
});

describe("settingChanges (R-LOB-09)", () => {
  it("lists before and after values for what changed only", () => {
    const before = toSettings(valid);
    const after = toSettings({ ...valid, slotCount: 6, interestPercent: null });
    expect(settingChanges(before, after)).toEqual([
      { field: "slotCount", label: "Slots", before: "5", after: "6" },
      { field: "pot", label: "Pot", before: "₱10,000", after: "₱12,000" },
      { field: "interestRate", label: "Shortfall interest", before: "1.25% per period", after: "None" },
    ]);
    expect(settingChanges(before, toSettings(valid))).toEqual([]);
    expect(settingChanges(before, toSettings({ ...valid, organizerFeePercent: 2 }))).toEqual([
      { field: "organizerFeeRate", label: "Organizing fee", before: "None", after: "2% of each payment" },
    ]);
  });
});

describe("launchBlockers (R-LCH-02)", () => {
  const ready = { slotCount: 5, occupied: 5, ordered: true, startDate: "2026-11-01", today: TODAY };

  it("is empty when the group can launch", () => {
    expect(launchBlockers(ready)).toEqual([]);
  });

  it("asks to fill slots before setting the order (R-DEC-27: no separate lock)", () => {
    expect(launchBlockers({ ...ready, occupied: 3, ordered: false })).toEqual(["Fill the 2 open slots."]);
    expect(launchBlockers({ ...ready, ordered: false })).toEqual(["Set the payout order."]);
  });

  it("flags a start date that has become too soon", () => {
    expect(launchBlockers({ ...ready, today: "2026-10-30" })).toHaveLength(1);
  });
});
