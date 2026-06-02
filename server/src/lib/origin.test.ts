import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAppOrigin, resolveCorsOrigin } from "./origin.js";

function mockRequest(headers: Record<string, string | undefined>): Request {
  return {
    get(name: string) {
      return headers[name.toLowerCase()] ?? headers[name];
    },
  } as Request;
}

describe("resolveAppOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses CLIENT_ORIGIN in local development", () => {
    vi.stubEnv("CLIENT_ORIGIN", "http://localhost:5173");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");

    expect(resolveAppOrigin()).toBe("http://localhost:5173");
  });

  it("ignores localhost CLIENT_ORIGIN on Vercel and uses the request host", () => {
    vi.stubEnv("CLIENT_ORIGIN", "http://localhost:5173");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NODE_ENV", "production");

    const req = mockRequest({
      "x-forwarded-host": "kaban.example.vercel.app",
      "x-forwarded-proto": "https",
    });

    expect(resolveAppOrigin(req)).toBe("https://kaban.example.vercel.app");
  });

  it("uses explicit production CLIENT_ORIGIN on Vercel", () => {
    vi.stubEnv("CLIENT_ORIGIN", "https://kaban.app");
    vi.stubEnv("VERCEL", "1");

    expect(resolveAppOrigin()).toBe("https://kaban.app");
  });

  it("falls back to VERCEL_URL when no request is available", () => {
    vi.stubEnv("CLIENT_ORIGIN", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "team26-kaban.vercel.app");

    expect(resolveAppOrigin()).toBe("https://team26-kaban.vercel.app");
  });
});

describe("resolveCorsOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses CLIENT_ORIGIN in local development", () => {
    vi.stubEnv("CLIENT_ORIGIN", "http://localhost:5173");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveCorsOrigin()).toBe("http://localhost:5173");
  });

  it("ignores localhost CLIENT_ORIGIN on Vercel", () => {
    vi.stubEnv("CLIENT_ORIGIN", "http://localhost:5173");
    vi.stubEnv("VERCEL", "1");

    expect(resolveCorsOrigin()).toBe(true);
  });
});
