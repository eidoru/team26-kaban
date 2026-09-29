import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MAX_CONTRIBUTION,
  earliestStartDate,
  emailField,
  isPastStartDate,
  optionalText,
  pesoAmount,
  requiredText,
  startDateField,
} from "./validation.js";

function firstError(schema: z.ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

describe("pesoAmount", () => {
  const amount = pesoAmount(MAX_CONTRIBUTION);

  it("accepts whole and centavo amounts up to the cap", () => {
    expect(firstError(amount, 1)).toBeNull();
    expect(firstError(amount, 1234.5)).toBeNull();
    expect(firstError(amount, 0.01)).toBeNull();
    expect(firstError(amount, 19.99)).toBeNull();
    expect(firstError(amount, MAX_CONTRIBUTION)).toBeNull();
  });

  it("rejects zero, negatives, amounts over the cap and sub-centavo precision", () => {
    expect(firstError(amount, 0)).toBe("Amount must be greater than zero");
    expect(firstError(amount, -5)).toBe("Amount must be greater than zero");
    expect(firstError(amount, MAX_CONTRIBUTION + 0.01)).toBe("Amount can't be more than ₱1,000,000");
    expect(firstError(amount, 10.555)).toBe("Amount can have at most 2 decimal places");
  });
});

describe("text fields", () => {
  it("trims and rejects blank required text", () => {
    const name = requiredText("Group name", 100);
    expect(name.parse("  Office savings  ")).toBe("Office savings");
    expect(firstError(name, "   ")).toBe("Group name is required");
    expect(firstError(name, "x".repeat(101))).toBe("Group name must be 100 characters or fewer");
  });

  it("allows empty optional text but still caps its length", () => {
    const note = optionalText("Note", 500);
    expect(note.parse("  ")).toBe("");
    expect(firstError(note, "x".repeat(501))).toBe("Note must be 500 characters or fewer");
  });

  it("trims emails before checking them", () => {
    expect(emailField.parse(" ana@example.com ")).toBe("ana@example.com");
    expect(firstError(emailField, "ana@")).toBe("Enter a valid email address");
  });
});

describe("start dates", () => {
  it("treats a date as past only once it has passed in every time zone (UTC−12)", () => {
    const now = new Date("2026-09-29T03:00:00Z");
    expect(earliestStartDate(now)).toBe("2026-09-28");
    expect(isPastStartDate("2026-09-28", now)).toBe(false);
    expect(isPastStartDate("2026-09-27", now)).toBe(true);
    expect(isPastStartDate(new Date("2026-09-27T00:00:00Z"), now)).toBe(true);
  });

  it("rejects past and malformed start dates", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(firstError(startDateField, today)).toBeNull();
    expect(firstError(startDateField, "2020-01-01")).toBe("Start date can't be in the past");
    expect(firstError(startDateField, "next week")).toBe("Enter a valid date");
  });
});
