const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  APPLE_ISSUER,
  APPLE_JWKS_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  createAppleAuthorizationUrl,
  createAppleClientSecret,
  exchangeAppleCode,
  getAppleConfig,
  verifyAppleIdToken,
} = require("../services/appleOidcService");

const config = {
  clientId: "com.example.web",
  teamId: "TEAM123",
  keyId: "KEY123",
  redirectUri: "https://api.example.test/api/auth/apple/callback",
};

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "APPLE-KEY", alg: "RS256", use: "sig" };
const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) });

function createIdToken(overrides = {}, signingKey = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: APPLE_ISSUER,
    aud: config.clientId,
    sub: "apple-subject",
    email: "apple@example.test",
    email_verified: true,
    nonce: "expected-nonce",
    iat: 1_900_000_000,
    exp: 2_000_000_000,
    ...overrides,
  })).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(content), signingKey).toString("base64url");
  return `${content}.${signature}`;
}

describe("Apple OpenID Connect service", () => {
  beforeAll(() => {
    global.fetch = fetchMock;
  });

  afterAll(() => {
    delete global.fetch;
  });

  it("requires the server-side Services ID, team/key IDs, private key, and callback URI", () => {
    expect(getAppleConfig({ APPLE_CLIENT_ID: "only-client-id" })).toBeNull();
    expect(getAppleConfig({
      APPLE_CLIENT_ID: config.clientId,
      APPLE_TEAM_ID: config.teamId,
      APPLE_KEY_ID: config.keyId,
      APPLE_PRIVATE_KEY: "line1\\nline2",
      APPLE_REDIRECT_URI: config.redirectUri,
    })).toMatchObject({ ...config, privateKey: "line1\nline2" });
  });

  it("builds a query-mode authorization URL with the exact callback, state, and nonce", () => {
    const url = new URL(createAppleAuthorizationUrl({ config, state: "state-value", nonce: "nonce-value" }));
    expect(url.origin).toBe("https://appleid.apple.com");
    expect(url.pathname).toBe("/auth/authorize");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
  });

  it("creates a short-lived Apple client-secret JWT signed with the configured ES256 key", () => {
    const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const clientSecret = createAppleClientSecret({ ...config, privateKey: ec.privateKey });
    const claims = jwt.verify(clientSecret, ec.publicKey, {
      algorithms: ["ES256"],
      issuer: config.teamId,
      subject: config.clientId,
      audience: APPLE_ISSUER,
    });
    expect(claims.exp - claims.iat).toBe(300);
    expect(jwt.decode(clientSecret, { complete: true }).header.kid).toBe(config.keyId);
  });

  it("exchanges authorization codes server-side using the configured Apple client secret", async () => {
    const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id_token: "signed-id-token" }) });
    await expect(exchangeAppleCode({
      code: "authorization-code",
      config: { ...config, privateKey: ec.privateKey },
      fetchImpl,
    })).resolves.toBe("signed-id-token");
    expect(fetchImpl).toHaveBeenCalledWith(APPLE_TOKEN_ENDPOINT, expect.objectContaining({ method: "POST" }));
    const body = new URLSearchParams(fetchImpl.mock.calls[0][1].body);
    expect(body.get("client_id")).toBe(config.clientId);
    expect(body.get("code")).toBe("authorization-code");
    expect(body.get("redirect_uri")).toBe(config.redirectUri);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(jwt.decode(body.get("client_secret")).sub).toBe(config.clientId);
  });

  it("validates the Apple JWKS signature and required OIDC claims", async () => {
    await expect(verifyAppleIdToken({
      idToken: createIdToken(),
      audience: config.clientId,
      nonce: "expected-nonce",
      fetchImpl: fetchMock,
      now: 1_950_000_000,
    })).resolves.toEqual({
      subject: "apple-subject",
      email: "apple@example.test",
      emailVerified: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(APPLE_JWKS_ENDPOINT, expect.anything());
  });

  it.each([
    ["wrong issuer", { iss: "https://attacker.invalid" }],
    ["wrong audience", { aud: "another-service" }],
    ["expired token", { exp: 1_900_000_000 }],
    ["future not-before claim", { nbf: 1_960_000_000 }],
    ["wrong nonce", { nonce: "attacker-nonce" }],
    ["missing subject", { sub: "" }],
    ["unverified email", { email_verified: false }],
  ])("rejects a signed token with %s", async (_label, overrides) => {
    await expect(verifyAppleIdToken({
      idToken: createIdToken(overrides),
      audience: config.clientId,
      nonce: "expected-nonce",
      fetchImpl: fetchMock,
      now: 1_950_000_000,
    })).rejects.toMatchObject({ code: "APPLE_IDENTITY_INVALID" });
  });

  it("rejects a token with an invalid RSA signature", async () => {
    const wrongKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    await expect(verifyAppleIdToken({
      idToken: createIdToken({}, wrongKey),
      audience: config.clientId,
      nonce: "expected-nonce",
      fetchImpl: fetchMock,
      now: 1_950_000_000,
    })).rejects.toMatchObject({ code: "APPLE_IDENTITY_INVALID" });
  });
});
