const request = require("supertest");
const app = require("../app");

async function adminToken() {
  const res = await request(app).post("/api/auth/register").send({
    name: "Admin User",
    email: "admin@example.com",
    password: "Passw0rd!",
    role: "admin",
  });
  return res.body.data.accessToken;
}

async function createCategory(token) {
  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Electronics", description: "Gadgets" });
  return res.body._id;
}

describe("Products", () => {
  it("lists products with pagination metadata", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("pages");
  });

  it("lets an admin create a product", async () => {
    const token = await adminToken();
    const categoryId = await createCategory(token);

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Wireless Mouse")
      .field("description", "Ergonomic wireless mouse")
      .field("price", "29.99")
      .field("stock", "100")
      .field("category", categoryId);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.product.name).toBe("Wireless Mouse");
    expect(res.body.product.price).toBe(29.99);
  });

  it("rejects product creation without a category (400)", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "No Category")
      .field("price", "10");
    expect(res.status).toBe(400);
  });

  it("forbids non-admins from creating products (403)", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      name: "Normal User",
      email: "user@example.com",
      password: "Passw0rd!",
    });
    const token = reg.body.data.accessToken;
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Hack")
      .field("price", "10")
      .field("category", "507f1f77bcf86cd799439011");
    expect(res.status).toBe(403);
  });
});
