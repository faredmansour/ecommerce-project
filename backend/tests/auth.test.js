const request = require("supertest");
const app = require("../app");

const validUser = {
  name: "Jane Doe",
  email: "jane@example.com",
  password: "Passw0rd!",
};

describe("Auth flow", () => {
  it("registers a new user and returns tokens", async () => {
    const res = await request(app).post("/api/auth/register").send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.user.email).toBe("jane@example.com");
  });

  it("rejects a weak password with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validUser, password: "weak" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validUser, email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("logs in an existing user", async () => {
    await request(app).post("/api/auth/register").send(validUser);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
  });

  it("rejects login with wrong password", async () => {
    await request(app).post("/api/auth/register").send(validUser);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: "WrongPass1!" });
    expect(res.status).toBe(400);
  });

  it("blocks /api/auth/me without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid token", async () => {
    const reg = await request(app).post("/api/auth/register").send(validUser);
    const token = reg.body.data.accessToken;
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("jane@example.com");
  });
});
