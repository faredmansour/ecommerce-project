const request = require("supertest");
const app = require("../app");

async function userToken() {
  const res = await request(app).post("/api/auth/register").send({
    name: "Cart User",
    email: "cart@example.com",
    password: "Passw0rd!",
  });
  return res.body.data.accessToken;
}

describe("Cart", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/cart");
    expect(res.status).toBe(401);
  });

  it("adds a valid item to the cart", async () => {
    const token = await userToken();
    const res = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ product_id: "p1", name: "Mouse", price: 29.99, quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data[0].quantity).toBe(2);
  });

  it("rejects an invalid cart item (400)", async () => {
    const token = await userToken();
    const res = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Missing product_id and price" });
    expect(res.status).toBe(400);
  });

  it("returns the cart contents", async () => {
    const token = await userToken();
    await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({ product_id: "p1", name: "Mouse", price: 29.99 });
    const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
  });
});
