const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../app");
const Category = require("../models/categoryModel");
const Product = require("../models/productModel");
const User = require("../models/usermodel");

async function adminToken() {
  const user = await User.create({
    name: "Pricing Admin",
    email: `pricing-admin-${Date.now()}@example.com`,
    password: await bcrypt.hash("Passw0rd!", 10),
    role: "admin",
  });

  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

describe("Pricing Engine Foundation", () => {
  it("creates a default price book and resolves a product quote from pricing data", async () => {
    const token = await adminToken();
    const category = await Category.create({ name: "Pricing Test", description: "Pricing category" });
    const product = await Product.create({
      name: "Price Resolution Product",
      description: "Product to resolve via pricing engine",
      price: 99.99,
      category: category._id,
      stock: 22,
    });

    const bookRes = await request(app)
      .post("/api/admin/pricing/price-books")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "DEFAULT",
        name: "Default Store Book",
        currencyCodes: ["EGP"],
        isDefault: true,
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.priceBook).toMatchObject({
      code: "DEFAULT",
      name: "Default Store Book",
      isDefault: true,
      status: "active",
    });

    const defRes = await request(app)
      .post("/api/admin/pricing/price-definitions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sellableType: "product",
        sellableId: product._id.toString(),
        priceBookId: bookRes.body.priceBook._id,
        amountMinor: 249900,
        currency: "EGP",
        priceKind: "base",
        effectiveFrom: new Date().toISOString(),
        changeReason: "Initial price",
      });

    expect(defRes.status).toBe(201);
    expect(defRes.body.priceDefinition).toMatchObject({
      amountMinor: 249900,
      currency: "EGP",
      priceKind: "base",
    });

    const quoteRes = await request(app).get(`/api/pricing/quotes/${product._id}`).query({ currency: "EGP" });

    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body).toHaveProperty("price");
    expect(quoteRes.body.price).toMatchObject({
      sellableId: product._id.toString(),
      amountMinor: 249900,
      currency: "EGP",
      priceKind: "base",
    });
  });

  it("rejects a valid ObjectId that does not exist as a Product sellable reference", async () => {
    const token = await adminToken();
    const missingProductId = new (require("mongoose").Types.ObjectId)().toString();
    const category = await Category.create({ name: "Missing Product Pricing", description: "Pricing validation category" });
    const categoryId = category._id;
    const bookRes = await request(app)
      .post("/api/admin/pricing/price-books")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "MISSING-SELLABLE",
        name: "Missing Sellable Book",
        currencyCodes: ["EGP"],
        isDefault: true,
      });

    expect(bookRes.status).toBe(201);

    const defRes = await request(app)
      .post("/api/admin/pricing/price-definitions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sellableType: "product",
        sellableId: missingProductId,
        priceBookId: bookRes.body.priceBook._id,
        amountMinor: 249900,
        currency: "EGP",
        priceKind: "base",
        effectiveFrom: new Date().toISOString(),
        changeReason: "Missing product should fail",
      });

    expect(defRes.status).toBe(404);
    expect(defRes.body).toMatchObject({
      status: "fail",
      code: "SELLABLE_NOT_FOUND",
    });

    const persisted = await require("../models/priceDefinitionModel").findOne({ sellableId: missingProductId });
    expect(persisted).toBeNull();
  });

  it("rejects malformed PriceBook admin IDs before Mongoose can cast them", async () => {
    const token = await adminToken();
    const res = await request(app)
      .patch("/api/admin/pricing/price-books/not-an-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Changed" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: "fail", message: "Invalid id" });
    expect(JSON.stringify(res.body)).not.toMatch(/Cast to ObjectId failed|Mongoose|stack|database/i);
  });

  it("rejects malformed PriceDefinition admin IDs before Mongoose can cast them", async () => {
    const token = await adminToken();
    const res = await request(app)
      .patch("/api/admin/pricing/price-definitions/not-an-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ changeReason: "bad id" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: "fail", message: "Invalid id" });
    expect(JSON.stringify(res.body)).not.toMatch(/Cast to ObjectId failed|Mongoose|stack|database/i);
  });

  it("returns a price-not-found error instead of falling back to Product.price", async () => {
    const token = await adminToken();
    const category = await Category.create({ name: "Legacy Pricing", description: "Legacy price category" });
    const product = await Product.create({
      name: "Legacy Product",
      description: "Should not resolve from Product.price",
      price: 123.45,
      category: category._id,
      stock: 7,
    });

    const bookRes = await request(app)
      .post("/api/admin/pricing/price-books")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "LEGACY",
        name: "Legacy Book",
        currencyCodes: ["EGP"],
        isDefault: true,
      });

    expect(bookRes.status).toBe(201);

    const res = await request(app).get(`/api/pricing/quotes/${product._id}`).query({ currency: "EGP" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: "fail",
      code: "PRICE_NOT_FOUND",
    });
  });
});
