const crypto = require("crypto");
const Joi = require("joi");
const providerRegistry = require("../providers");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { PROVIDER_ERROR_CODES } = require("../providers/providerErrors");
const { normalizeProviderError } = require("../providers/providerResult");
const { assertNoSensitiveFields } = require("../providers/providerInput");
const { isSupportedPaymentCurrency } = require("../utils/paymentCurrency");
const { WEBHOOK_VERIFICATION_STATUS } = require("../providers/webhookContract");
const logger = require("../utils/logger");
const { PaymentWebhookQueue } = require("./paymentWebhookQueue");
const { readProviderConfig } = require("../providers/providerConfig");

const canonicalEventSchema = Joi.object({
  provider: Joi.string().valid(...Object.values(PROVIDERS)).required(),
  providerEventId: Joi.string().trim().min(1).max(200).required(),
  providerTransactionReference: Joi.when("provider", {
    is: "paymob",
    then: Joi.string().trim().min(1).max(200).required(),
    otherwise: Joi.forbidden(),
  }),
  providerOrderReference: Joi.when("provider", {
    is: "paymob",
    then: Joi.string().trim().min(1).max(200),
    otherwise: Joi.forbidden(),
  }),
  paymentReference: Joi.string().guid({ version: ["uuidv4"] }),
  providerPaymentReference: Joi.string().trim().min(1).max(200),
  eventType: Joi.string().valid("payment_pending", "payment_requires_action", "payment_authorized", "payment_captured", "payment_failed", "payment_cancelled").required(),
  status: Joi.string().valid("pending", "requires_action", "authorized", "captured", "failed", "cancelled").required(),
  amountMinor: Joi.number().integer().positive().unsafe(false).required(),
  currency: Joi.string().custom((currency, helpers) => (
    isSupportedPaymentCurrency(currency) ? currency : helpers.error("any.invalid")
  )).required(),
  occurredAt: Joi.date().optional(),
}).unknown(false);

const WEBHOOK_ERRORS = Object.freeze({
  WEBHOOK_UNSUPPORTED_PROVIDER: { status: 400, message: "Webhook provider is unsupported." },
  WEBHOOK_DISABLED_PROVIDER: { status: 503, message: "Webhook provider is disabled." },
  WEBHOOK_PROVIDER_UNCONFIGURED: { status: 503, message: "Webhook verification is not configured." },
  WEBHOOK_PROVIDER_SIGNATURE_UNSUPPORTED: { status: 501, message: "Provider webhook verification is not supported by the current adapter contract." },
  WEBHOOK_INVALID_SIGNATURE: { status: 401, message: "Webhook signature is invalid." },
  WEBHOOK_MISSING_SIGNATURE: { status: 401, message: "Webhook signature is required." },
  WEBHOOK_MALFORMED_REQUEST: { status: 400, message: "Webhook request is malformed." },
  WEBHOOK_UNSUPPORTED_EVENT: { status: 422, message: "Webhook event is unsupported." },
  WEBHOOK_EVENT_CONFLICT: { status: 409, message: "Webhook event conflicts with a previously received event." },
  WEBHOOK_PAYMENT_REFERENCE_NOT_FOUND: { status: 404, message: "Webhook does not match a Payment." },
  WEBHOOK_ORDER_SNAPSHOT_INVALID: { status: 409, message: "Payment Order is not eligible for webhook processing." },
  PAYMENT_AMOUNT_MISMATCH: { status: 409, message: "Webhook amount does not match the Payment and Order." },
  PAYMENT_CURRENCY_MISMATCH: { status: 409, message: "Webhook currency does not match the Payment and Order." },
  WEBHOOK_STATE_CONFLICT: { status: 409, message: "Webhook event is not valid for the current Payment state." },
  WEBHOOK_VERIFICATION_UNAVAILABLE: { status: 503, message: "Webhook verification is unavailable." },
});

function webhookError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

function verificationFailure(provider, error) {
  const normalized = normalizeProviderError(provider, "verifyWebhook", error);
  const code = normalized.code === PROVIDER_ERROR_CODES.DISABLED
    ? "WEBHOOK_DISABLED_PROVIDER"
    : normalized.code === PROVIDER_ERROR_CODES.NOT_CONFIGURED
      ? "WEBHOOK_PROVIDER_UNCONFIGURED"
      : "WEBHOOK_VERIFICATION_UNAVAILABLE";
  const response = WEBHOOK_ERRORS[code];
  return webhookError(code, response.message, response.status);
}

function signatureHeaders(headers = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(headers).filter(([name]) => /signature|timestamp|event-id/i.test(name))
  ));
}

class ProviderWebhookService {
  constructor({ registry = providerRegistry, paymentService, queue, env = process.env } = {}) {
    this.registry = registry;
    this.env = env;
    if (!paymentService || typeof paymentService.receiveVerifiedWebhook !== "function") {
      throw new TypeError("ProviderWebhookService requires PaymentService.receiveVerifiedWebhook.");
    }
    this.paymentService = paymentService;
    this.queue = queue || new PaymentWebhookQueue();
  }

