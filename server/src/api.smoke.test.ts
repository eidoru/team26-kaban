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

  it("GET /api/v1/home/overview requires authentication", async () => {
    const res = await request(app).get("/api/v1/home/overview");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/auth/me/activity requires authentication", async () => {
    const res = await request(app).get("/api/v1/auth/me/activity");
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
  it("rejects close-rounds without cron secret", async () => {
    const res = await request(app).get("/api/v1/cron/close-rounds");
    expect(res.status).toBe(403);
  });

  it("rejects close-rounds with wrong secret", async () => {
    const res = await request(app)
      .get("/api/v1/cron/close-rounds")
      .set("Authorization", "Bearer wrong-secret");
    expect(res.status).toBe(403);
  });

  it("rejects send-reminders without cron secret", async () => {
    const res = await request(app).get("/api/v1/cron/send-reminders");
    expect(res.status).toBe(403);
  });

  it("rejects cron advance-round without cron secret", async () => {
    const res = await request(app).post(
      "/api/v1/cron/groups/00000000-0000-0000-0000-000000000001/advance-round",
    );
    expect(res.status).toBe(403);
  });
});

describe("Cron advance-round environment gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 on Vercel production", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("VERCEL_ENV", "production");

    const res = await request(app)
      .post("/api/v1/cron/groups/00000000-0000-0000-0000-000000000001/advance-round")
      .set("Authorization", "Bearer test-cron-secret");

    expect(res.status).toBe(404);
  });
});
