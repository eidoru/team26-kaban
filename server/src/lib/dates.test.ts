import { describe, expect, it } from "vitest";
import { formatDisplayDate } from "./dates.js";

const now = new Date(Date.UTC(2026, 8, 25));

describe("formatDisplayDate", () => {
  it("omits the year for dates in the current year", () => {
    expect(formatDisplayDate(new Date(Date.UTC(2026, 9, 9)), now)).toBe("Fri, Oct 9");
  });

  it("includes the year for other years", () => {
    expect(formatDisplayDate(new Date(Date.UTC(2027, 0, 1)), now)).toBe("Fri, Jan 1, 2027");
  });

  it("accepts ISO strings without shifting the day", () => {
    expect(formatDisplayDate("2026-10-09", now)).toBe("Fri, Oct 9");
    expect(formatDisplayDate("2026-10-09T00:00:00.000Z", now)).toBe("Fri, Oct 9");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatDisplayDate("soon", now)).toBe("soon");
  });
});
