const request = require("supertest");
const app = require("../app");
const Category = require("../models/categoryModel");
const Product = require("../models/productModel");

async function userToken() {
  const res = await request(app).post("/api/auth/register").send({
    name: "Cart User",
    email: "cart@example.com",
    password: "Passw0rd!",
  });
  const User = require("../models/usermodel");
  await User.updateOne({ email: "cart@example.com" }, { emailVerified: true });
  const login = await request(app).post("/api/auth/login").send({ email: "cart@example.com", password: "Passw0rd!" });
  return login.body.data.accessToken;
}

async function availableProduct(stock = 5) {
  const category = await Category.create({ name: "Cart Test", description: "Cart test products" });
  return Product.create({
    name: "Cart Test Product",
    description: "Product for cart tests",
    price: 29.99,
    category: category._id,
    stock,
    status: "active",
    publicationState: "published",
  });
}

const authorized = (req, token) => req.set("Authorization", `Bearer ${token}`);

describe("Cart", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/cart");
    expect(res.status).toBe(401);
  });

  it("adds a valid item to the cart", async () => {
    const token = await userToken();
    const product = await availableProduct();
    const res = await authorized(request(app).post("/api/cart"), token)
      .send({ product_id: product._id.toString(), name: product.name, price: product.price, quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data[0].quantity).toBe(2);
  });

  it("rejects an invalid cart item (400)", async () => {
    const token = await userToken();
    const res = await authorized(request(app).post("/api/cart"), token)
      .send({ name: "Missing product_id and price" });
    expect(res.status).toBe(400);
  });

  it("returns the cart contents", async () => {
    const token = await userToken();
    const product = await availableProduct();
    await authorized(request(app).post("/api/cart"), token)
      .send({ product_id: product._id.toString(), name: product.name, price: product.price });
    const res = await authorized(request(app).get("/api/cart"), token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it("rejects quantities exceeding current product stock on add and update", async () => {
    const token = await userToken();
    const product = await availableProduct(2);
    const add = await authorized(request(app).post("/api/cart"), token)
      .send({ product_id: product._id.toString(), name: product.name, price: product.price, quantity: 3 });
    expect(add.status).toBe(409);

    const added = await authorized(request(app).post("/api/cart"), token)
      .send({ product_id: product._id.toString(), name: product.name, price: product.price, quantity: 2 });
    expect(added.status).toBe(200);

    const duplicateAdd = await authorized(request(app).post("/api/cart"), token)
      .send({ product_id: product._id.toString(), name: product.name, price: product.price, quantity: 1 });
    expect(duplicateAdd.status).toBe(409);

    const update = await authorized(request(app).patch(`/api/cart/${added.body.data[0]._id}`), token)
      .send({ quantity: 3 });
    expect(update.status).toBe(409);
    expect(update.body.message).toMatch(/Only 2 available/);
  });

  it("rejects unavailable products", async () => {
    const token = await userToken();
    const product = await availableProduct();
    product.status = "inactive";
    await product.save();

    const res = await authorized(request(app).post("/api/cart"), token)
      .send({ product_id: product._id.toString(), name: product.name, price: product.price, quantity: 1 });
    expect(res.status).toBe(404);
  });
});
