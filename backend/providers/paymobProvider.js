const BaseProviderAdapter = require("./baseProviderAdapter");
const { PROVIDERS } = require("./providerIdentifiers");
const { resolveProviderSecret, readProviderConfig } = require("./providerConfig");
const PaymentExecutionAttemptRepository = require("../repositories/paymentExecutionAttemptRepository");
const { normalizeCreatePaymentCommand } = require("./providerInput");
const { PaymentProviderError, PROVIDER_ERROR_CODES } = require("./providerErrors");
const crypto = require("crypto");
const { WEBHOOK_VERIFICATION_STATUS } = require("./webhookContract");
const { resolveWebhookSecret } = require("./providerConfig");
const { getEncryptionConfiguration } = require("../utils/paymobCheckoutResultCrypto");

const INTENTION_URL = "https://accept.paymob.com/v1/intention/";
const CHECKOUT_URL = "https://eg.checkout.paymob.com/";
const AUTH_TOKEN_URL = "https://accept.paymob.com/api/auth/tokens";
const TRANSACTION_INQUIRY_URL = "https://accept.paymob.com/api/acceptance/transactions/";
const REQUEST_TIMEOUT_MS = 10000;
const TOKEN_EXPIRY_SKEW_MS = 30000;

function providerError(code, message, operation = "createPayment") {
  return new PaymentProviderError(code, message, { provider: PROVIDERS.PAYMOB, operation });
}

function requireTestConfiguration(env) {
  if (env?.PAYMOB_ENVIRONMENT === "LIVE") {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob LIVE execution is unavailable.");
  }
  if (env?.PAYMOB_ENVIRONMENT !== "TEST" || env?.PAYMOB_TEST_EXECUTION_ENABLED !== "true") {
    throw providerError(PROVIDER_ERROR_CODES.DISABLED, "Paymob TEST execution is disabled.");
  }
  const configuration = readProviderConfig(PROVIDERS.PAYMOB, env);
  if (!configuration.configured) {
    throw providerError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Paymob TEST configuration is incomplete.");
  }

  const configuredBaseUrl = env.PAYMOB_TEST_API_BASE_URL;
  if (configuredBaseUrl !== "https://accept.paymob.com" && configuredBaseUrl !== "https://accept.paymob.com/") {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob TEST API endpoint is invalid.");
  }
  const integrationId = env.PAYMOB_TEST_INTEGRATION_ID;
  if (!/^\d{1,12}$/.test(integrationId || "") || Number(integrationId) < 1) {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob TEST integration configuration is invalid.");
  }
  if (!/(?:^|_)sk_test_[A-Za-z0-9_-]+$/.test(env.PAYMOB_TEST_SECRET_KEY || "") ||
      !/(?:^|_)pk_test_[A-Za-z0-9_-]+$/.test(env.PAYMOB_TEST_PUBLIC_KEY || "")) {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob TEST credentials are unavailable.");
  }
  try {
    getEncryptionConfiguration(env);
  } catch {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob checkout result encryption is not configured.");
  }
  return { integrationId: Number(integrationId), publicKey: env.PAYMOB_TEST_PUBLIC_KEY };
}

