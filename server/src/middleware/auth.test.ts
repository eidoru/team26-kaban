import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { optionalAuth } from "./auth.js";

function run(headers: Record<string, string>) {
  const req = { headers } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;
  return { req, next, done: optionalAuth(req, {} as Response, next) };
}

describe("optionalAuth", () => {
  it("continues as a guest with no Authorization header", async () => {
    const { req, next, done } = run({});
    await done;
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });

  it("continues as a guest when the token is invalid, never rejecting", async () => {
    const { req, next, done } = run({ authorization: "Bearer not-a-real-token" });
    await done;
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });
});
