const request = require("supertest");
const app = require("../app");

describe("Preview-only backend restrictions", () => {
  const originalPreviewMode = process.env.PREVIEW_MODE;

  beforeEach(() => {
    process.env.PREVIEW_MODE = "true";
  });

  afterAll(() => {
    if (originalPreviewMode === undefined) delete process.env.PREVIEW_MODE;
    else process.env.PREVIEW_MODE = originalPreviewMode;
  });

  it("blocks order creation and mutations before reaching order handlers", async () => {
    const response = await request(app).post("/api/orders").send({});
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("PREVIEW_FEATURE_DISABLED");

    const updateResponse = await request(app).patch("/api/orders/not-a-real-order/status").send({});
    expect(updateResponse.status).toBe(503);
    expect(updateResponse.body.code).toBe("PREVIEW_FEATURE_DISABLED");
  });

  it("keeps authenticated read-only order history routes available", async () => {
    const response = await request(app).get("/api/orders");
    expect(response.status).toBe(401);
    expect(response.body.code).not.toBe("PREVIEW_FEATURE_DISABLED");
  });

  it.each([
    ["POST", "/api/payments"],
    ["POST", "/api/payments/intent"],
    ["GET", "/api/payments/invalid-id"],
    ["POST", "/api/payments/webhooks/paymob"],
  ])("blocks %s %s", async (method, path) => {
    const response = await request(app)[method.toLowerCase()](path).send({});
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("PREVIEW_FEATURE_DISABLED");
  });

  it.each([
    ["POST", "/api/auth/google/start"],
    ["GET", "/api/auth/google/callback"],
    ["POST", "/api/auth/google/exchange"],
    ["POST", "/api/auth/google/link/start"],
    ["POST", "/api/auth/apple/start"],
    ["GET", "/api/auth/apple/callback"],
    ["POST", "/api/auth/apple/exchange"],
    ["POST", "/api/auth/apple/link/start"],
  ])("blocks %s %s", async (method, path) => {
    const response = await request(app)[method.toLowerCase()](path).send({});
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("PREVIEW_FEATURE_DISABLED");
  });
});