function splitName(fullName) {
  if (typeof fullName !== "string") return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function normalizeCountry(country) {
  const value = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (["EG", "EGY", "EGYPT"].includes(value)) return "EG";
  return null;
}

function buildIntentionPayload(command, integrationId) {
  const context = command.paymobOrderContext;
  const order = context?.order;
  const customerEmail = context?.customerEmail;
  const address = order?.shippingAddress;
  const names = splitName(address?.fullName);
  const country = normalizeCountry(address?.country);
  if (!order || !names || !country || !/^\S+@\S+\.\S+$/.test(customerEmail || "") ||
      typeof address.phone !== "string" || !address.phone.trim() ||
      typeof address.line1 !== "string" || !address.line1.trim() ||
      typeof address.city !== "string" || !address.city.trim()) {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Persisted Order billing data is incomplete for Paymob.");
  }

  const items = order.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Persisted Order items are unavailable for Paymob.");
  }
  let itemsTotal = 0;
  const intentionItems = items.map((item) => {
    if (typeof item.name !== "string" || !item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        !Number.isSafeInteger(item.lineTotalMinor) || item.lineTotalMinor < 1 ||
        !Number.isSafeInteger(itemsTotal + item.lineTotalMinor)) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Persisted Order items are invalid for Paymob.");
    }
    itemsTotal += item.lineTotalMinor;
    return { name: item.name, amount: item.lineTotalMinor, quantity: item.quantity };
  });
  if (itemsTotal !== command.amountMinor) {
    throw providerError(PROVIDER_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, "Paymob item amounts do not match the authoritative Order total.");
  }

  return {
    amount: command.amountMinor,
    currency: command.currency,
    payment_methods: [integrationId],
    items: intentionItems,
    billing_data: {
      ...names,
      phone_number: address.phone.trim(),
      street: address.line1.trim(),
      building: "NA",
      apartment: typeof address.line2 === "string" && address.line2.trim() ? address.line2.trim() : "NA",
      floor: "NA",
      city: address.city.trim(),
      state: typeof address.state === "string" && address.state.trim() ? address.state.trim() : address.city.trim(),
      country,
      postal_code: typeof address.postalCode === "string" && address.postalCode.trim() ? address.postalCode.trim() : "NA",
      email: customerEmail.trim(),
    },
    special_reference: command.paymentId,
  };
}

function createCheckoutUrl(publicKey, clientSecret) {
  const url = new URL(CHECKOUT_URL);
  url.searchParams.set("publicKey", publicKey);
  url.searchParams.set("clientSecret", clientSecret);
  return url.toString();
}

function validateResponse(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.id !== "string" || !/^pi_test_[A-Za-z0-9_-]+$/.test(body.id) ||
      !Number.isSafeInteger(body.intention_order_id) || body.intention_order_id < 1 ||
      typeof body.client_secret !== "string" || !/(?:^|_)csk_test_[A-Za-z0-9_-]+$/.test(body.client_secret) ||
      body.status !== "intended" || body.confirmed !== false) {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob returned an invalid TEST checkout response.");
  }
  return body;
}

function requireInquiryConfiguration(env, secretResolver) {
  if (env?.PAYMOB_ENVIRONMENT !== "TEST" || env?.PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED !== "true") {
    throw providerError(PROVIDER_ERROR_CODES.DISABLED, "Paymob TEST transaction inquiry is disabled.", "getPayment");
  }
  if (env.PAYMOB_TEST_API_BASE_URL !== "https://accept.paymob.com" &&
      env.PAYMOB_TEST_API_BASE_URL !== "https://accept.paymob.com/") {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob TEST API endpoint is invalid.", "getPayment");
  }
  if (!/^\d{1,12}$/.test(env.PAYMOB_TEST_INTEGRATION_ID || "") || Number(env.PAYMOB_TEST_INTEGRATION_ID) < 1) {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob TEST integration configuration is invalid.", "getPayment");
  }
  let apiKey;
  try {
    apiKey = secretResolver({ provider: PROVIDERS.PAYMOB, environment: "TEST", field: "API_KEY" }, { env });
  } catch {
    throw providerError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Paymob TEST API Key is unavailable.", "getPayment");
  }
  if (!apiKey || typeof apiKey.secretValue !== "string" || !apiKey.secretValue.trim()) {
    throw providerError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Paymob TEST API Key is unavailable.", "getPayment");
  }
  return { integrationId: Number(env.PAYMOB_TEST_INTEGRATION_ID), apiKey: apiKey.secretValue };
}

function readTokenExpiry(token, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!Number.isSafeInteger(claims.exp)) return null;
    const expiresAt = claims.exp * 1000;
    return expiresAt > now + TOKEN_EXPIRY_SKEW_MS ? expiresAt - TOKEN_EXPIRY_SKEW_MS : null;
  } catch {
    return null;
  }
}

