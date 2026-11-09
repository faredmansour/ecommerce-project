const request = require("supertest");
const app = require("../app");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/usermodel");
const Order = require("../models/orderModel");
const Category = require("../models/categoryModel");
const Product = require("../models/productModel");
const PriceBook = require("../models/priceBookModel");
const PriceDefinition = require("../models/priceDefinitionModel");

async function registerUser(overrides = {}) {
  const payload = {
    name: "Order User",
    email: `order-${Date.now()}@example.com`,
    password: "Passw0rd!",
    ...overrides,
  };

  const res = await request(app).post("/api/auth/register").send(payload);
  await User.updateOne({ email: payload.email }, { emailVerified: true });
  const login = await request(app).post("/api/auth/login").send({ email: payload.email, password: payload.password });
  return {
    token: login.body.data.accessToken,
    user: await User.findOne({ email: payload.email }),
  };
}

async function adminToken() {
  const user = await User.create({
    name: "Admin User",
    email: `admin-${Date.now()}@example.com`,
    password: await bcrypt.hash("Passw0rd!", 10),
    role: "admin",
  });
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

async function createPricedProduct(name, amountMinor) {
  const category = await Category.create({
    name: `Order Test ${Date.now()} ${Math.random()}`,
    description: "Order test category",
  });
  const product = await Product.create({
    name,
    description: "Product fixture for order tests",
    price: amountMinor / 100,
    category: category._id,
    stock: 10,
  });
  const priceBook = await PriceBook.create({
    code: `ORDER-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "Order Test Price Book",
    currencyCodes: ["EGP"],
    isDefault: true,
  });
  await PriceDefinition.create({
    sellableType: "product",
    sellableId: product._id,
    priceBookId: priceBook._id,
    amountMinor,
    currency: "EGP",
    priceKind: "base",
    effectiveFrom: new Date(Date.now() - 60_000),
    changeReason: "Order test fixture",
  });
  return product;
}

describe("Orders and admin summary", () => {
  it("creates an order for the authenticated user and keeps it pending", async () => {
    const { token } = await registerUser();
    const product = await createPricedProduct("Sample Product", 2499);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          {
            product_id: product._id.toString(),
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
          postalCode: "12345",
          country: "EG",
        },
        paymentMethod: "cod",
        totalAmount: 49.98,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.user).toBeDefined();
  });

  it("creates card checkout orders as pending_payment and makes them eligible for Payment creation", async () => {
    const { token } = await registerUser();
    const product = await createPricedProduct("Card Checkout Product", 2599);
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{
          product_id: product._id.toString(),
          name: "Card Checkout Product",
          price: 25.99,
          quantity: 1,
          image: "",
          category: "General",
        }],
        shippingAddress: {
          fullName: "Order User",
          phone: "123456789",
          line1: "123 Main Street",
          city: "Cairo",
          postalCode: "12345",
          country: "EG",
        },
        paymentMethod: "card",
        totalAmount: 25.99,
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.status).toBe("pending_payment");
    expect(orderRes.body.data).not.toHaveProperty("activePaymentId");

    const paymentRes = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "order-checkout-payment-01")
      .send({ orderId: orderRes.body.data._id });

    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.data).toMatchObject({
      orderId: orderRes.body.data._id,
      amountMinor: 2599,
      currency: "EGP",
      status: "created",
    });
  });

  it("prevents admins from placing orders", async () => {
    const admin = await adminToken();

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        items: [
          {
            product_id: "507f1f77bcf86cd799439012",
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
          postalCode: "12345",
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
    const product = await createPricedProduct("Another Product", 1000);

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        items: [
          {
            product_id: product._id.toString(),
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
          postalCode: "12345",
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

  it("prevents fulfillment before payment capture and prevents paid-order downgrade", async () => {
    const { token } = await registerUser();
    const admin = await adminToken();
    const product = await createPricedProduct("Fulfillment Guard Product", 1000);
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ product_id: product._id.toString(), name: product.name, price: 10, quantity: 1 }],
        shippingAddress: {
          fullName: "Order User",
          phone: "123456789",
          line1: "123 Main Street",
          city: "Cairo",
          country: "EG",
        },
        paymentMethod: "card",
        totalAmount: 10,
      });
    expect(orderRes.status).toBe(201);

    const premature = await request(app)
      .patch(`/api/orders/${orderRes.body.data._id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "shipped" });
    expect(premature.status).toBe(409);

    await Order.updateOne({ _id: orderRes.body.data._id }, { $set: { status: "paid" } });
    const downgraded = await request(app)
      .patch(`/api/orders/${orderRes.body.data._id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "pending" });
    expect(downgraded.status).toBe(409);

    const shipped = await request(app)
      .patch(`/api/orders/${orderRes.body.data._id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "shipped" });
    expect(shipped.status).toBe(200);
    expect(shipped.body.data.status).toBe("shipped");

    const delivered = await request(app)
      .patch(`/api/orders/${orderRes.body.data._id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "delivered" });
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.status).toBe("delivered");
  });

  it("restricts order details to the owner while allowing admin access", async () => {
    const owner = await registerUser({ email: `owner-${Date.now()}@example.com` });
    const otherCustomer = await registerUser({ email: `other-${Date.now()}@example.com` });
    const order = await Order.create({
      user: owner.user.id,
      items: [{ product_id: "507f1f77bcf86cd799439011", name: "Snapshot product", price: 25, quantity: 1 }],
      shippingAddress: {
        fullName: "Order User",
        phone: "123456789",
        line1: "123 Main Street",
        city: "Cairo",
        postalCode: "12345",
        country: "EG",
      },
      paymentMethod: "cod",
      totalAmount: 25,
    });

    const ownOrder = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownOrder.status).toBe(200);

    const foreignOrder = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${otherCustomer.token}`);
    expect(foreignOrder.status).toBe(403);

    const adminOrder = await request(app)
      .get(`/api/orders/${order._id}`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(adminOrder.status).toBe(200);
  });

  it("requires authentication for customer order data", async () => {
    const list = await request(app).get("/api/orders");
    const order = await request(app).get("/api/orders/507f1f77bcf86cd799439011");
    expect(list.status).toBe(401);
    expect(order.status).toBe(401);
  });
});
