import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emailField, optionalText, requiredText } from "./validation.js";

function firstError(schema: z.ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

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