function validateInquiryResponse(body, { transactionId, integrationId, amountMinor, currency, orderReference }) {
  const invalid = () => {
    throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
      "Paymob TEST transaction inquiry response is incomplete or inconsistent.", "getPayment");
  };
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Number.isSafeInteger(body.id) || body.id < 1 || String(body.id) !== transactionId ||
      body.integration_id !== integrationId || body.is_live !== false ||
      typeof body.integration_type !== "string" || !body.integration_type.trim() || body.integration_type.length > 100 ||
      typeof body.currency !== "string" || body.currency !== currency ||
      !Number.isSafeInteger(body.amount_cents) || body.amount_cents !== amountMinor ||
      (body.amount_cents_int !== undefined &&
        (!Number.isSafeInteger(body.amount_cents_int) || body.amount_cents_int !== body.amount_cents)) ||
      typeof body.pending !== "boolean" || typeof body.success !== "boolean" ||
      typeof body.error_occured !== "boolean" ||
      typeof body.is_auth !== "boolean" || typeof body.is_capture !== "boolean" ||
      typeof body.is_standalone_payment !== "boolean" || typeof body.is_captured !== "boolean" ||
      !Number.isSafeInteger(body.captured_amount) || body.captured_amount < 0 ||
      (body.captured_amount_int !== undefined &&
        (!Number.isSafeInteger(body.captured_amount_int) || body.captured_amount_int !== body.captured_amount)) ||
      typeof body.is_voided !== "boolean" || typeof body.is_refunded !== "boolean" ||
      typeof body.has_parent_transaction !== "boolean" ||
      !body.order || !Number.isSafeInteger(body.order.id) || body.order.id < 1 ||
      String(body.order.id) !== orderReference ||
      (body.has_parent_transaction
        ? typeof body.parent_transaction !== "string" || !/^[1-9]\d{0,15}$/.test(body.parent_transaction) ||
          !Number.isSafeInteger(Number(body.parent_transaction)) || Number(body.parent_transaction) === body.id
        : body.parent_transaction !== undefined && body.parent_transaction !== null && body.parent_transaction !== "")) {
    invalid();
  }
  if (body.is_voided || body.is_refunded ||
      (body.success && body.error_occured) ||
      (body.is_captured && (body.captured_amount !== body.amount_cents || body.pending || !body.success)) ||
      (!body.is_captured && body.captured_amount !== 0) ||
      (body.is_capture && !body.is_captured) ||
      (body.is_capture && !body.has_parent_transaction) ||
      (body.is_standalone_payment && body.has_parent_transaction) ||
      (body.is_auth && (body.is_captured || body.is_standalone_payment)) ||
      (!body.success && (body.is_auth || body.is_capture || body.is_captured || body.captured_amount !== 0)) ||
      (body.is_capture && body.is_standalone_payment)) {
    invalid();
  }
  if (body.is_captured &&
      !(body.is_standalone_payment && !body.is_auth && !body.is_capture && !body.has_parent_transaction) &&
      !(body.is_capture && !body.is_standalone_payment && body.has_parent_transaction)) {
    invalid();
  }

  let status;
  if (body.pending) status = "pending";
  else if (!body.success) status = "failed";
  else if (body.is_captured) status = "captured";
  else if (body.is_auth) status = "authorized";
  else invalid();

  return Object.freeze({
    provider: PROVIDERS.PAYMOB,
    providerTransactionId: String(body.id),
    orderReference: String(body.order.id),
    status,
    pending: body.pending,
    success: body.success,
    errorOccurred: body.error_occured,
    amountMinor: body.amount_cents,
    currency: body.currency,
    capturedAmountMinor: body.captured_amount,
    isCaptured: body.is_captured,
    integrationId: body.integration_id,
    integrationType: body.integration_type,
    isLive: body.is_live,
    hasParentTransaction: body.has_parent_transaction,
    parentTransactionId: body.has_parent_transaction ? String(Number(body.parent_transaction)) : null,
    parentRelationshipVerified: !body.has_parent_transaction,
    isAuth: body.is_auth,
    isCapture: body.is_capture,
    isStandalonePayment: body.is_standalone_payment,
    isVoided: body.is_voided,
    isRefunded: body.is_refunded,
    observedAt: typeof body.updated_at === "string" && Number.isFinite(Date.parse(body.updated_at))
      ? new Date(body.updated_at)
      : typeof body.created_at === "string" && Number.isFinite(Date.parse(body.created_at))
        ? new Date(body.created_at)
        : new Date(),
  });
}

