const crypto = require("crypto");
const KashierProvider = require("../providers/kashierProvider");
const PaymobProvider = require("../providers/paymobProvider");
const FawryProvider = require("../providers/fawryProvider");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { WEBHOOK_VERIFICATION_STATUS } = require("../providers/webhookContract");
const { getWebhookSecretMetadata, resolveWebhookSecret } = require("../providers/providerConfig");

const TEST_ONLY_SIGNING_MATERIAL = "offline-hmac-contract-test-only";
const LIVE_ONLY_SIGNING_MATERIAL = "offline-live-contract-test-only";

function kashierEnv(environment = "TEST", testKey = TEST_ONLY_SIGNING_MATERIAL, liveKey = LIVE_ONLY_SIGNING_MATERIAL) {
  return {
    KASHIER_ENVIRONMENT: environment,
    KASHIER_TEST_API_KEY: testKey,
    KASHIER_TEST_API_KEY_VERSION: "test-v1",
    KASHIER_LIVE_API_KEY: liveKey,
    KASHIER_LIVE_API_KEY_VERSION: "live-v1",
  };
}

function signedRequest(payload, key = TEST_ONLY_SIGNING_MATERIAL) {
  const canonical = payload.data.signatureKeys
    .map((field) => encodeURIComponent(String(payload.data[field] ?? "")))
    .join("");
  const signature = crypto.createHmac("sha256", key).update(canonical, "utf8").digest("hex");
  return { rawBody: Buffer.from(JSON.stringify(payload)), headers: { "x-kashier-signature": signature } };
}

describe("Kashier webhook secret resolution and signature contract", () => {
  const payload = { data: { signatureKeys: ["status", "orderReference"], status: "PENDING", orderReference: "ORDER 1" } };

  it("verifies the existing SHA-256 HMAC contract with the TEST scoped secret and tracks only its version", async () => {
    const env = kashierEnv();
    const provider = new KashierProvider({ env });
    const result = await provider.verifyWebhook(signedRequest(payload));
    expect(result).toEqual({ status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, payload, secretVersion: "test-v1" });
    expect(JSON.stringify(result)).not.toContain(TEST_ONLY_SIGNING_MATERIAL);
    expect(JSON.stringify(provider)).not.toContain(TEST_ONLY_SIGNING_MATERIAL);
  });

  it("verifies LIVE only with the explicitly selected LIVE secret and prevents cross-environment verification", async () => {
    const live = new KashierProvider({ env: kashierEnv("LIVE") });
    await expect(live.verifyWebhook(signedRequest(payload, LIVE_ONLY_SIGNING_MATERIAL)))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, secretVersion: "live-v1" });
    await expect(live.verifyWebhook(signedRequest(payload)))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
    const test = new KashierProvider({ env: kashierEnv("TEST") });
    await expect(test.verifyWebhook(signedRequest(payload, LIVE_ONLY_SIGNING_MATERIAL)))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
  });

  it("fails closed for missing scoped keys, unknown environments, and legacy-only keys", async () => {
    const missing = new KashierProvider({ env: { KASHIER_ENVIRONMENT: "TEST", KASHIER_TEST_API_KEY_VERSION: "test-v1" } });
    const unknown = new KashierProvider({ env: { ...kashierEnv(), KASHIER_ENVIRONMENT: "STAGING" } });
    const legacy = new KashierProvider({ env: { KASHIER_ENVIRONMENT: "TEST", KASHIER_API_KEY: TEST_ONLY_SIGNING_MATERIAL } });
    for (const provider of [missing, unknown, legacy]) {
      await expect(provider.verifyWebhook(signedRequest(payload)))
        .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER });
    }
  });

  it("preserves missing, malformed, invalid, wrong-key, modified-payload, and body validation behavior", async () => {
    const provider = new KashierProvider({ env: kashierEnv() });
    const valid = signedRequest(payload);
    await expect(provider.verifyWebhook({ ...valid, headers: { "x-kashier-signature": "0".repeat(64) } }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
    await expect(provider.verifyWebhook({ ...valid, headers: {} }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.MISSING_SIGNATURE });
    await expect(provider.verifyWebhook({ ...valid, headers: { "x-kashier-signature": "not-hex" } }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST });
    const modified = { ...payload, data: { ...payload.data, status: "SUCCESS" } };
    await expect(provider.verifyWebhook({ ...valid, rawBody: Buffer.from(JSON.stringify(modified)) }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
    await expect(provider.verifyWebhook({ rawBody: Buffer.from("not-json"), headers: { "x-kashier-signature": "0".repeat(64) } }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST });
    await expect(provider.verifyWebhook(signedRequest({ data: { signatureKeys: ["nullable"], nullable: null } })))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST });
  });

  it("reports previous metadata but never accepts a previous key; expiry and revocation reject versions", () => {
    const now = new Date("2026-11-03T00:00:00.000Z");
    const env = {
      ...kashierEnv(),
      KASHIER_TEST_PREVIOUS_API_KEY_VERSION: "test-v0",
      KASHIER_TEST_PREVIOUS_API_KEY_VALID_UNTIL: "2026-11-04T00:00:00.000Z",
      KASHIER_TEST_REVOKED_API_KEY_VERSIONS: "test-v9",
    };
    expect(getWebhookSecretMetadata({ provider: PROVIDERS.KASHIER, environment: "TEST" }, { env, now }).previous.status).toBe("PREVIOUS");
    expect(() => resolveWebhookSecret({ provider: PROVIDERS.KASHIER, environment: "TEST", secretVersion: "test-v0" }, { env, now }))
      .toThrow(expect.objectContaining({ code: "WEBHOOK_SECRET_PREVIOUS_NOT_ACCEPTED" }));
    expect(() => resolveWebhookSecret({ provider: PROVIDERS.KASHIER, environment: "TEST", secretVersion: "test-v9" }, { env, now }))
      .toThrow(expect.objectContaining({ code: "WEBHOOK_SECRET_REVOKED" }));

    const expired = { ...env, KASHIER_TEST_PREVIOUS_API_KEY_VALID_UNTIL: "2026-11-02T00:00:00.000Z" };
    expect(getWebhookSecretMetadata({ provider: PROVIDERS.KASHIER, environment: "TEST" }, { env: expired, now }).previous.status).toBe("REVOKED");
    expect(() => resolveWebhookSecret({ provider: PROVIDERS.KASHIER, environment: "TEST", secretVersion: "test-v0" }, { env: expired, now }))
      .toThrow(expect.objectContaining({ code: "WEBHOOK_SECRET_EXPIRED" }));
  });

  it("sanitizes secret resolver failures and leaves Paymob/Fawry unsupported", async () => {
    const exposed = TEST_ONLY_SIGNING_MATERIAL;
    const provider = new KashierProvider({ env: kashierEnv(), secretResolver: () => { throw new Error(`failed ${exposed}`); } });
    const result = await provider.verifyWebhook(signedRequest(payload));
    expect(result).toEqual({ status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER });
    expect(JSON.stringify(result)).not.toContain(exposed);
    const request = { rawBody: Buffer.from("{}"), headers: {} };
    await expect(new PaymobProvider().verifyWebhook(request)).resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER });
    await expect(new FawryProvider().verifyWebhook(request)).resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.UNSUPPORTED_VERIFICATION });
  });
});
