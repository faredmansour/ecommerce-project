const { PROVIDER_ERROR_CODES, PaymentProviderError } = require("./providerErrors");
const { PAYMENT_METHODS } = require("./providerIdentifiers");
const { isSafePaymentMetadata } = require("../utils/safePaymentMetadata");
const { isSupportedPaymentCurrency } = require("../utils/paymentCurrency");

const SENSITIVE_FIELD_NAMES = new Set([
  "pan", "cardnumber", "card_number", "primaryaccountnumber", "cvv", "cvc", "securitycode",
  "expiry", "expirydate", "expirymonth", "expiryyear", "walletpin", "pin", "otp",
  "onetimepassword", "otpcode", "cvv2", "cvc2", "track", "trackdata", "cardtoken", "paymenttoken",
  "clientsecret", "secretkey", "apikey", "authorization", "bearertoken",
]);

const CREATE_PAYMENT_FIELDS = new Set([
  "paymentId", "orderId", "amountMinor", "currency", "paymentMethodType", "idempotencyKey",
  "metadata",
]);

function invalid(message) {
  return new PaymentProviderError(PROVIDER_ERROR_CODES.INVALID_COMMAND, message);
}

function normalizedFieldName(value) {
  return String(value).replace(/[-_\s]/g, "").toLowerCase();
}

function assertNoSensitiveFields(value, path = "command", seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedFieldName(key);
    if (SENSITIVE_FIELD_NAMES.has(normalized)) {
      throw new PaymentProviderError(
        PROVIDER_ERROR_CODES.SENSITIVE_DATA_REJECTED,
        "Sensitive payment data is not accepted by provider adapters."
      );
    }
    assertNoSensitiveFields(entry, path, seen);
  }
}

function normalizeCreatePaymentCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw invalid("Provider payment command must be an object.");
  }

  assertNoSensitiveFields(command);

  const unknown = Object.keys(command).find((key) => !CREATE_PAYMENT_FIELDS.has(key));
  if (unknown) throw invalid("Provider payment command contains unsupported fields.");

  if (typeof command.paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(command.paymentId)) {
    throw invalid("paymentId must be an internal UUID reference.");
  }
  if (typeof command.orderId !== "string" || !/^[0-9a-f]{24}$/i.test(command.orderId)) {
    throw invalid("orderId must be an internal Order reference.");
  }
  if (!Number.isSafeInteger(command.amountMinor) || command.amountMinor < 1) {
    throw invalid("amountMinor must be a positive safe integer from the server-side Order snapshot.");
  }
  if (!isSupportedPaymentCurrency(command.currency)) {
    throw invalid("currency must be a supported uppercase ISO 4217 code.");
  }
  if (!Object.values(PAYMENT_METHODS).includes(command.paymentMethodType)) {
    throw invalid("paymentMethodType is not a known provider-neutral method identifier.");
  }
  if (typeof command.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(command.idempotencyKey)) {
    throw invalid("idempotencyKey is invalid.");
  }
  if (command.metadata !== undefined && !isSafePaymentMetadata(command.metadata)) {
    throw invalid("metadata must contain only the allowed non-sensitive payment context.");
  }

  return Object.freeze({
    paymentId: command.paymentId,
    orderId: command.orderId,
    amountMinor: command.amountMinor,
    currency: command.currency,
    paymentMethodType: command.paymentMethodType,
    idempotencyKey: command.idempotencyKey,
    metadata: Object.freeze({ ...(command.metadata || {}) }),
  });
}

module.exports = { CREATE_PAYMENT_FIELDS, SENSITIVE_FIELD_NAMES, assertNoSensitiveFields, normalizeCreatePaymentCommand };