class PaymobProvider extends BaseProviderAdapter {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, secretResolver = resolveProviderSecret,
    attemptRepository = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    super(PROVIDERS.PAYMOB);
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.secretResolver = secretResolver;
    this.attempts = attemptRepository || new PaymentExecutionAttemptRepository({ env });
    this.timeoutMs = timeoutMs;
    this.authToken = null;
    this.authTokenExpiresAt = 0;
    this.authTokenPromise = null;
  }

  async waitForExistingAttempt(paymentId) {
    const deadline = Date.now() + this.timeoutMs + 500;
    let attempt;
    do {
      attempt = await this.attempts.findByPaymentId(paymentId);
      if (!attempt || attempt.status !== "REQUESTING") return attempt;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    return attempt;
  }

  async fetchAuthToken(apiKey) {
    if (typeof this.fetchImpl !== "function") {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob transport is unavailable.", "getPayment");
    }
    let response;
    let body;
    try {
      response = await this.fetchImpl(AUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      body = await response.json();
    } catch {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob TEST authentication request failed.", "getPayment");
    }
    if (!response.ok || !body || typeof body.token !== "string" || !body.token) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_AUTHENTICATION_FAILED, "Paymob TEST authentication response is invalid.", "getPayment");
    }
    const expiresAt = readTokenExpiry(body.token);
    if (!expiresAt) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_AUTHENTICATION_FAILED, "Paymob TEST auth token has no usable expiry.", "getPayment");
    }
    this.authToken = body.token;
    this.authTokenExpiresAt = expiresAt;
    return body.token;
  }

  async getAuthToken(apiKey) {
    if (this.authToken && Date.now() < this.authTokenExpiresAt) return this.authToken;
    if (!this.authTokenPromise) {
      this.authTokenPromise = this.fetchAuthToken(apiKey).finally(() => {
        this.authTokenPromise = null;
      });
    }
    return this.authTokenPromise;
  }

  async inquirePayment(payment) {
    if (!payment || payment.provider !== PROVIDERS.PAYMOB ||
        typeof payment.paymentId !== "string" || typeof payment.providerTransactionId !== "string" ||
        !/^\d+$/.test(payment.providerTransactionId) ||
        !Number.isSafeInteger(payment.amountMinor) || typeof payment.currency !== "string") {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Stored Paymob transaction references are invalid.", "getPayment");
    }
    const attempt = await this.attempts.findPaymobSessionByPaymentId(payment.paymentId);
    if (!attempt || attempt.providerPaymentId !== payment.providerPaymentId ||
        typeof attempt.providerReference !== "string" || !/^\d+$/.test(attempt.providerReference)) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Stored Paymob order reference is unavailable or inconsistent.", "getPayment");
    }
    return this.inquireTransaction({
      transactionId: payment.providerTransactionId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      orderReference: attempt.providerReference,
    });
  }

  async inquireTransaction({ transactionId, amountMinor, currency, orderReference }) {
    const { integrationId, apiKey } = requireInquiryConfiguration(this.env, this.secretResolver);
    if (typeof transactionId !== "string" || !/^\d+$/.test(transactionId) ||
        !Number.isSafeInteger(amountMinor) || amountMinor < 1 ||
        typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) ||
        typeof orderReference !== "string" || !/^\d+$/.test(orderReference)) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob transaction inquiry command is invalid.", "getPayment");
    }
    const token = await this.getAuthToken(apiKey);
    let response;
    let body;
    try {
      response = await this.fetchImpl(`${TRANSACTION_INQUIRY_URL}${encodeURIComponent(transactionId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      body = await response.json();
    } catch {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob TEST transaction inquiry failed.", "getPayment");
    }
    if (!response.ok) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob TEST transaction inquiry was not successful.", "getPayment");
    }
    return validateInquiryResponse(body, { transactionId, integrationId, amountMinor, currency, orderReference });
  }

  buildRequestDescriptor(command) {
    return super.buildRequestDescriptor(command, "payment_intention_session_descriptor");
  }

  async createPayment(command) {
    if (!command || typeof command !== "object") {
      throw providerError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Paymob payment command is invalid.");
    }
    const { paymobOrderContext, ...providerCommand } = command;
    const normalized = normalizeCreatePaymentCommand(providerCommand);
    if (normalized.currency !== "EGP" || normalized.paymentMethodType !== "card") {
      throw providerError(PROVIDER_ERROR_CODES.UNSUPPORTED_PAYMENT_METHOD, "Paymob TEST checkout supports only the configured EGP card flow.");
    }
    const { integrationId, publicKey } = requireTestConfiguration(this.env);
    let resolved;
    try {
      resolved = this.secretResolver({ provider: PROVIDERS.PAYMOB, environment: "TEST", field: "SECRET_KEY" }, { env: this.env });
    } catch {
      throw providerError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Paymob TEST secret is unavailable.");
    }
    if (!resolved || typeof resolved.secretValue !== "string" || !/(?:^|_)sk_test_[A-Za-z0-9_-]+$/.test(resolved.secretValue)) {
      throw providerError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Paymob TEST secret is unavailable.");
    }
    const body = buildIntentionPayload({ ...normalized, paymobOrderContext }, integrationId);
    if (typeof this.fetchImpl !== "function") {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob transport is unavailable.");
    }

    let reserved;
    try {
      reserved = await this.attempts.reserve({ paymentId: normalized.paymentId, orderId: normalized.orderId, provider: PROVIDERS.PAYMOB });
    } catch {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob execution could not be reserved safely.");
    }
    if (!reserved) {
      const priorAttempt = typeof this.attempts.findByPaymentId === "function"
        ? await this.waitForExistingAttempt(normalized.paymentId)
        : null;
      if (priorAttempt?.status === "SESSION_CREATED" && priorAttempt.checkoutUrl &&
          priorAttempt.providerPaymentId && priorAttempt.providerReference) {
        return {
          provider: PROVIDERS.PAYMOB,
          paymentId: normalized.paymentId,
          orderId: normalized.orderId,
          amountMinor: normalized.amountMinor,
          currency: normalized.currency,
          paymentMethodType: normalized.paymentMethodType,
          idempotencyKey: normalized.idempotencyKey,
          providerPaymentId: priorAttempt.providerPaymentId,
          providerReference: priorAttempt.providerReference,
          checkoutUrl: priorAttempt.checkoutUrl,
          status: "pending",
          environment: "TEST",
        };
      }
      if (priorAttempt?.status === "REQUESTING") {
        throw providerError("PROVIDER_EXECUTION_IN_PROGRESS", "Paymob execution is still in progress; retry with the same idempotency key.");
      }
      throw providerError(PROVIDER_ERROR_CODES.PAYMENT_ALREADY_PROCESSED, "Paymob execution was already attempted for this Payment or Order.");
    }

    let response;
    let responseText;
    try {
      response = await this.fetchImpl(INTENTION_URL, {
        method: "POST",
        headers: { Authorization: `Token ${resolved.secretValue}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      responseText = await response.text();
    } catch (error) {
      await this.attempts.mark(normalized.paymentId, "UNKNOWN", { errorCode: error?.name === "TimeoutError" || error?.name === "AbortError" ? PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT : PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE });
      const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      throw providerError(timeout ? PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT : PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE,
        timeout ? "Paymob TEST request timed out; reconcile before another attempt." : "Paymob TEST request outcome is unknown; reconcile before another attempt.");
    }

    if (response.status === 401 || response.status === 403) {
      await this.attempts.mark(normalized.paymentId, "REJECTED", { errorCode: PROVIDER_ERROR_CODES.PROVIDER_AUTHENTICATION_FAILED });
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_AUTHENTICATION_FAILED, "Paymob rejected TEST authentication.");
    }
    if (response.status >= 400 && response.status < 500) {
      await this.attempts.mark(normalized.paymentId, "REJECTED", { errorCode: "PROVIDER_REJECTED" });
      throw providerError("PROVIDER_REJECTED", "Paymob rejected the TEST checkout request.");
    }
    if (response.status !== 201) {
      await this.attempts.mark(normalized.paymentId, "UNKNOWN", { errorCode: PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE });
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob TEST response outcome is unknown; reconcile before another attempt.");
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      await this.attempts.mark(normalized.paymentId, "UNKNOWN", { errorCode: "INVALID_PROVIDER_RESPONSE" });
      throw providerError("INVALID_PROVIDER_RESPONSE", "Paymob TEST response could not be validated.");
    }
    let result;
    try {
      const intention = validateResponse(parsed);
      result = {
        provider: PROVIDERS.PAYMOB,
        paymentId: normalized.paymentId,
        orderId: normalized.orderId,
        amountMinor: normalized.amountMinor,
        currency: normalized.currency,
        paymentMethodType: normalized.paymentMethodType,
        idempotencyKey: normalized.idempotencyKey,
        providerPaymentId: intention.id,
        providerReference: String(intention.intention_order_id),
        checkoutUrl: createCheckoutUrl(publicKey, intention.client_secret),
        status: "pending",
        environment: "TEST",
      };
    } catch (error) {
      await this.attempts.mark(normalized.paymentId, "UNKNOWN", { errorCode: "INVALID_PROVIDER_RESPONSE" });
      throw error;
    }
    const persisted = await this.attempts.mark(normalized.paymentId, "SESSION_CREATED", {
      providerPaymentId: result.providerPaymentId,
      providerReference: result.providerReference,
      checkoutUrl: result.checkoutUrl,
    });
    if (persisted?.matchedCount !== 1) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, "Paymob session was created but local recovery data could not be persisted.");
    }
    return result;
  }

  async verifyWebhook(request = {}) {
    if (this.env?.PAYMOB_ENVIRONMENT !== "TEST" || this.env?.PAYMOB_TEST_EXECUTION_ENABLED !== "true") {
      return { status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER };
    }
    if (request.signature === undefined || request.signature === null || request.signature === "") return { status: WEBHOOK_VERIFICATION_STATUS.MISSING_SIGNATURE };
    if (typeof request.signature !== "string" || !/^[a-f0-9]{128}$/.test(request.signature)) {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }
    let payload;
    try {
      payload = JSON.parse(request.rawBody.toString("utf8"));
    } catch {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }
    const obj = payload?.obj;
    if (payload?.type !== "TRANSACTION" || !obj || typeof obj !== "object" || Array.isArray(obj) ||
        !obj.order || !obj.source_data) return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    const values = [obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
      obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure, obj.is_auth,
      obj.is_capture, obj.is_refunded, obj.is_standalone_payment, obj.is_voided, obj.order.id,
      obj.owner, obj.pending, obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type, obj.success];
    if (values.some((value) => value === undefined || value === null || !["string", "number", "boolean"].includes(typeof value)) ||
        !Number.isSafeInteger(obj.amount_cents) || obj.amount_cents < 1 || !Number.isSafeInteger(obj.id) || obj.id < 1 ||
        !Number.isSafeInteger(obj.order.id) || obj.order.id < 1 || typeof obj.success !== "boolean") {
      return { status: WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST };
    }
    let secret;
    try {
      secret = resolveWebhookSecret({ provider: PROVIDERS.PAYMOB, environment: "TEST" }, { env: this.env }).secretValue;
    } catch {
      return { status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER };
    }
    const message = values.map((value) => typeof value === "boolean" ? String(value) : String(value)).join("");
    const expected = crypto.createHmac("sha512", secret).update(message, "utf8").digest();
    const supplied = Buffer.from(request.signature, "hex");
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return { status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE };
    }
    // Pass only normalization inputs onward. The provider callback includes
    // card-adjacent fields that must never cross the canonical event boundary.
    const safeObj = Object.fromEntries([
      "amount_cents", "created_at", "currency", "id", "integration_id", "is_auth", "is_capture",
      "is_refunded", "is_standalone_payment", "is_voided", "pending", "success",
      "is_refund", "is_void", "is_cancel", "is_canceled",
    ].filter((key) => Object.prototype.hasOwnProperty.call(obj, key)).map((key) => [key, obj[key]]));
    safeObj.order = { id: obj.order.id };
    return { status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, payload: { type: "TRANSACTION", obj: safeObj } };
  }

  async normalizeWebhookEvent(payload) {
    const obj = payload?.obj;
    if (payload?.type !== "TRANSACTION" || !obj || !obj.order || !Number.isSafeInteger(obj.id) ||
        !Number.isSafeInteger(obj.order.id) || !Number.isSafeInteger(obj.amount_cents) ||
        !Number.isSafeInteger(obj.integration_id) || typeof obj.currency !== "string" ||
        typeof obj.success !== "boolean" || typeof obj.pending !== "boolean") {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob transaction callback is incomplete.");
    }
    const configuredIntegrationId = Number(this.env?.PAYMOB_TEST_INTEGRATION_ID);
    if (!Number.isSafeInteger(configuredIntegrationId) || configuredIntegrationId < 1) {
      throw providerError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Paymob TEST integration is unavailable for webhook verification.");
    }
    if (obj.integration_id !== configuredIntegrationId) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob callback integration does not match the configured merchant integration.");
    }
    if (obj.is_refund === true || obj.is_void === true || obj.is_refunded === true || obj.is_voided === true ||
        obj.is_cancel === true || obj.is_canceled === true) {
      throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob callback action is outside the supported initial-payment flow.");
    }
    if (!obj.pending && obj.success) {
      if (obj.is_capture === true) {
        throw providerError(PROVIDER_ERROR_CODES.DISABLED, "Paymob capture confirmation requires an authenticated transaction inquiry.");
      }
      if (obj.is_auth !== true) {
        throw providerError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob success callback does not include sufficient capture evidence.");
      }
    }
    const status = obj.pending ? "pending" : !obj.success ? "failed" : "authorized";
    const attempt = await this.attempts.findPaymobSessionByOrderReference(String(obj.order.id));
    const event = {
      provider: PROVIDERS.PAYMOB,
      providerEventId: String(obj.id),
      providerTransactionReference: String(obj.id),
      providerOrderReference: String(obj.order.id),
      eventType: `payment_${status}`,
      status,
      amountMinor: obj.amount_cents,
      currency: obj.currency,
      occurredAt: obj.created_at,
    };
    if (!attempt || !attempt.providerPaymentId) return event;
    return { ...event, paymentReference: attempt.paymentId, providerPaymentReference: attempt.providerPaymentId };
  }
}

module.exports = PaymobProvider;
module.exports.INTENTION_URL = INTENTION_URL;
module.exports.CHECKOUT_URL = CHECKOUT_URL;
module.exports.buildIntentionPayload = buildIntentionPayload;
module.exports.createCheckoutUrl = createCheckoutUrl;
module.exports.validateResponse = validateResponse;
