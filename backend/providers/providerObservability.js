const { PROVIDERS } = require("./providerIdentifiers");
const { SAFE_PROVIDER_ERROR_CODES } = require("./providerErrors");

const SAFE_OPERATIONS = new Set(["createPayment", "authorize", "capture", "cancel", "refund", "getPayment", "verifyWebhook", "normalizeWebhookEvent"]);

function createSafeProviderLogRecord({ provider, operation, code, outcome = "unknown", correlationId = null, paymentId = null, elapsedMs = null }) {
  if (!Object.values(PROVIDERS).includes(provider) || !SAFE_OPERATIONS.has(operation)) {
    throw new Error("Invalid provider log context.");
  }
  return Object.freeze({
    event: "payment_provider_operation",
    provider,
    operation,
    code: SAFE_PROVIDER_ERROR_CODES.has(code) ? code : "PROVIDER_UNAVAILABLE",
    outcome: ["pending", "authorized", "captured", "failed", "cancelled", "unknown"].includes(outcome) ? outcome : "unknown",
    correlationId: typeof correlationId === "string" && /^[0-9a-f-]{36}$/i.test(correlationId) ? correlationId : null,
    paymentId: typeof paymentId === "string" && /^[0-9a-f-]{36}$/i.test(paymentId) ? paymentId : null,
    elapsedMs: Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
  });
}

module.exports = { createSafeProviderLogRecord };
