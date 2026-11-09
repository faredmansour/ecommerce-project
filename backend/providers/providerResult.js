const { PROVIDERS } = require("./providerIdentifiers");
const { PaymentProviderError, PROVIDER_ERROR_CODES, SAFE_PROVIDER_ERROR_CODES } = require("./providerErrors");
const { normalizeCreatePaymentCommand, assertNoSensitiveFields } = require("./providerInput");

const PROVIDER_OUTCOMES = Object.freeze(["pending", "requires_action", "authorized", "captured", "failed", "cancelled", "unknown"]);
const RESULT_FIELDS = new Set([
  "provider", "paymentId", "orderId", "providerPaymentId", "providerReference", "providerTransactionId", "status",
  "amountMinor", "currency", "paymentMethodType", "idempotencyKey", "checkoutUrl", "expiresAt", "errorCode", "metadata", "environment",
]);

function createProviderPaymentResult(input) {
  if (!input || !Object.values(PROVIDERS).includes(input.provider)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "A known canonical provider is required.");
  }
  assertNoSensitiveFields(input, "result");
  const unknown = Object.keys(input).find((key) => !RESULT_FIELDS.has(key));
  if (unknown) throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider result contains unsupported fields.");
  const command = normalizeCreatePaymentCommand({
    paymentId: input.paymentId,
    orderId: input.orderId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    paymentMethodType: input.paymentMethodType,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
  });
  if (!PROVIDER_OUTCOMES.includes(input.status)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider result status is invalid.");
  }
  if (input.environment !== undefined && !["TEST", "LIVE"].includes(input.environment)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider result environment is invalid.");
  }
  if (input.providerPaymentId !== undefined && (typeof input.providerPaymentId !== "string" || input.providerPaymentId.length < 1 || input.providerPaymentId.length > 200)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider payment ID is invalid.");
  }
  if (input.providerReference !== undefined && (typeof input.providerReference !== "string" || input.providerReference.length < 1 || input.providerReference.length > 200)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider reference is invalid.");
  }
  if (input.providerTransactionId !== undefined && (typeof input.providerTransactionId !== "string" || input.providerTransactionId.length < 1 || input.providerTransactionId.length > 200)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider transaction reference is invalid.");
  }
  if (input.errorCode !== undefined && input.errorCode !== null && !SAFE_PROVIDER_ERROR_CODES.has(input.errorCode)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Provider error code is invalid.");
  }
  if (input.checkoutUrl !== undefined) {
    let url;
    try { url = new URL(input.checkoutUrl); } catch { throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Checkout URL is invalid."); }
    if (url.protocol !== "https:") throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Checkout URL must use HTTPS.");
  }
  if (input.expiresAt !== undefined && !(input.expiresAt instanceof Date && Number.isFinite(input.expiresAt.getTime()))) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "expiresAt must be a valid Date.");
  }

  const result = {
    provider: input.provider,
    paymentId: command.paymentId,
    orderId: command.orderId,
    status: input.status,
    amountMinor: command.amountMinor,
    currency: command.currency,
    paymentMethodType: command.paymentMethodType,
  };
  if (input.providerPaymentId !== undefined) result.providerPaymentId = input.providerPaymentId;
  if (input.providerReference !== undefined) result.providerReference = input.providerReference;
  if (input.providerTransactionId !== undefined) result.providerTransactionId = input.providerTransactionId;
  if (input.checkoutUrl !== undefined) result.checkoutUrl = input.checkoutUrl;
  if (input.expiresAt !== undefined) result.expiresAt = input.expiresAt;
  if (input.environment !== undefined) result.environment = input.environment;
  if (input.errorCode !== undefined && input.errorCode !== null) result.errorCode = input.errorCode;
  return Object.freeze(result);
}

function normalizeProviderError(provider, operation, error) {
  const knownCode = SAFE_PROVIDER_ERROR_CODES.has(error?.code) ? error.code : "PROVIDER_UNAVAILABLE";
  return Object.freeze({
    provider: Object.values(PROVIDERS).includes(provider) ? provider : null,
    operation: ["createPayment", "authorize", "capture", "cancel", "refund", "getPayment", "verifyWebhook", "normalizeWebhookEvent"].includes(operation) ? operation : "unknown",
    code: knownCode,
    retryable: false,
    outcome: "unknown",
    message: "Provider operation did not complete. Reconcile before retrying.",
  });
}

module.exports = { PROVIDER_OUTCOMES, createProviderPaymentResult, normalizeProviderError };
