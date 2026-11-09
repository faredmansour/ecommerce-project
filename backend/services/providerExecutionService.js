const Joi = require("joi");
const PaymentRepository = require("../repositories/paymentRepository");
const OrderPaymentSnapshotRepository = require("../repositories/orderPaymentSnapshotRepository");
const providerRegistry = require("../providers");
const PaymentExecutionAttemptRepository = require("../repositories/paymentExecutionAttemptRepository");
const { readProviderConfig } = require("../providers/providerConfig");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { PaymentProviderError, PROVIDER_ERROR_CODES } = require("../providers/providerErrors");
const { normalizeProviderError, createProviderPaymentResult } = require("../providers/providerResult");
const { normalizeCurrency } = require("../utils/money");
const { isSupportedPaymentCurrency } = require("../utils/paymentCurrency");

const REQUESTING_RECOVERY_WAIT_MS = 10500;

const executePaymentCommandSchema = Joi.object({
  paymentId: Joi.string().guid({ version: ["uuidv4"] }).required(),
}).unknown(false);

function executionError(code, message, { provider = null, operation = "createPayment" } = {}) {
  return new PaymentProviderError(code, message, { provider, operation });
}

function normalizeExecutionError(provider, error) {
  const normalized = normalizeProviderError(provider, "createPayment", error);
  const safeError = executionError(normalized.code, normalized.message, {
    provider: normalized.provider,
    operation: normalized.operation,
  });
  safeError.retryable = normalized.retryable;
  safeError.outcome = normalized.outcome;
  return safeError;
}

class ProviderExecutionService {
  constructor({ paymentRepository, orderSnapshotRepository, registry = providerRegistry, env = process.env,
    fetchImpl = globalThis.fetch, executionAttemptRepository } = {}) {
    this.payments = paymentRepository || new PaymentRepository();
    this.orders = orderSnapshotRepository || new OrderPaymentSnapshotRepository();
    this.registry = registry;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.executionAttempts = executionAttemptRepository || new PaymentExecutionAttemptRepository({ env });
  }

