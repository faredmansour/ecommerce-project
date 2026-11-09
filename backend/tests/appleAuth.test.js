jest.mock("../services/appleOidcService", () => ({
  getAppleConfig: jest.fn(() => ({
    clientId: "com.example.web",
    teamId: "TESTTEAM",
    keyId: "TESTKEY",
    privateKey: "test-private-key",
    redirectUri: "http://localhost:8000/api/auth/apple/callback",
  })),
  createAppleAuthorizationUrl: jest.fn(({ state, nonce }) =>
    `https://appleid.apple.com/auth/authorize?state=${state}&nonce=${nonce}`),
  exchangeAppleCode: jest.fn().mockResolvedValue("mock-apple-id-token"),
  verifyAppleIdToken: jest.fn(async () => ({
    subject: "apple-subject-001",
    email: "apple-user@example.com",
    emailVerified: true,
  })),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/usermodel");
const OAuthTransaction = require("../models/oauthTransactionModel");
const OAuthExchange = require("../models/oauthExchangeModel");
const hashToken = require("../utils/hashToken");
const logger = require("../utils/logger");
const { getAppleConfig, exchangeAppleCode, verifyAppleIdToken } = require("../services/appleOidcService");

async function startSignIn(returnTo = "/checkout?coupon=SAVE") {
  const started = await request(app).post("/api/auth/apple/start").send({ returnTo });
  expect(started.status).toBe(200);
  const authUrl = new URL(started.body.data.authUrl);
  const cookies = started.headers["set-cookie"];
  const stateCookie = cookies.find((cookie) => cookie.startsWith("alfredo_apple_oauth_state="));
  const exchangeCookie = cookies.find((cookie) => cookie.startsWith("alfredo_apple_oauth_exchange="));
  expect(stateCookie).toContain("HttpOnly");
  expect(exchangeCookie).toContain("HttpOnly");
  return {
    state: authUrl.searchParams.get("state"),
    nonce: authUrl.searchParams.get("nonce"),
    cookie: stateCookie.split(";")[0],
    exchangeCookie: exchangeCookie.split(";")[0],
    exchangeBinding: exchangeCookie.split(";")[0].split("=")[1],
  };
}

describe("Apple OIDC authentication", () => {
  beforeEach(() => {
    verifyAppleIdToken.mockReset().mockImplementation(async () => ({
      subject: "apple-subject-001",
      email: "apple-user@example.com",
      emailVerified: true,
    }));
    exchangeAppleCode.mockReset().mockResolvedValue("mock-apple-id-token");
  });

  it("starts a short-lived, browser-bound Apple transaction and fails closed without config", async () => {
    const flow = await startSignIn("/checkout");
    const transaction = await OAuthTransaction.findOne({ provider: "apple" });
    expect(transaction.stateHash).toBe(hashToken(flow.state));
    expect(transaction.stateHash).not.toBe(flow.state);
    expect(transaction.nonce).toBe(flow.nonce);
    expect(transaction.codeVerifier).toBeUndefined();
    expect(transaction.exchangeBindingHash).toBe(hashToken(flow.exchangeBinding));
    expect(transaction.expiresAt.getTime()).toBeGreaterThan(Date.now());

    getAppleConfig.mockReturnValueOnce(null);
    const unavailable = await request(app).post("/api/auth/apple/start").send({ returnTo: "/checkout" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe("APPLE_AUTH_NOT_CONFIGURED");
  });

  it("creates a verified Apple account, exchanges once, and restores backend authorization", async () => {
    const flow = await startSignIn();
    const callback = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", flow.cookie)
      .query({ state: flow.state, code: "apple-authorization-code" });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toMatch(/^http:\/\/localhost:5173\/auth\/callback\?provider=apple&code=[a-f0-9]{64}$/);
    expect(exchangeAppleCode).toHaveBeenCalledWith(expect.objectContaining({ code: "apple-authorization-code" }));
    expect(verifyAppleIdToken).toHaveBeenCalledWith(expect.objectContaining({
      idToken: "mock-apple-id-token",
      audience: "com.example.web",
      nonce: flow.nonce,
    }));
    expect(await OAuthTransaction.countDocuments({ provider: "apple" })).toBe(0);

    const code = new URL(callback.headers.location).searchParams.get("code");
    const exchange = await request(app).post("/api/auth/apple/exchange")
      .set("Cookie", flow.exchangeCookie)
      .send({ code });
    expect(exchange.status).toBe(200);
    expect(exchange.body.data.returnTo).toBe("/checkout?coupon=SAVE");
    expect(exchange.body.data.user.authProviders).toMatchObject({ apple: true });

    const protectedResponse = await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${exchange.body.data.accessToken}`);
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.data.authProviders.apple).toBe(true);

    const replay = await request(app).post("/api/auth/apple/exchange")
      .set("Cookie", flow.exchangeCookie)
      .send({ code });
    expect(replay.status).toBe(401);
  });

  it("consumes cancelled Apple authorization and rejects missing, expired, wrong-browser, or replayed state", async () => {
    const cancelled = await startSignIn("/checkout");
    const cancelResponse = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", cancelled.cookie)
      .query({ state: cancelled.state, error: "user_cancelled_authorize" });
    expect(cancelResponse.headers.location).toContain("providerError=apple_failed");
    expect(await OAuthTransaction.countDocuments({ provider: "apple" })).toBe(0);

    const missingState = await request(app).get("/api/auth/apple/callback").query({ code: "code" });
    expect(missingState.headers.location).toContain("providerError=apple_invalid_state");

    const flow = await startSignIn();
    const wrongBrowser = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", `alfredo_apple_oauth_state=${"0".repeat(64)}`)
      .query({ state: flow.state, code: "apple-authorization-code" });
    expect(wrongBrowser.headers.location).toContain("providerError=apple_invalid_state");
    expect(await OAuthTransaction.countDocuments({ provider: "apple" })).toBe(1);

    const expiredState = "e".repeat(64);
    await OAuthTransaction.create({
      provider: "apple",
      stateHash: hashToken(expiredState),
      nonce: "expired-nonce",
      exchangeBindingHash: hashToken("expired-binding"),
      returnTo: "/checkout",
      expiresAt: new Date(Date.now() - 1000),
    });
    const expired = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", `alfredo_apple_oauth_state=${expiredState}`)
      .query({ state: expiredState, code: "apple-authorization-code" });
    expect(expired.headers.location).toContain("providerError=apple_invalid_state");

    const valid = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", flow.cookie)
      .query({ state: flow.state, code: "apple-authorization-code" });
    expect(valid.headers.location).toContain("/auth/callback?provider=apple&code=");
    const replay = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", flow.cookie)
      .query({ state: flow.state, code: "apple-authorization-code" });
    expect(replay.headers.location).toContain("providerError=apple_invalid_state");
  });

  it("allows only one concurrent callback to consume an Apple transaction", async () => {
    const flow = await startSignIn();
    const callbacks = await Promise.all([
      request(app).get("/api/auth/apple/callback").set("Cookie", flow.cookie).query({ state: flow.state, code: "code-one" }),
      request(app).get("/api/auth/apple/callback").set("Cookie", flow.cookie).query({ state: flow.state, code: "code-one" }),
    ]);
    expect(callbacks.filter((response) => response.headers.location.includes("/auth/callback?provider=apple&code="))).toHaveLength(1);
    expect(callbacks.filter((response) => response.headers.location.includes("providerError=apple_invalid_state"))).toHaveLength(1);
    expect(await OAuthExchange.countDocuments({ provider: "apple" })).toBe(1);
  });

  it("does not automatically link an Apple identity to an existing password account", async () => {
    await User.create({
      name: "Password Account",
      email: "apple-user@example.com",
      password: "Passw0rd!",
      emailVerified: true,
    });
    const flow = await startSignIn();
    const callback = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", flow.cookie)
      .query({ state: flow.state, code: "apple-authorization-code" });
    expect(callback.headers.location).toContain("providerError=account_exists");
    expect((await User.findOne({ email: "apple-user@example.com" }).select("+appleSub")).appleSub).toBeUndefined();
    expect(await OAuthExchange.countDocuments({ provider: "apple" })).toBe(0);
  });

  it("requires a verified email for new accounts, but can sign in an existing Apple subject without email", async () => {
    verifyAppleIdToken.mockResolvedValueOnce({
      subject: "unverified-apple-subject",
      email: "unverified@example.com",
      emailVerified: false,
    });
    const rejectedFlow = await startSignIn();
    const rejected = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", rejectedFlow.cookie)
      .query({ state: rejectedFlow.state, code: "apple-authorization-code" });
    expect(rejected.headers.location).toContain("providerError=apple_email_unavailable");

    await User.create({
      name: "Existing Apple User",
      email: "apple-user@example.com",
      appleSub: "apple-subject-001",
      emailVerified: true,
    });
    verifyAppleIdToken.mockResolvedValueOnce({
      subject: "apple-subject-001",
      email: undefined,
      emailVerified: false,
    });
    const existingFlow = await startSignIn();
    const existing = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", existingFlow.cookie)
      .query({ state: existingFlow.state, code: "apple-authorization-code" });
    expect(existing.headers.location).toContain("/auth/callback?provider=apple&code=");
  });

  it("links only the authenticated matching verified Apple identity and rejects a revoked session", async () => {
    const owner = await User.create({
      name: "Link Owner",
      email: "apple-user@example.com",
      password: "Passw0rd!",
      emailVerified: true,
    });
    const accessToken = jwt.sign(
      { id: owner._id, role: owner.role, sessionVersion: owner.authVersion },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    const started = await request(app).post("/api/auth/apple/link/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ returnTo: "/account" });
    const authUrl = new URL(started.body.data.authUrl);
    const state = authUrl.searchParams.get("state");
    const cookie = started.headers["set-cookie"].find((value) => value.startsWith("alfredo_apple_oauth_state=")).split(";")[0];
    verifyAppleIdToken.mockResolvedValueOnce({
      subject: "new-apple-link",
      email: "apple-user@example.com",
      emailVerified: true,
    });
    const linked = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", cookie)
      .query({ state, code: "apple-authorization-code" });
    expect(linked.headers.location).toContain("/auth/callback?provider=apple&code=");
    expect((await User.findById(owner._id).select("+appleSub")).appleSub).toBe("new-apple-link");

    const pending = await request(app).post("/api/auth/apple/link/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ returnTo: "/account" });
    const pendingUrl = new URL(pending.body.data.authUrl);
    const pendingCookie = pending.headers["set-cookie"].find((value) => value.startsWith("alfredo_apple_oauth_state=")).split(";")[0];
    await User.updateOne({ _id: owner._id }, { $inc: { authVersion: 1 } });
    verifyAppleIdToken.mockResolvedValueOnce({
      subject: "another-apple-link",
      email: "apple-user@example.com",
      emailVerified: true,
    });
    const revoked = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", pendingCookie)
      .query({ state: pendingUrl.searchParams.get("state"), code: "apple-authorization-code" });
    expect(revoked.headers.location).toContain("providerError=apple_failed");
    expect((await User.findById(owner._id).select("+appleSub")).appleSub).toBe("new-apple-link");
  });

  it("does not log Apple codes, state, nonce, or ID tokens", async () => {
    const flow = await startSignIn();
    const loggerSpy = jest.spyOn(logger, "info").mockImplementation(() => logger);
    const sensitiveValues = [
      "sensitive-apple-code",
      flow.state,
      flow.nonce,
      "mock-apple-id-token",
      "apple-secret-error",
    ];
    exchangeAppleCode.mockRejectedValueOnce(new Error(sensitiveValues[0]));
    const callback = await request(app).get("/api/auth/apple/callback")
      .set("Cookie", flow.cookie)
      .query({ state: flow.state, code: sensitiveValues[0] });
    const logs = JSON.stringify(loggerSpy.mock.calls);
    loggerSpy.mockRestore();
    expect(callback.headers.location).toContain("providerError=apple_failed");
    for (const value of sensitiveValues) expect(logs).not.toContain(value);
  });
});
