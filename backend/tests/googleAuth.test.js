jest.mock("../services/googleOidcService", () => ({
  getGoogleConfig: jest.fn(() => ({ clientId: "google-client-test", clientSecret: "mock-only", redirectUri: "http://localhost:8000/api/auth/google/callback" })),
  createGoogleClient: jest.fn(() => ({
    generateCodeVerifierAsync: jest.fn().mockResolvedValue({ codeVerifier: "test-code-verifier", codeChallenge: "test-code-challenge" }),
    generateAuthUrl: jest.fn((options) => `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}&nonce=${options.nonce}`),
    getToken: jest.fn().mockResolvedValue({ tokens: { id_token: "mock-google-id-token" } }),
  })),
  verifyGoogleIdToken: jest.fn(async ({ nonce }) => ({ subject: "google-user-001", email: "google-user@example.com", name: "Google User", nonce })),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/usermodel");
const OAuthTransaction = require("../models/oauthTransactionModel");
const OAuthExchange = require("../models/oauthExchangeModel");
const { verifyGoogleIdToken, getGoogleConfig, createGoogleClient } = require("../services/googleOidcService");

async function startSignIn(returnTo = "/checkout?coupon=SAVE") {
  const started = await request(app).post("/api/auth/google/start").send({ returnTo });
  expect(started.status).toBe(200);
  const state = new URL(started.body.data.authUrl).searchParams.get("state");
  const cookies = started.headers["set-cookie"];
  const stateCookie = cookies.find((cookie) => cookie.startsWith("alfredo_oauth_state="));
  const exchangeCookie = cookies.find((cookie) => cookie.startsWith("alfredo_oauth_exchange="));
  expect(stateCookie).toContain("HttpOnly");
  expect(exchangeCookie).toContain("HttpOnly");
  return {
    state,
    cookie: stateCookie.split(";")[0],
    exchangeCookie: exchangeCookie.split(";")[0],
    exchangeBinding: exchangeCookie.split(";")[0].split("=")[1],
    started,
  };
}

describe("Google OIDC authentication", () => {
  beforeEach(() => verifyGoogleIdToken.mockReset().mockImplementation(async ({ nonce }) => ({
    subject: "google-user-001",
    email: "google-user@example.com",
    name: "Google User",
    nonce,
  })));

  it("verifies Google identity on the backend and returns a one-time exchange code", async () => {
    const { state, cookie, exchangeCookie } = await startSignIn();
    const transaction = await OAuthTransaction.findOne();
    const callback = await request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toMatch(/^http:\/\/localhost:5173\/auth\/callback\?code=[a-f0-9]{64}$/);
    expect(verifyGoogleIdToken).toHaveBeenCalledWith(expect.objectContaining({
      idToken: "mock-google-id-token",
      audience: "google-client-test",
      nonce: transaction.nonce,
    }));
    const callbackClient = createGoogleClient.mock.results.at(-1).value;
    expect(callbackClient.getToken).toHaveBeenCalledWith({
      code: "mock-code",
      codeVerifier: transaction.codeVerifier,
    });
    const initiationClient = createGoogleClient.mock.results.at(-2).value;
    expect(initiationClient.generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      code_challenge: "test-code-challenge",
      code_challenge_method: "S256",
      state,
      nonce: transaction.nonce,
    }));

    expect(await OAuthTransaction.countDocuments()).toBe(0);
    expect(callback.headers["set-cookie"][0]).toContain("Max-Age=0");
    const callbackReplay = await request(app).get("/api/auth/google/callback")
      .set("Cookie", cookie)
      .query({ state, code: "mock-code" });
    expect(callbackReplay.headers.location).toContain("providerError=invalid_state");

    const code = new URL(callback.headers.location).searchParams.get("code");
    const exchange = await request(app).post("/api/auth/google/exchange").set("Cookie", exchangeCookie).send({ code });
    expect(exchange.status).toBe(200);
    expect(exchange.body.data.user.email).toBe("google-user@example.com");
    expect(exchange.body.data.returnTo).toBe("/checkout?coupon=SAVE");
    expect((await User.findOne({ email: "google-user@example.com" })).password).toBeUndefined();
    const protectedResponse = await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${exchange.body.data.accessToken}`);
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.data.email).toBe("google-user@example.com");

    const replay = await request(app).post("/api/auth/google/exchange").set("Cookie", exchangeCookie).send({ code });
    expect(replay.status).toBe(401);

    const logout = await request(app).post("/api/auth/logout")
      .send({ refreshToken: exchange.body.data.refreshToken });
    expect(logout.status).toBe(200);
    expect((await request(app).post("/api/auth/refresh")
      .send({ refreshToken: exchange.body.data.refreshToken })).status).toBe(401);
    await User.updateOne({ email: "google-user@example.com" }, { $inc: { authVersion: 1 } });
    expect((await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${exchange.body.data.accessToken}`)).status).toBe(401);
  });

  it("uses secure cross-origin browser-binding cookie attributes in production", async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const started = await request(app).post("/api/auth/google/start").send({ returnTo: "/checkout" });
      const exchangeCookie = started.headers["set-cookie"].find((cookie) => cookie.startsWith("alfredo_oauth_exchange="));
      expect(exchangeCookie).toContain("HttpOnly");
      expect(exchangeCookie).toContain("SameSite=None");
      expect(exchangeCookie).toContain("Secure");
      expect(exchangeCookie).toContain("Path=/api/auth/google/exchange");
    } finally {
      process.env.NODE_ENV = previousEnvironment;
    }
  });

  it("rejects exchange from another browser without consuming the initiating browser's code", async () => {
    const { state, cookie, exchangeCookie } = await startSignIn();
    const callback = await request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" });
    const code = new URL(callback.headers.location).searchParams.get("code");

    const otherBrowser = await request(app).post("/api/auth/google/exchange")
      .set("Cookie", `alfredo_oauth_exchange=${"0".repeat(64)}`)
      .send({ code });
    expect(otherBrowser.status).toBe(401);

    const initiatingBrowser = await request(app).post("/api/auth/google/exchange").set("Cookie", exchangeCookie).send({ code });
    expect(initiatingBrowser.status).toBe(200);
  });

  it("rejects an expired exchange code", async () => {
    const { exchangeBinding } = await startSignIn();
    const code = "a".repeat(64);
    const user = await User.create({ name: "Expired Exchange", email: "expired-exchange@example.com", role: "user" });
    await OAuthExchange.create({
      codeHash: require("../utils/hashToken")(code),
      bindingHash: require("../utils/hashToken")(exchangeBinding),
      user: user._id,
      returnTo: "/checkout",
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await request(app).post("/api/auth/google/exchange")
      .set("Cookie", `alfredo_oauth_exchange=${exchangeBinding}`)
      .send({ code });
    expect(response.status).toBe(401);
  });

  it("allows only one of two concurrent exchange requests to consume the code", async () => {
    const { state, cookie, exchangeCookie } = await startSignIn();
    const callback = await request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" });
    const code = new URL(callback.headers.location).searchParams.get("code");

    const responses = await Promise.all([
      request(app).post("/api/auth/google/exchange").set("Cookie", exchangeCookie).send({ code }),
      request(app).post("/api/auth/google/exchange").set("Cookie", exchangeCookie).send({ code }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  it("allows only one concurrent callback to consume an OAuth transaction", async () => {
    const { state, cookie } = await startSignIn();
    const callbacks = await Promise.all([
      request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" }),
      request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" }),
    ]);

    expect(callbacks.filter((response) => response.headers.location.includes("/auth/callback?code="))).toHaveLength(1);
    expect(callbacks.filter((response) => response.headers.location.includes("providerError=invalid_state"))).toHaveLength(1);
    expect(await OAuthTransaction.countDocuments()).toBe(0);
    expect(await OAuthExchange.countDocuments()).toBe(1);
  });

  it("rejects an invalid OAuth state before contacting the provider", async () => {
    const response = await request(app).get("/api/auth/google/callback").query({ state: "0".repeat(64), code: "mock-code" });
    const missing = await request(app).get("/api/auth/google/callback").query({ code: "mock-code" });
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("providerError=invalid_state");
    expect(missing.status).toBe(302);
    expect(missing.headers.location).toContain("providerError=invalid_state");
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("binds OAuth state to the initiating browser cookie", async () => {
    const { cookie } = await startSignIn();
    const substitutedState = "0".repeat(64);
    const response = await request(app).get("/api/auth/google/callback")
      .set("Cookie", cookie)
      .query({ state: substitutedState, code: "mock-code" });
    expect(response.headers.location).toContain("providerError=invalid_state");
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("rejects the correct state from a different browser cookie", async () => {
    const { state } = await startSignIn();
    const response = await request(app).get("/api/auth/google/callback")
      .set("Cookie", `alfredo_oauth_state=${"0".repeat(64)}`)
      .query({ state, code: "mock-code" });

    expect(response.headers.location).toContain("providerError=invalid_state");
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("rejects an expired OAuth state and fails closed when provider credentials are not configured", async () => {
    const expiredState = "e".repeat(64);
    await OAuthTransaction.create({
      stateHash: require("../utils/hashToken")(expiredState),
      nonce: "expired-nonce",
      codeVerifier: "expired-verifier",
      exchangeBindingHash: require("../utils/hashToken")("expired-browser-binding"),
      intent: "sign_in",
      returnTo: "/checkout",
      expiresAt: new Date(Date.now() - 1000),
    });
    const expired = await request(app).get("/api/auth/google/callback").set("Cookie", `alfredo_oauth_state=${expiredState}`).query({ state: expiredState, code: "mock-code" });
    expect(expired.headers.location).toContain("providerError=invalid_state");

    getGoogleConfig.mockReturnValueOnce(null);
    const unavailable = await request(app).post("/api/auth/google/start").send({ returnTo: "/checkout" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe("GOOGLE_AUTH_NOT_CONFIGURED");
  });

  it("does not complete account linking after the initiating account session is revoked", async () => {
    const user = await User.create({
      name: "Link Session Owner",
      email: "link-session@example.com",
      password: "Passw0rd!",
      emailVerified: true,
    });
    const accessToken = jwt.sign(
      { id: user._id, role: user.role, sessionVersion: user.authVersion },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    const started = await request(app).post("/api/auth/google/link/start")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ returnTo: "/account" });
    const state = new URL(started.body.data.authUrl).searchParams.get("state");
    const cookie = started.headers["set-cookie"].find((value) => value.startsWith("alfredo_oauth_state=")).split(";")[0];

    await User.updateOne({ _id: user._id }, { $inc: { authVersion: 1 } });
    verifyGoogleIdToken.mockImplementationOnce(async ({ nonce }) => ({
      subject: "google-link-session",
      email: "link-session@example.com",
      name: "Link Session Owner",
      nonce,
    }));
    const callback = await request(app).get("/api/auth/google/callback")
      .set("Cookie", cookie)
      .query({ state, code: "mock-code" });

    expect(callback.headers.location).toContain("providerError=google_failed");
    expect((await User.findById(user._id).select("+googleSub")).googleSub).toBeUndefined();
    expect(await OAuthExchange.countDocuments()).toBe(0);
  });

  it("consumes a valid OAuth transaction when the user cancels at Google", async () => {
    const { state, cookie } = await startSignIn("/checkout");
    const callback = await request(app).get("/api/auth/google/callback")
      .set("Cookie", cookie)
      .query({ state, error: "access_denied" });

    expect(callback.headers.location).toContain("providerError=google_failed");
    expect(callback.headers.location).toContain("returnTo=%2Fcheckout");
    expect(await OAuthTransaction.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects expired or otherwise invalid Google ID tokens", async () => {
    const { state, cookie } = await startSignIn();
    verifyGoogleIdToken.mockRejectedValueOnce(Object.assign(new Error("invalid token"), { code: "GOOGLE_IDENTITY_INVALID" }));

    const callback = await request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("providerError=google_failed");
    expect(await User.countDocuments()).toBe(0);
    expect(await OAuthExchange.countDocuments()).toBe(0);
  });

  it("fails closed when the provider rejects the stored PKCE verifier", async () => {
    const { state, cookie } = await startSignIn();
    await OAuthTransaction.updateOne({ stateHash: require("../utils/hashToken")(state) }, { codeVerifier: "tampered-verifier" });
    createGoogleClient.mockImplementationOnce(() => ({
      getToken: jest.fn().mockRejectedValue(new Error("PKCE verification failed")),
    }));

    const callback = await request(app).get("/api/auth/google/callback")
      .set("Cookie", cookie)
      .query({ state, code: "mock-code" });

    expect(callback.headers.location).toContain("providerError=google_failed");
    expect(await User.countDocuments()).toBe(0);
    expect(await OAuthExchange.countDocuments()).toBe(0);
  });

  it("does not silently link a Google identity to an existing password account by email", async () => {
    await request(app).post("/api/auth/register").send({ name: "Existing User", email: "google-user@example.com", password: "Passw0rd!" });
    const { state, cookie } = await startSignIn();
    const callback = await request(app).get("/api/auth/google/callback").set("Cookie", cookie).query({ state, code: "mock-code" });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("providerError=account_exists");
    expect((await User.findOne({ email: "google-user@example.com" }).select("+googleSub")).googleSub).toBeUndefined();
  });

  it("links only the authenticated user's matching verified Google identity and blocks duplicates", async () => {
    await request(app).post("/api/auth/register").send({ name: "Link Owner", email: "google-user@example.com", password: "Passw0rd!" });
    await User.updateOne({ email: "google-user@example.com" }, { emailVerified: true });
    const registration = await request(app).post("/api/auth/login").send({ email: "google-user@example.com", password: "Passw0rd!" });
    const ownerId = registration.body.data.user.id;
    const existingIdentity = await User.create({ name: "Other", email: "other@example.com", password: "Passw0rd!", googleSub: "google-user-001" });
    const collisionStart = await request(app).post("/api/auth/google/link/start")
      .set("Authorization", `Bearer ${registration.body.data.accessToken}`)
      .send({ returnTo: "/account" });
    const collisionState = new URL(collisionStart.body.data.authUrl).searchParams.get("state");
    const collisionCookie = collisionStart.headers["set-cookie"][0].split(";")[0];
    const collision = await request(app).get("/api/auth/google/callback").set("Cookie", collisionCookie).query({ state: collisionState, code: "mock-code" });
    expect(collision.headers.location).toContain("providerError=identity_already_linked");
    expect(String(existingIdentity._id)).not.toBe(ownerId);
    expect((await User.findById(ownerId).select("+googleSub")).googleSub).toBeUndefined();

    verifyGoogleIdToken.mockImplementationOnce(async ({ nonce }) => ({
      subject: "google-new-identity",
      email: "google-user@example.com",
      name: "Google User",
      nonce,
    }));
    const safeStart = await request(app).post("/api/auth/google/link/start")
      .set("Authorization", `Bearer ${registration.body.data.accessToken}`)
      .send({ returnTo: "/account" });
    const safeState = new URL(safeStart.body.data.authUrl).searchParams.get("state");
    const safeCookie = safeStart.headers["set-cookie"][0].split(";")[0];
    const linked = await request(app).get("/api/auth/google/callback").set("Cookie", safeCookie).query({ state: safeState, code: "mock-code" });
    expect(linked.headers.location).toContain("/auth/callback?code=");
    expect((await User.findById(ownerId).select("+googleSub")).googleSub).toBe("google-new-identity");
  });

  it("rejects malformed and replayed exchange codes", async () => {
    expect((await request(app).post("/api/auth/google/exchange").send({ code: "not-valid" })).status).toBe(400);
    const replay = await request(app).post("/api/auth/google/exchange").send({ code: "a".repeat(64) });
    expect(replay.status).toBe(401);
  });
});
