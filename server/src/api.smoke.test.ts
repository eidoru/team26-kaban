import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./app.js";

describe("API smoke", () => {
  it("GET /api/v1/health returns ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", service: "kaban-api" });
  });

  it("GET /api/v1/groups requires authentication", async () => {
    const res = await request(app).get("/api/v1/groups");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/groups/:id requires authentication", async () => {
    const res = await request(app).delete("/api/v1/groups/00000000-0000-0000-0000-000000000001");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/notifications requires authentication", async () => {
    const res = await request(app).get("/api/v1/notifications");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/groups requires authentication", async () => {
    const res = await request(app).post("/api/v1/groups").send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/invites/:token/join requires authentication", async () => {
    const res = await request(app).post("/api/v1/invites/some-token/join");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/claims/:token/claim requires authentication", async () => {
    const res = await request(app).post("/api/v1/claims/some-token/claim");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/auth/realtime-token requires authentication", async () => {
    const res = await request(app).get("/api/v1/auth/realtime-token");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/register rejects invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "password1", displayName: "Test" });
    expect(res.status).toBe(400);
  });

  it("POST /api/v1/auth/register rejects short password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "user@example.com", password: "short", displayName: "Test" });
    expect(res.status).toBe(400);
  });
});

describe("Cron security", () => {
  it("rejects activate-groups without cron secret", async () => {
    const res = await request(app).get("/api/v1/cron/activate-groups");
    expect(res.status).toBe(403);
  });

  it("rejects activate-groups with the wrong secret", async () => {
    const res = await request(app)
      .get("/api/v1/cron/activate-groups")
      .set("Authorization", "Bearer wrong-secret");
    expect(res.status).toBe(403);
  });
});

describe("Demo tools environment gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const path = "/api/v1/dev/groups/00000000-0000-0000-0000-000000000001/activate-now";

  it("is reachable on Vercel production when ALLOW_DEMO_TOOLS=true", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_DEMO_TOOLS", "true");
    // Past the environment gate; the auth check is what rejects this anonymous request.
    expect((await request(app).post(path)).status).toBe(401);
  });

  it("returns 404 on Vercel production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await request(app).post(path)).status).toBe(404);
  });
});
