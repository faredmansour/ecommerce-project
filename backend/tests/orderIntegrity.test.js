const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const ordersRouter = require("../routers/ordersRouter");
const errorHandler = require("../middlewares/errorHandler");
const Category = require("../models/categoryModel");
const Coupon = require("../models/couponModel");
const Order = require("../models/orderModel");
const PriceBook = require("../models/priceBookModel");
const PriceDefinition = require("../models/priceDefinitionModel");
const Product = require("../models/productModel");
const User = require("../models/usermodel");

const app = express();
app.use(express.json());
app.use("/api/orders", ordersRouter);
app.use(errorHandler);

const shippingAddress = {
  fullName: "Order Integrity User",
  phone: "123456789",
  line1: "123 Main Street",
  city: "Cairo",
  country: "EG",
};

async function setupPricedProduct({ priceMinor = 2499, stock = 5, status = "active" } = {}) {
  const category = await Category.create({ name: "Integrity Test", description: "Order integrity tests" });
  const product = await Product.create({
    name: "Authoritative Product",
    description: "Product for order integrity tests",
    price: priceMinor / 100,
    category: category._id,
    stock,
    status,
    publicationState: "published",
  });
  const priceBook = await PriceBook.create({
    code: `INTEGRITY-${new mongoose.Types.ObjectId().toString()}`,
    name: "Order Integrity Test Book",
    currencyCodes: ["EGP"],
    isDefault: true,
  });
  await PriceDefinition.create({
    sellableType: "product",
    sellableId: product._id,
    priceBookId: priceBook._id,
    amountMinor: priceMinor,
    currency: "EGP",
    priceKind: "base",
    effectiveFrom: new Date(Date.now() - 60_000),
    changeReason: "Order integrity test fixture",
  });

  const user = await User.create({
    name: "Order Integrity User",
    email: `order-integrity-${new mongoose.Types.ObjectId()}@example.com`,
    password: "Passw0rd!",
    role: "user",
    emailVerified: true,
  });
  const token = jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
  return { product, token };
}

function orderPayload(product, overrides = {}) {
  return {
    items: [{
      product_id: product._id.toString(),
      name: "Client-supplied name",
      price: product.price,
      quantity: 2,
      image: "client-image.jpg",
      category: "Client category",
    }],
    shippingAddress,
    paymentMethod: "cod",
    totalAmount: product.price * 2,
    ...overrides,
  };
}

function createOrder(token, payload) {
  return request(app).post("/api/orders").set("Authorization", `Bearer ${token}`).send(payload);
}

describe("Order pricing and inventory integrity", () => {
  it("rejects anonymous order creation", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({
        items: [{ product_id: "507f1f77bcf86cd799439011", quantity: 1 }],
        shippingAddress,
        paymentMethod: "cod",
      });

    expect(res.status).toBe(401);
  });

  it("rejects a forged product price", async () => {
    const { product, token } = await setupPricedProduct();
    const res = await createOrder(token, orderPayload(product, {
      items: [{ ...orderPayload(product).items[0], price: 0.01 }],
    }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("PRICE_MISMATCH");
    expect(await Order.countDocuments()).toBe(0);
  });

  it("rejects a forged subtotal", async () => {
    const { product, token } = await setupPricedProduct();
    const res = await createOrder(token, orderPayload(product, { totalAmount: 0.02 }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("TOTAL_MISMATCH");
    expect(await Order.countDocuments()).toBe(0);
  });

  it("rejects client-supplied discount values", async () => {
    const { product, token } = await setupPricedProduct();
    const res = await createOrder(token, orderPayload(product, { discount: 0 }));

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("rejects invalid quantities", async () => {
    const { product, token } = await setupPricedProduct();
    const payload = orderPayload(product);
    payload.items[0].quantity = 0;
    payload.totalAmount = 0;
    const res = await createOrder(token, payload);

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("rejects quantities exceeding current stock", async () => {
    const { product, token } = await setupPricedProduct({ stock: 5 });
    const payload = orderPayload(product);
    payload.items[0].quantity = 6;
    payload.totalAmount = product.price * 6;
    const res = await createOrder(token, payload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_STOCK");
    expect(await Order.countDocuments()).toBe(0);
  });

  it("rejects deleted and unavailable products", async () => {
    const { product, token } = await setupPricedProduct({ status: "inactive" });
    const unavailable = await createOrder(token, orderPayload(product));
    expect(unavailable.status).toBe(422);
    expect(unavailable.body.code).toBe("SELLABLE_UNAVAILABLE");

    const missingProduct = { _id: new mongoose.Types.ObjectId(), price: product.price };
    const deleted = await createOrder(token, orderPayload(missingProduct));
    expect(deleted.status).toBe(422);
    expect(deleted.body.code).toBe("SELLABLE_UNAVAILABLE");
    expect(await Order.countDocuments()).toBe(0);
  });

  it("applies a valid percentage coupon to the server-calculated subtotal", async () => {
    const { product, token } = await setupPricedProduct();
    const coupon = await Coupon.create({
      code: "TENPERCENT",
      discountType: "percentage",
      discountValue: 10,
      minimumAmount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      active: true,
    });
    const res = await createOrder(token, orderPayload(product, { couponCode: coupon.code }));

    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBe(44.98);
    expect(res.body.data.discount).toBe(5);
    expect(res.body.data.commercialSnapshot).toMatchObject({
      subtotalMinor: 4998,
      discountMinor: 500,
      grandTotalMinor: 4498,
      currency: "EGP",
    });
  });

  it("applies a fixed coupon using its server-defined value", async () => {
    const { product, token } = await setupPricedProduct();
    const coupon = await Coupon.create({
      code: "FIXEDFIVE",
      discountType: "fixed",
      discountValue: 5,
      minimumAmount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      active: true,
    });
    const res = await createOrder(token, orderPayload(product, { couponCode: coupon.code }));

    expect(res.status).toBe(201);
    expect(res.body.data.discount).toBe(5);
    expect(res.body.data.totalAmount).toBe(44.98);
    expect(res.body.data.commercialSnapshot.grandTotalMinor).toBe(4498);
  });

  it("aggregates duplicate product lines before checking stock", async () => {
    const { product, token } = await setupPricedProduct({ stock: 3 });
    const firstLine = orderPayload(product).items[0];
    const res = await createOrder(token, orderPayload(product, {
      items: [
        { ...firstLine, quantity: 2 },
        { ...firstLine, quantity: 2 },
      ],
      totalAmount: product.price * 4,
    }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_STOCK");
    expect(await Order.countDocuments()).toBe(0);
  });

  it("creates an order using authoritative product data and pricing", async () => {
    const { product, token } = await setupPricedProduct();
    const res = await createOrder(token, orderPayload(product));

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.totalAmount).toBe(49.98);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      product_id: product._id.toString(),
      name: "Authoritative Product",
      price: 24.99,
      quantity: 2,
    });
    expect(res.body.data.commercialSnapshot).toMatchObject({
      subtotalMinor: 4998,
      discountMinor: 0,
      grandTotalMinor: 4998,
      currency: "EGP",
    });
  });
});