  async executePayment(command) {
    const { value, error } = executePaymentCommandSchema.validate(command, { abortEarly: false });
    if (error) throw executionError(PROVIDER_ERROR_CODES.INVALID_COMMAND, "Payment execution command is invalid.");

    const payment = await this.payments.findByPaymentId(value.paymentId);
    if (!payment) throw executionError(PROVIDER_ERROR_CODES.PAYMENT_NOT_FOUND, "Payment was not found.");
    if (payment.provider === PROVIDERS.PAYMOB) {
      let priorAttempt = typeof this.executionAttempts.findByPaymentId === "function"
        ? await this.executionAttempts.findByPaymentId(value.paymentId)
        : null;
      if (priorAttempt?.status === "REQUESTING") {
        const deadline = Date.now() + REQUESTING_RECOVERY_WAIT_MS;
        while (priorAttempt?.status === "REQUESTING" && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          priorAttempt = await this.executionAttempts.findByPaymentId(value.paymentId);
        }
      }
      if (priorAttempt) {
        if (priorAttempt.status === "SESSION_CREATED" && priorAttempt.checkoutUrl && priorAttempt.providerPaymentId && priorAttempt.providerReference) {
          return createProviderPaymentResult({
            provider: PROVIDERS.PAYMOB, paymentId: payment.paymentId, orderId: payment.orderId.toString(),
            amountMinor: payment.amountMinor, currency: payment.currency, paymentMethodType: payment.paymentMethodType,
            idempotencyKey: payment.idempotencyKey, providerPaymentId: priorAttempt.providerPaymentId,
            providerReference: priorAttempt.providerReference, checkoutUrl: priorAttempt.checkoutUrl,
            status: "pending", environment: "TEST",
          });
        }
        const code = priorAttempt.status === "REQUESTING" ? "PROVIDER_EXECUTION_IN_PROGRESS"
          : priorAttempt.status === "UNKNOWN" ? "PROVIDER_OUTCOME_UNKNOWN"
            : priorAttempt.status === "REJECTED" ? "PROVIDER_SESSION_REJECTED" : "PROVIDER_EXECUTION_UNRECOVERABLE";
        throw executionError(code, "Paymob execution attempt requires operational reconciliation.", { provider: payment.provider });
      }
    }
    if (payment.status !== "created") {
      throw executionError(PROVIDER_ERROR_CODES.PAYMENT_ALREADY_PROCESSED, "Payment is not available for provider execution.", { provider: payment.provider });
    }

    if (payment.provider === PROVIDERS.PAYMOB && this.env?.PAYMOB_ENVIRONMENT === "LIVE") {
      throw executionError(PROVIDER_ERROR_CODES.PROVIDER_CONFIGURATION_ERROR, "Paymob LIVE execution is unavailable.", { provider: payment.provider });
    }

    const order = payment.provider === PROVIDERS.PAYMOB && typeof this.orders.findOwnedOrderSnapshotForExecution === "function"
      ? await this.orders.findOwnedOrderSnapshotForExecution(payment.orderId, payment.customerId)
      : await this.orders.findOwnedOrderSnapshot(payment.orderId, payment.customerId);
    if (!order || order.status !== "pending_payment") {
      throw executionError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Payment Order is not eligible for provider execution.", { provider: payment.provider });
    }

    const snapshot = order.commercialSnapshot;
    if (!snapshot || !Number.isSafeInteger(snapshot.grandTotalMinor) || snapshot.grandTotalMinor < 1) {
      throw executionError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Payment Order has no valid authoritative amount.", { provider: payment.provider });
    }

    let snapshotCurrency;
    try {
      snapshotCurrency = normalizeCurrency(snapshot.currency);
    } catch {
      throw executionError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Payment Order has no valid authoritative currency.", { provider: payment.provider });
    }
    if (!isSupportedPaymentCurrency(snapshotCurrency)) {
      throw executionError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Payment Order currency is unsupported.", { provider: payment.provider });
    }
    if (snapshot.grandTotalMinor !== payment.amountMinor) {
      throw executionError(PROVIDER_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, "Payment amount does not match its Order snapshot.", { provider: payment.provider });
    }
    if (snapshotCurrency !== payment.currency) {
      throw executionError(PROVIDER_ERROR_CODES.PAYMENT_CURRENCY_MISMATCH, "Payment currency does not match its Order snapshot.", { provider: payment.provider });
    }

    if (payment.provider === "deferred") {
      throw normalizeExecutionError(payment.provider, executionError(
        PROVIDER_ERROR_CODES.OPERATION_DEFERRED,
        "Provider execution is deferred until a provider is selected by an approved server-side policy."
      ));
    }

    let adapter;
    try {
      const testEnabled = payment.provider === PROVIDERS.PAYMOB && this.env?.PAYMOB_ENVIRONMENT === "TEST" &&
        this.env?.PAYMOB_TEST_EXECUTION_ENABLED === "true";
      const Adapter = providerRegistry.ADAPTERS[PROVIDERS.PAYMOB];
      const adapterEnv = this.env;
      const adapterFetch = this.fetchImpl;
      const attempts = this.executionAttempts;
      class ConfiguredPaymobProvider extends Adapter {
        constructor() {
          super({
            env: adapterEnv,
            fetchImpl: adapterFetch,
            attemptRepository: attempts,
          });
        }
      }
      adapter = this.registry.resolveProvider(payment.provider, {
        enabledProviders: testEnabled ? [PROVIDERS.PAYMOB] : [],
        configReader: (provider) => readProviderConfig(provider, this.env),
        adapterFactories: { ...providerRegistry.ADAPTERS, [PROVIDERS.PAYMOB]: ConfiguredPaymobProvider },
      });
    } catch (providerError) {
      throw normalizeExecutionError(payment.provider, providerError);
    }

    const providerCommand = {
      paymentId: payment.paymentId,
      orderId: payment.orderId.toString(),
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      paymentMethodType: payment.paymentMethodType,
      idempotencyKey: payment.idempotencyKey,
      ...(payment.metadata ? { metadata: payment.metadata } : {}),
      ...(payment.provider === PROVIDERS.PAYMOB && order.user && typeof order.user === "object" ? {
        paymobOrderContext: {
          order,
          customerEmail: order.user.email,
        },
      } : {}),
    };

    try {
      const result = createProviderPaymentResult(await adapter.createPayment(providerCommand));
      if (result.provider !== payment.provider || result.paymentId !== payment.paymentId ||
          result.orderId !== payment.orderId.toString() || result.amountMinor !== payment.amountMinor ||
          result.currency !== payment.currency || result.paymentMethodType !== payment.paymentMethodType) {
        throw executionError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Provider result does not match the persisted Payment.", { provider: payment.provider });
      }
      if (payment.provider === PROVIDERS.PAYMOB) {
        if (result.environment !== "TEST" || result.status !== "pending" || !result.providerPaymentId) {
          throw executionError(PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED, "Paymob checkout result is not a valid TEST session.", { provider: payment.provider });
        }
      }
      return result;
    } catch (providerError) {
      throw normalizeExecutionError(payment.provider, providerError);
    }
  }
}

module.exports = { ProviderExecutionService, executePaymentCommandSchema, normalizeExecutionError };
