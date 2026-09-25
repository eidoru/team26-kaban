import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyGroupChange, notifyGroupChangeSafe } from "./realtimeNotify.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifyGroupChange", () => {
  it("posts one HTTP broadcast to the group topic", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyGroupChange("g1", "contributions");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/realtime/v1/api/broadcast");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("service-key");
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ topic: "group:g1", event: "group_update", payload: { scope: "contributions" } }],
    });
  });

  it("does nothing when realtime isn't configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await notifyGroupChange("g1", "rounds");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("notifyGroupChangeSafe", () => {
  it("returns immediately and logs (never throws) when the broadcast fails", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => notifyGroupChangeSafe("g1", "memberships")).not.toThrow();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledOnce());
  });
});
