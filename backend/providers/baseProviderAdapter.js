const PaymentProvider = require("./paymentProvider");
const { normalizeCreatePaymentCommand, assertNoSensitiveFields } = require("./providerInput");
const { getProviderCapabilities, isDocumentedCapability, CAPABILITY_STATUS } = require("./providerCapabilities");
const { readProviderConfig } = require("./providerConfig");
const { PROVIDER_ERROR_CODES, PaymentProviderError, providerDeferred } = require("./providerErrors");

class BaseProviderAdapter extends PaymentProvider {
  constructor(provider) {
    super();
    this.provider = provider;
  }

  getCapabilities() {
    return getProviderCapabilities(this.provider);
  }

  getConfigurationStatus() {
    const config = readProviderConfig(this.provider);
    return Object.freeze({ configured: config.configured, missingCount: config.missingCount, enabled: false });
  }

  assertDocumentedOperation(operation) {
    const status = isDocumentedCapability(this.provider, operation);
    if (status !== CAPABILITY_STATUS.VERIFIED) {
      throw new PaymentProviderError(
        PROVIDER_ERROR_CODES.UNSUPPORTED_PAYMENT_METHOD,
        `The ${this.provider} ${operation} capability is not verified for use.`,
        { provider: this.provider, operation }
      );
    }
  }

  assertNotConfigured(operation) {
    if (!readProviderConfig(this.provider).configured) {
      throw new PaymentProviderError(
        PROVIDER_ERROR_CODES.NOT_CONFIGURED,
        `The ${this.provider} provider is not configured.`,
        { provider: this.provider, operation }
      );
    }
  }

  async createPayment(command) {
    const normalized = normalizeCreatePaymentCommand(command);
    const methodStatus = this.getCapabilities()?.documentation?.supportedMethods?.[normalized.paymentMethodType];
    if (methodStatus !== CAPABILITY_STATUS.VERIFIED) {
      throw new PaymentProviderError(
        PROVIDER_ERROR_CODES.UNSUPPORTED_PAYMENT_METHOD,
        `The ${this.provider} method is not verified for use.`,
        { provider: this.provider, operation: "createPayment" }
      );
    }
    this.assertNotConfigured("createPayment");
    throw providerDeferred(this.provider, "createPayment");
  }

  async authorize(...args) {
    args.forEach((arg, index) => assertNoSensitiveFields(arg, `authorize[${index}]`));
    this.assertDocumentedOperation("authorize");
    this.assertNotConfigured("authorize");
    throw providerDeferred(this.provider, "authorize");
  }

  async capture(...args) {
    args.forEach((arg, index) => assertNoSensitiveFields(arg, `capture[${index}]`));
    this.assertDocumentedOperation("capture");
    this.assertNotConfigured("capture");
    throw providerDeferred(this.provider, "capture");
  }

  async cancel(...args) {
    args.forEach((arg, index) => assertNoSensitiveFields(arg, `cancel[${index}]`));
    this.assertDocumentedOperation("cancel");
    this.assertNotConfigured("cancel");
    throw providerDeferred(this.provider, "cancel");
  }

  async refund(...args) {
    args.forEach((arg, index) => assertNoSensitiveFields(arg, `refund[${index}]`));
    const refundCapability = isDocumentedCapability(this.provider, "refund");
    if (refundCapability !== CAPABILITY_STATUS.VERIFIED) {
      throw new PaymentProviderError(
        PROVIDER_ERROR_CODES.UNSUPPORTED_OPERATION,
        `The ${this.provider} refund operation is not verified for use.`,
        { provider: this.provider, operation: "refund" }
      );
    }
    this.assertNotConfigured("refund");
    throw providerDeferred(this.provider, "refund");
  }

  async getPayment(...args) {
    args.forEach((arg, index) => assertNoSensitiveFields(arg, `getPayment[${index}]`));
    this.assertNotConfigured("getPayment");
    throw providerDeferred(this.provider, "getPayment");
  }

  async verifyWebhook(...args) {
    args.forEach((arg, index) => assertNoSensitiveFields(arg, `verifyWebhook[${index}]`));
    this.assertDocumentedOperation("verifyWebhook");
    this.assertNotConfigured("verifyWebhook");
    throw providerDeferred(this.provider, "verifyWebhook");
  }

  async normalizeWebhookEvent() {
    throw providerDeferred(this.provider, "normalizeWebhookEvent");
  }

  buildCreatePaymentRequest(command) {
    // This is a local dry-run descriptor only, never a provider wire payload.
    return this.buildRequestDescriptor(command, "generic_payment_request_descriptor");
  }

  buildRequestDescriptor(command, requestType) {
    const normalized = normalizeCreatePaymentCommand(command);
    const methodStatus = this.getCapabilities()?.documentation?.supportedMethods?.[normalized.paymentMethodType];
    if (methodStatus !== CAPABILITY_STATUS.VERIFIED) {
      throw new PaymentProviderError(
        PROVIDER_ERROR_CODES.UNSUPPORTED_PAYMENT_METHOD,
        `The ${this.provider} method is not verified for use.`,
        { provider: this.provider, operation: "buildRequestDescriptor" }
      );
    }
    return Object.freeze({
      provider: this.provider,
      requestType,
      transport: "DISABLED",
      paymentId: normalized.paymentId,
      orderId: normalized.orderId,
      amountMinor: normalized.amountMinor,
      currency: normalized.currency,
      paymentMethodType: normalized.paymentMethodType,
      idempotencyKey: normalized.idempotencyKey,
    });
  }
}

module.exports = BaseProviderAdapter;
