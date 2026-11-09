const BaseProviderAdapter = require("./baseProviderAdapter");
const { PROVIDERS } = require("./providerIdentifiers");
const { WEBHOOK_VERIFICATION_STATUS } = require("./webhookContract");
const { resolveWebhookSecret } = require("./providerConfig");
const crypto = require("crypto");

class KashierProvider extends BaseProviderAdapter {
  #env;
  #secretResolver;

  constructor({ env = process.env, secretResolver = resolveWebhookSecret } = {}) {
    super(PROVIDERS.KASHIER);
    this.#env = env;
    this.#secretResolver = secretResolver;
  }

  async verifyWebhook(request) {
    let resolvedSecret;
    try {
      resolvedSecret = this.#secretResolver({
        provider: PROVIDERS.KASHIER,
        environment: this.#env?.KASHIER_ENVIRONMENT,
      }, { env: this.#env });
    } catch {
      return { status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER };
    }
    if (!resolvedSecret || resolvedSecret.status !== "ACTIVE" || typeof resolvedSecret.secretValue !== "string" || !resolvedSecret.secretValue.trim()) {
      return { status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER };
    }
    if (!request || !Buffer.isBuffer(request.rawBody) || request.rawBody.length === 0 || request.rawBody.length > 10 * 1024) {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }

    const headers = request.headers || {};
    const signatureHeader = Object.entries(headers).find(([name]) => name.toLowerCase() === "x-kashier-signature")?.[1];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (typeof signature !== "string" || signature.length === 0) {
      return { status: WEBHOOK_VERIFICATION_STATUS.MISSING_SIGNATURE };
    }
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }

    let payload;
    try {
      payload = JSON.parse(request.rawBody.toString("utf8"));
    } catch {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }
    const data = payload?.data;
    const signatureKeys = data?.signatureKeys;
    if (!data || typeof data !== "object" || !Array.isArray(signatureKeys) || signatureKeys.length === 0 ||
        signatureKeys.length > 64 || signatureKeys.some((key) => typeof key !== "string" || !/^[A-Za-z0-9_]+$/.test(key) || !Object.prototype.hasOwnProperty.call(data, key))) {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }

    const values = [];
    for (const key of signatureKeys) {
      const value = data[key];
      if (!["string", "number", "boolean"].includes(typeof value)) {
        return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
      }
      values.push(encodeURIComponent(String(value)));
    }
    const signedValue = values.join("");
    const expected = crypto.createHmac("sha256", resolvedSecret.secretValue).update(signedValue, "utf8").digest();
    const supplied = Buffer.from(signature, "hex");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return { status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE };
    }
    return { status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, payload, secretVersion: resolvedSecret.version };
  }

  buildRequestDescriptor(command) {
    return super.buildRequestDescriptor(command, "payment_session_descriptor");
  }
}

module.exports = KashierProvider;
