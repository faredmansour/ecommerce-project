const request = require("supertest");
const app = require("../app");
const { webhookService } = require("../controllers/paymentWebhookController");

describe("GET /health", () => {
  it("reports degraded while the worker has not started", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body.paymentWebhookWorker).toMatchObject({
      state: "not_started",
      recoveryActive: false,
      activeEventCount: 0,
    });
  });

  it("reports recovery degradation without exposing internal error details", async () => {
    const statusSpy = jest.spyOn(webhookService.queue, "getStatus").mockReturnValue({
      state: "recovery_degraded",
      recoveryActive: false,
      activeEventCount: 0,
      lastRecoveryAt: "2026-11-05T00:00:00.000Z",
      lastRecoveryErrorCode: "WEBHOOK_WORKER_RECOVERY_FAILED",
    });
    try {
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("degraded");
      expect(res.body.paymentWebhookWorker).toMatchObject({
        state: "recovery_degraded",
        lastRecoveryErrorCode: "WEBHOOK_WORKER_RECOVERY_FAILED",
      });
      expect(JSON.stringify(res.body)).not.toContain("message");
    } finally {
      statusSpy.mockRestore();
    }
  });
});

describe("GET /api/docs.json", () => {
  it("serves the OpenAPI spec", async () => {
    const res = await request(app).get("/api/docs.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.info.title).toMatch(/Alfredo/i);
  });
});
