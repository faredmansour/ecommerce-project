const request = require("supertest");
const app = require("../app");

async function registerUser(overrides = {}) {
  const payload = {
    name: "Order User",
    email: `order-${Date.now()}@example.com`,
    password: "Passw0rd!",
    ...overrides,
  };

  const res = await request(app).post("/api/auth/register").send(payload);
  return {
    token: res.body.data.accessToken,
    user: res.body.data.user,
  };
}

async function adminToken() {
  const user = await registerUser({ name: "Admin User", email: `admin-${Date.now()}@example.com`, role: "admin" });
  return user.token;
}

describe("Orders and admin summary", () => {
  it("creates an order for the authenticated user and keeps it pending", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          {
            product_id: "prod_1",
            name: "Sample Product",
            price: 24.99,
            quantity: 2,
            image: "",
            category: "General",
          },
        ],
        shippingAddress: {
          fullName: "Order User",
          phone: "123456789",
          line1: "123 Main Street",
          city: "Cairo",
          country: "EG",
        },
        paymentMethod: "cod",
        totalAmount: 49.98,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.user).toBeDefined();
  });

  it("prevents admins from placing orders", async () => {
    const admin = await adminToken();

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        items: [
          {
            product_id: "prod_admin",
            name: "Admin Order Attempt",
            price: 19.99,
            quantity: 1,
            image: "",
            category: "General",
          },
        ],
        shippingAddress: {
          fullName: "Admin User",
          phone: "123456789",
          line1: "123 Main Street",
          city: "Cairo",
          country: "EG",
        },
        paymentMethod: "cod",
        totalAmount: 19.99,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
  });

  it("lets admins update order status and exposes richer summary metrics", async () => {
    const user = await registerUser();
    const admin = await adminToken();

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        items: [
          {
            product_id: "prod_2",
            name: "Another Product",
            price: 10,
            quantity: 1,
            image: "",
            category: "General",
          },
        ],
        shippingAddress: {
          fullName: "Order User",
          phone: "123456789",
          line1: "123 Main Street",
          city: "Cairo",
          country: "EG",
        },
        paymentMethod: "cod",
        totalAmount: 10,
      });

    const updateRes = await request(app)
      .patch(`/api/orders/${orderRes.body.data._id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "shipped" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.status).toBe("shipped");

    const summaryRes = await request(app)
      .get("/api/admin/summary")
      .set("Authorization", `Bearer ${admin}`);

    const analyticsRes = await request(app)
      .get("/api/admin/analytics")
      .set("Authorization", `Bearer ${admin}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.totals.pendingOrders).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(summaryRes.body.data.lowStockProducts)).toBe(true);

    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.data.overview).toBeDefined();
    expect(Array.isArray(analyticsRes.body.data.topProducts)).toBe(true);
    expect(Array.isArray(analyticsRes.body.data.reports.daily)).toBe(true);
    expect(Array.isArray(analyticsRes.body.data.reports.monthly)).toBe(true);
    expect(Array.isArray(analyticsRes.body.data.reports.yearly)).toBe(true);
  });
});
