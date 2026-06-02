import { describe, expect, it } from "vitest";
import { addFrequencyInterval, startOfUtcDay } from "./schedule.js";

describe("addFrequencyInterval", () => {
  const base = new Date(Date.UTC(2026, 0, 15)); // 2026-01-15 UTC

  it("adds weekly intervals", () => {
    const result = addFrequencyInterval(base, "weekly", 2);
    expect(result.toISOString().slice(0, 10)).toBe("2026-01-29");
  });

  it("adds biweekly intervals", () => {
    const result = addFrequencyInterval(base, "biweekly", 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-01-29");
  });

  it("adds monthly intervals", () => {
    const result = addFrequencyInterval(base, "monthly", 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("adds custom day intervals", () => {
    const result = addFrequencyInterval(base, "custom", 3, 10);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-14");
  });

  it("returns same date for zero steps", () => {
    const result = addFrequencyInterval(base, "weekly", 0);
    expect(result.toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

describe("startOfUtcDay", () => {
  it("strips time component in UTC", () => {
    const input = new Date("2026-06-02T15:30:45.123Z");
    const result = startOfUtcDay(input);
    expect(result.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});
