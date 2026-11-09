jest.mock("../utils/email", () => jest.fn().mockResolvedValue(undefined));

const request = require("supertest");
const { execFileSync } = require("child_process");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../app");
const sendEmail = require("../utils/email");
const User = require("../models/usermodel");
const Token = require("../models/tokenModel");
const hashToken = require("../utils/hashToken");

const validUser = {
  name: "Jane Doe",
  email: "jane@example.com",
  password: "Passw0rd!",
};

const registerVerified = async (payload) => {
  await request(app).post("/api/auth/register").send(payload);
  const user = await User.findOne({ email: payload.email });
  if (user) { user.emailVerified = true; await user.save(); }
  return request(app).post("/api/auth/login").send({ email: payload.email, password: payload.password });
};

describe("Auth flow", () => {
  it("registers without issuing a session until email verification", async () => {
    const res = await request(app).post("/api/auth/register").send(validUser);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toBeUndefined();
    const user = await User.findOne({ email: validUser.email }).select("+emailVerificationTokenHash");
    expect(user.emailVerified).toBe(false);
    expect(user.emailVerificationTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await Token.countDocuments({ type: "refresh" })).toBe(0);
    const blocked = await request(app).post("/api/auth/login").send(validUser);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    const token = sendEmail.mock.calls.at(-1)[0].text.match(/token=([a-f0-9]{64})/)[1];
    const verified = await request(app).post("/api/auth/verify-email").send({ token });
    expect(verified.status).toBe(200);
    expect((await User.findOne({ email: validUser.email })).emailVerified).toBe(true);
    expect((await request(app).post("/api/auth/verify-email").send({ token })).status).toBe(400);
    const login = await request(app).post("/api/auth/login").send(validUser);
    expect(login.status).toBe(200);
    expect(login.body.data).toHaveProperty("refreshToken");
  });

  it("does not grant privileged roles during public registration", async () => {
    const email = "attacker@example.com";
    const res = await request(app).post("/api/auth/register").send({ ...validUser, email, role: "admin" });
    expect(res.status).toBe(202);
    expect((await User.findOne({ email })).role).toBe("user");
  });

  it("uses the same public registration response for a duplicate email and expires verification links", async () => {
    const first = await request(app).post("/api/auth/register").send({ ...validUser, email: "repeat@example.com" });
    const firstMail = sendEmail.mock.calls.at(-1)[0].text;
    const oldToken = firstMail.match(/token=([a-f0-9]{64})/)[1];
    const duplicate = await request(app).post("/api/auth/register").send({ ...validUser, email: "repeat@example.com" });
    expect(duplicate.status).toBe(first.status);
    expect(duplicate.body.message).toBe(first.body.message);
    await User.updateOne({ email: "repeat@example.com" }, { emailVerificationExpiresAt: new Date(Date.now() - 1000) });
    const expired = await request(app).post("/api/auth/verify-email").send({ token: oldToken });
    expect(expired.status).toBe(400);
  });

  it("resends verification without exposing account existence", async () => {
    await request(app).post("/api/auth/register").send({ ...validUser, email: "resend@example.com" });
    sendEmail.mockClear();
    await User.updateOne({ email: "resend@example.com" }, { emailVerificationSentAt: new Date(Date.now() - 61_000) });
    const existing = await request(app).post("/api/auth/resend-verification").send({ email: "resend@example.com" });
    const missing = await request(app).post("/api/auth/resend-verification").send({ email: "missing@example.com" });
    expect(existing.status).toBe(missing.status);
    expect(existing.body.message).toBe(missing.body.message);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps registration generic when SMTP delivery fails", async () => {
    sendEmail.mockRejectedValueOnce(new Error("mail transport detail"));
    const res = await request(app).post("/api/auth/register").send({ ...validUser, email: "mail-failure@example.com" });
    expect(res.status).toBe(202);
    expect(res.body.message).toBe("If that email can be verified, instructions have been sent.");
    expect(res.body.message).not.toContain("mail transport");
    expect((await User.findOne({ email: "mail-failure@example.com" })).emailVerified).toBe(false);
  });

  it("uses the current database role instead of a stale JWT role claim", async () => {
    await request(app).post("/api/auth/register").send({ ...validUser, email: "stale-role@example.com" });
    const userId = (await User.findOne({ email: "stale-role@example.com" }))._id;
    const staleAdminToken = jwt.sign({ id: userId, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "15m" });

    const res = await request(app)
      .get("/api/admin/summary")
      .set("Authorization", `Bearer ${staleAdminToken}`);

    expect(res.status).toBe(403);
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
    await registerVerified(validUser);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
  });

  it("rejects login with wrong password", async () => {
    await registerVerified(validUser);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: "WrongPass1!" });
    expect(res.status).toBe(400);
  });

  it("blocks /api/auth/me without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a customer from accessing an admin-only endpoint", async () => {
    const reg = await registerVerified({
      ...validUser,
      email: "customer-admin@example.com",
    });

    const res = await request(app)
      .get("/api/admin/summary")
      .set("Authorization", `Bearer ${reg.body.data.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("allows an admin to access an admin-only endpoint", async () => {
    const admin = await User.create({
      name: "Site Admin",
      email: "auth-admin@example.com",
      password: await bcrypt.hash("Passw0rd!", 10),
      role: "admin",
    });
    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: "15m" });

    const res = await request(app)
      .get("/api/admin/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "success");
  });

  it("does not expose JWT verification details for invalid bearer tokens", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid token");
    expect(res.body.error).toBeUndefined();
  });

  it("prevents customer A from modifying customer B address", async () => {
    const customerA = await registerVerified({
      ...validUser,
      email: "customer-a@example.com",
    });
    const customerB = await registerVerified({
      ...validUser,
      email: "customer-b@example.com",
    });

    const bAddress = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${customerB.body.data.accessToken}`)
      .send({
        fullName: "Customer B",
        phone: "01000000000",
        line1: "Building B",
        city: "Cairo",
        postalCode: "11223",
        country: "EG",
      });

    const res = await request(app)
      .put(`/api/addresses/${bAddress.body.data._id}`)
      .set("Authorization", `Bearer ${customerA.body.data.accessToken}`)
      .send({ city: "Alexandria" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Address not found");
  });

  it("allows an owner to update their own address", async () => {
    const customer = await registerVerified({
      ...validUser,
      email: "customer-own@example.com",
    });

    const address = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${customer.body.data.accessToken}`)
      .send({
        fullName: "Customer Own",
        phone: "01011111111",
        line1: "Main Street 1",
        city: "Cairo",
        postalCode: "44556",
        country: "EG",
      });

    const res = await request(app)
      .put(`/api/addresses/${address.body.data._id}`)
      .set("Authorization", `Bearer ${customer.body.data.accessToken}`)
      .send({ city: "Giza" });

    expect(res.status).toBe(200);
    expect(res.body.data.city).toBe("Giza");
  });

  it("returns the current user with a valid token", async () => {
    const reg = await registerVerified(validUser);
    const token = reg.body.data.accessToken;
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("jane@example.com");
  });

  it("rotates refresh tokens once and stores only their hashes", async () => {
    const registration = await registerVerified({
      ...validUser,
      email: "refresh@example.com",
    });
    const oldRefreshToken = registration.body.data.refreshToken;

    const refresh = await request(app).post("/api/auth/refresh").send({ refreshToken: oldRefreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.refreshToken).not.toBe(oldRefreshToken);

    const oldRecord = await Token.findOne({ token: hashToken(oldRefreshToken), type: "refresh" });
    const newRecord = await Token.findOne({ token: hashToken(refresh.body.data.refreshToken), type: "refresh" });
    expect(oldRecord.revoked).toBe(true);
    expect(newRecord).not.toBeNull();

    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: oldRefreshToken });
    expect(replay.status).toBe(401);
  });

  it("stores password-reset token hashes and consumes a reset token once", async () => {
    sendEmail.mockClear();
    await request(app).post("/api/auth/register").send({
      ...validUser,
      email: "reset-token@example.com",
    });
    sendEmail.mockClear();

    const requestReset = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "reset-token@example.com" });
    expect(requestReset.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const emailHtml = sendEmail.mock.calls[0][0].html;
    const rawToken = emailHtml.match(/token=([a-f0-9]{64})/)[1];
    const storedToken = await Token.findOne({ token: hashToken(rawToken), type: "reset" });
    expect(storedToken).not.toBeNull();

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "NewStrong123!" });
    expect(reset.status).toBe(200);
    expect((await Token.findById(storedToken._id)).revoked).toBe(true);

    const replay = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, password: "AnotherStrong123!" });
    expect(replay.status).toBe(400);
  });

  it("invalidates old access and refresh sessions on password reset", async () => {
    const email = "reset-sessions@example.com";
    const originalPassword = "Passw0rd!";
    const newPassword = "NewStrong123!";
    const login = await registerVerified({ ...validUser, email });
    const oldAccessToken = login.body.data.accessToken;
    const oldRefreshToken = login.body.data.refreshToken;
    const legacyAccessToken = jwt.sign(
      { id: login.body.data.user.id, role: login.body.data.user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    expect((await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${legacyAccessToken}`)).status).toBe(200);

    await request(app).post("/api/auth/forgot-password").send({ email });
    const rawToken = sendEmail.mock.calls.at(-1)[0].text.match(/token=([a-f0-9]{64})/)[1];
    const reset = await request(app).post("/api/auth/reset-password").send({ token: rawToken, password: newPassword });
    expect(reset.status).toBe(200);
    expect((await User.findOne({ email })).authVersion).toBe(1);

    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${oldAccessToken}`)).status).toBe(401);
    expect((await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${legacyAccessToken}`)).status).toBe(401);
    expect((await request(app).get("/api/cart").set("Authorization", `Bearer ${oldAccessToken}`)).status).toBe(401);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: oldRefreshToken })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email, password: originalPassword })).status).toBe(400);

    const newLogin = await request(app).post("/api/auth/login").send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
    expect((await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${newLogin.body.data.accessToken}`)).status).toBe(200);
  });

  it("rejects expired and replaced reset tokens", async () => {
    const email = "reset-expiry@example.com";
    await registerVerified({ ...validUser, email });
    expect((await request(app).post("/api/auth/reset-password")
      .send({ token: "invalid-reset-token", password: "NewStrong123!" })).status).toBe(400);
    await request(app).post("/api/auth/forgot-password").send({ email });
    const firstToken = sendEmail.mock.calls.at(-1)[0].text.match(/token=([a-f0-9]{64})/)[1];
    await request(app).post("/api/auth/forgot-password").send({ email });
    const secondToken = sendEmail.mock.calls.at(-1)[0].text.match(/token=([a-f0-9]{64})/)[1];

    expect((await request(app).post("/api/auth/reset-password")
      .send({ token: firstToken, password: "NewStrong123!" })).status).toBe(400);

    await Token.updateOne(
      { token: hashToken(secondToken), type: "reset" },
      { expiresAt: new Date(Date.now() - 1000) }
    );
    expect((await request(app).post("/api/auth/reset-password")
      .send({ token: secondToken, password: "NewStrong123!" })).status).toBe(400);
  });

  it("revokes all outstanding hashed and legacy reset tokens after a successful reset", async () => {
    const user = await User.create({
      name: "Reset Token Family",
      email: "reset-token-family@example.com",
      password: await bcrypt.hash("Passw0rd!", 10),
      emailVerified: true,
    });
    const validUntil = new Date(Date.now() + 60_000);
    const tokens = [
      { raw: "reset-primary-token", stored: hashToken("reset-primary-token") },
      { raw: "reset-hashed-sibling-token", stored: hashToken("reset-hashed-sibling-token") },
      { raw: "reset-legacy-sibling-token", stored: "reset-legacy-sibling-token" },
    ];
    await Token.insertMany(tokens.map(({ stored }) => ({
      user: user._id,
      token: stored,
      type: "reset",
      sessionVersion: 0,
      expiresAt: validUntil,
    })));

    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: tokens[0].raw, password: "NewStrong123!" });
    expect(reset.status).toBe(200);
    expect(await Token.countDocuments({ user: user._id, type: "reset", revoked: false })).toBe(0);

    for (const token of tokens.slice(1)) {
      const replay = await request(app).post("/api/auth/reset-password")
        .send({ token: token.raw, password: "AnotherStrong123!" });
      expect(replay.status).toBe(400);
    }
  });

  it("allows only one concurrent reset from tokens issued for the same session version", async () => {
    const user = await User.create({
      name: "Concurrent Reset",
      email: "concurrent-reset@example.com",
      password: await bcrypt.hash("Passw0rd!", 10),
      emailVerified: true,
    });
    const tokens = ["concurrent-reset-one", "concurrent-reset-two"];
    await Token.insertMany(tokens.map((raw) => ({
      user: user._id,
      token: hashToken(raw),
      type: "reset",
      sessionVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
    })));

    const responses = await Promise.all(tokens.map((token, index) =>
      request(app).post("/api/auth/reset-password")
        .send({ token, password: index === 0 ? "NewStrong123!" : "OtherStrong123!" })
    ));
    const updatedUser = await User.findById(user._id);
    expect({
      statuses: responses.map((response) => response.status).sort(),
      authVersion: updatedUser.authVersion,
    }).toEqual({ statuses: [200, 400], authVersion: 1 });
    expect(await Token.countDocuments({ user: user._id, type: "reset", revoked: false })).toBe(0);
  });

  it("keeps plaintext legacy refresh and reset tokens usable during migration", async () => {
    const refreshUser = await User.create({
      name: "Legacy Refresh",
      email: "legacy-refresh@example.com",
      password: await bcrypt.hash("Passw0rd!", 10),
      emailVerified: true,
    });
    const legacyRefreshToken = "legacy-refresh-token-value";
    await Token.create({
      user: refreshUser._id,
      token: legacyRefreshToken,
      type: "refresh",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: legacyRefreshToken });
    expect(refreshed.status).toBe(200);
    expect((await Token.findOne({ token: legacyRefreshToken, type: "refresh" })).revoked).toBe(true);

    const resetUser = await User.create({
      name: "Legacy Reset",
      email: "legacy-reset@example.com",
      password: await bcrypt.hash("Passw0rd!", 10),
      emailVerified: true,
    });
    const legacyResetToken = "legacy-reset-token-value";
    await Token.create({
      user: resetUser._id,
      token: legacyResetToken,
      type: "reset",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: legacyResetToken, password: "NewStrong123!" });
    expect(reset.status).toBe(200);
    expect((await Token.findOne({ token: legacyResetToken, type: "reset" })).revoked).toBe(true);
    expect((await request(app).post("/api/auth/login")
      .send({ email: resetUser.email, password: "NewStrong123!" })).status).toBe(200);

    const legacyLogoutToken = "legacy-logout-token-value";
    await Token.create({
      user: resetUser._id,
      token: legacyLogoutToken,
      type: "refresh",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await request(app).post("/api/auth/logout")
      .send({ refreshToken: legacyLogoutToken })).status).toBe(200);
    expect((await Token.findOne({ token: legacyLogoutToken, type: "refresh" })).revoked).toBe(true);
  });

  it("enforces production auth rate limiting on register/login and reset request", async () => {
    const script = `
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoose = require('mongoose');
      const request = require('supertest');
      const bcrypt = require('bcryptjs');
      const User = require('./models/usermodel');
      const app = require('./app');
      (async () => {
        const mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());
        try {
          const registerResults = [];
          for (let i = 0; i < 11; i += 1) {
            const res = await request(app)
              .post('/api/auth/register')
              .send({ name: 'User ' + i, email: 'prod-rate-' + Date.now() + '-' + i + '@example.com', password: 'Passw0rd!' });
            registerResults.push(res.status);
          }
          console.log('register:' + registerResults.includes(429));

          const user = await User.create({
            name: 'Login Rate User',
            email: 'login-rate-' + Date.now() + '@example.test',
            password: await bcrypt.hash('Passw0rd!', 10),
            role: 'user',
          });

          const loginResults = [];
          for (let i = 0; i < 11; i += 1) {
            const res = await request(app)
              .post('/api/auth/login')
              .send({ email: user.email, password: 'Passw0rd!' });
            loginResults.push(res.status);
          }
          console.log('login:' + loginResults.includes(429));

          const resetResults = [];
          for (let i = 0; i < 11; i += 1) {
            const res = await request(app)
              .post('/api/auth/forgot-password')
              .send({ email: user.email });
            resetResults.push(res.status);
          }
          console.log('reset:' + resetResults.includes(429));
        } finally {
          await mongoose.disconnect();
          await mongo.stop();
        }
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `;

    const output = execFileSync(process.execPath, ["-e", script], { cwd: __dirname + "/..", encoding: "utf8" });
    expect(output).toContain("register:true");
    expect(output).toContain("login:true");
    expect(output).toContain("reset:true");
  });
});