  async ingest({ provider, rawBody, headers, signature }) {
    if (!Object.values(PROVIDERS).includes(provider)) {
      throw webhookError("WEBHOOK_UNSUPPORTED_PROVIDER", WEBHOOK_ERRORS.WEBHOOK_UNSUPPORTED_PROVIDER.message, 400);
    }
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 10 * 1024) {
      throw webhookError("WEBHOOK_MALFORMED_REQUEST", WEBHOOK_ERRORS.WEBHOOK_MALFORMED_REQUEST.message, 400);
    }

    let adapter;
    try {
      const paymobTestEnabled = provider === PROVIDERS.PAYMOB && this.env?.PAYMOB_ENVIRONMENT === "TEST" &&
        this.env?.PAYMOB_TEST_EXECUTION_ENABLED === "true";
      adapter = this.registry.resolveProvider(provider, {
        enabledProviders: paymobTestEnabled ? [PROVIDERS.PAYMOB] : [],
        configReader: (target) => readProviderConfig(target, this.env),
      });
    } catch (error) {
      throw verificationFailure(provider, error);
    }

    let verification;
    try {
      verification = await adapter.verifyWebhook({ rawBody, headers: signatureHeaders(headers), signature });
    } catch (error) {
      throw verificationFailure(provider, error);
    }
    if (!verification || !Object.values(WEBHOOK_VERIFICATION_STATUS).includes(verification.status)) {
      throw webhookError("WEBHOOK_VERIFICATION_UNAVAILABLE", WEBHOOK_ERRORS.WEBHOOK_VERIFICATION_UNAVAILABLE.message, 503);
    }
    if (verification.status !== WEBHOOK_VERIFICATION_STATUS.VERIFIED) {
      const code = verification.status === WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE
        ? "WEBHOOK_INVALID_SIGNATURE"
        : verification.status === WEBHOOK_VERIFICATION_STATUS.MISSING_SIGNATURE
          ? "WEBHOOK_MISSING_SIGNATURE"
          : verification.status === WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST
            ? "WEBHOOK_MALFORMED_REQUEST"
            : verification.status === WEBHOOK_VERIFICATION_STATUS.UNSUPPORTED_PROVIDER
              ? "WEBHOOK_UNSUPPORTED_PROVIDER"
              : verification.status === WEBHOOK_VERIFICATION_STATUS.UNSUPPORTED_VERIFICATION
                ? "WEBHOOK_PROVIDER_SIGNATURE_UNSUPPORTED"
              : "WEBHOOK_DISABLED_PROVIDER";
      const response = WEBHOOK_ERRORS[code];
      throw webhookError(code, response.message, response.status);
    }
    if (!verification.payload || typeof verification.payload !== "object" || Buffer.isBuffer(verification.payload)) {
      throw webhookError("WEBHOOK_MALFORMED_REQUEST", WEBHOOK_ERRORS.WEBHOOK_MALFORMED_REQUEST.message, 400);
    }
    try {
      assertNoSensitiveFields(verification.payload, "verifiedWebhookPayload");
    } catch {
      throw webhookError("WEBHOOK_MALFORMED_REQUEST", WEBHOOK_ERRORS.WEBHOOK_MALFORMED_REQUEST.message, 400);
    }

    let canonicalEvent;
    try {
      canonicalEvent = await adapter.normalizeWebhookEvent(verification.payload);
    } catch (error) {
      const normalized = normalizeProviderError(provider, "normalizeWebhookEvent", error);
      const code = normalized.code === PROVIDER_ERROR_CODES.OPERATION_DEFERRED
        ? "WEBHOOK_VERIFICATION_UNAVAILABLE"
        : "WEBHOOK_UNSUPPORTED_EVENT";
      const response = WEBHOOK_ERRORS[code];
      throw webhookError(code, response.message, response.status);
    }

    const { value, error } = canonicalEventSchema.validate(canonicalEvent, { abortEarly: false, convert: false });
    const hasPaymentBinding = Boolean(value.paymentReference && value.providerPaymentReference);
    const hasDeferredBinding = provider === PROVIDERS.PAYMOB && Boolean(value.providerOrderReference) &&
      !value.paymentReference && !value.providerPaymentReference;
    if (error || value.provider !== provider || value.eventType !== `payment_${value.status}` ||
        (!hasPaymentBinding && !hasDeferredBinding) ||
        (Boolean(value.paymentReference) !== Boolean(value.providerPaymentReference))) {
      throw webhookError("WEBHOOK_UNSUPPORTED_EVENT", WEBHOOK_ERRORS.WEBHOOK_UNSUPPORTED_EVENT.message, 422);
    }

    const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const receipt = await this.paymentService.receiveVerifiedWebhook({ ...value, payloadHash });
    await this.queue.enqueue(receipt.eventId);
    logger.info(JSON.stringify({
      event: receipt.duplicate ? "webhook.duplicate" : "webhook.received",
      eventId: receipt.eventId,
      provider,
      providerEventId: value.providerEventId,
      paymentId: receipt.paymentId,
      processingStatus: "RECEIVED",
    }));
    return { accepted: true, duplicate: receipt.duplicate, eventId: receipt.eventId };
  }
}

module.exports = { ProviderWebhookService, WEBHOOK_VERIFICATION_STATUS, WEBHOOK_ERRORS, canonicalEventSchema };
