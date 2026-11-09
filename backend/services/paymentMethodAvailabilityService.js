const Joi = require("joi");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { CAPABILITY_STATUS, getProviderCapabilities } = require("../providers/providerCapabilities");
const { readProviderConfig } = require("../providers/providerConfig");
const { METHOD, METHOD_CAPABILITIES, getMethodCapability } = require("./paymentMethodRegistry");

const contextSchema = Joi.object({
  currency: Joi.string().pattern(/^[A-Z]{3}$/).required(),
  country: Joi.string().pattern(/^[A-Z]{2}$/).required(),
  amountMinor: Joi.number().integer().positive().unsafe(false).required(),
  deviceContext: Joi.object({
    applePayAvailable: Joi.boolean(),
    googlePayAvailable: Joi.boolean(),
  }).default({}).unknown(false),
}).unknown(false);

function safeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getProviderRuntimeStatus(provider, { capabilityResolver = getProviderCapabilities, configReader = readProviderConfig } = {}) {
  const capability = capabilityResolver(provider);
  if (!capability) return "UNKNOWN";
  if (capability.runtime.enabled !== true) return "DISABLED";
  if (!configReader(provider).configured) return "UNCONFIGURED";
  return "ENABLED";
}

class PaymentMethodAvailabilityService {
  constructor({ methods = METHOD_CAPABILITIES, capabilityResolver = getProviderCapabilities, configReader = readProviderConfig } = {}) {
    const methodIds = methods.map((entry) => entry.method);
    if (new Set(methodIds).size !== methodIds.length) throw safeError("DUPLICATE_PAYMENT_METHOD", "Payment method registry contains duplicate identifiers.");
    this.methods = Object.freeze([...methods]);
    this.capabilityResolver = capabilityResolver;
    this.configReader = configReader;
  }

  getAvailableMethods(context) {
    const { value, error } = contextSchema.validate(context, { abortEarly: false, convert: false });
    if (error) throw safeError("INVALID_PAYMENT_METHOD_CONTEXT", "Payment method context is invalid.");
    return Object.freeze(this.methods.map((definition) => Object.freeze(this.evaluate(definition, value))));
  }

  getMethodAvailability(method, context) {
    const definition = getMethodCapability(method);
    const { value, error } = contextSchema.validate(context, { abortEarly: false, convert: false });
    if (error) throw safeError("INVALID_PAYMENT_METHOD_CONTEXT", "Payment method context is invalid.");
    return Object.freeze(this.evaluate(definition, value));
  }

  evaluate(definition, context) {
    const combinations = Object.entries(definition.providers);
    const documentedProviders = combinations.filter(([, status]) => status === CAPABILITY_STATUS.VERIFIED);
    if (documentedProviders.length === 0) {
      const hasUnverified = combinations.some(([, status]) => (
        status === CAPABILITY_STATUS.NOT_VERIFIED || status === CAPABILITY_STATUS.DEFERRED
      ));
      return this.descriptor(definition, hasUnverified ? "UNAVAILABLE" : "UNSUPPORTED", hasUnverified ? "CAPABILITY_NOT_VERIFIED" : "METHOD_UNSUPPORTED", context.currency);
    }
    if (!definition.currencies.includes(context.currency)) {
      return this.descriptor(definition, "UNAVAILABLE", "UNSUPPORTED_CURRENCY", context.currency);
    }
    if (!definition.countries.includes(context.country)) {
      return this.descriptor(definition, "UNAVAILABLE", "UNSUPPORTED_COUNTRY", context.currency);
    }
    if (definition.minimumAmountMinor && context.amountMinor < definition.minimumAmountMinor) {
      return this.descriptor(definition, "UNAVAILABLE", "AMOUNT_OUT_OF_RANGE", context.currency);
    }
    if (definition.maximumAmountMinor && context.amountMinor > definition.maximumAmountMinor) {
      return this.descriptor(definition, "UNAVAILABLE", "AMOUNT_OUT_OF_RANGE", context.currency);
    }
    if (definition.requiresDeviceCapability && context.deviceContext[definition.requiresDeviceCapability] !== true) {
      return this.descriptor(definition, "UNAVAILABLE", "DEVICE_REQUIREMENT_UNMET", context.currency);
    }

    let sawUnconfigured = false;
    let sawEnabledProvider = false;
    for (const [provider, capabilityStatus] of documentedProviders) {
      if (!Object.values(PROVIDERS).includes(provider)) continue;
      const providerCapability = this.capabilityResolver(provider);
      if (!providerCapability) continue;
      const runtimeStatus = getProviderRuntimeStatus(provider, {
        capabilityResolver: this.capabilityResolver,
        configReader: this.configReader,
      });
      if (runtimeStatus === "DISABLED") continue;
      if (runtimeStatus === "UNCONFIGURED") {
        sawUnconfigured = true;
        continue;
      }
      if (runtimeStatus !== "ENABLED") continue;
      sawEnabledProvider = true;
      const providerMethod = this.toProviderMethod(definition.method);
      if (!providerCapability.runtime.availableMethods.includes(providerMethod)) continue;
      if (providerCapability.documentation.supportedMethods?.[providerMethod] !== CAPABILITY_STATUS.VERIFIED) continue;
      if (providerCapability.documentation.currencySupport?.[context.currency] !== CAPABILITY_STATUS.VERIFIED) continue;
      if (capabilityStatus === CAPABILITY_STATUS.VERIFIED) {
        return this.descriptor(definition, "AVAILABLE", null, context.currency);
      }
    }
    const reasonCode = sawUnconfigured ? "PROVIDER_UNCONFIGURED" : sawEnabledProvider ? "METHOD_UNAVAILABLE" : "PROVIDER_DISABLED";
    return this.descriptor(definition, "UNAVAILABLE", reasonCode, context.currency);
  }

  toProviderMethod(method) {
    const map = {
      [METHOD.CARD]: "card",
      [METHOD.MEEZA]: "card",
      [METHOD.MOBILE_WALLET]: "mobile_wallet",
      [METHOD.APPLE_PAY]: "apple_pay",
      [METHOD.GOOGLE_PAY]: "google_pay",
      [METHOD.INSTAPAY]: "instapay",
      [METHOD.BNPL]: "bnpl",
      [METHOD.COD]: "cod",
      [METHOD.FAWRY_REFERENCE]: "fawry",
    };
    return map[method];
  }

  descriptor(definition, status, reasonCode, currency) {
    return {
      method: definition.method,
      status,
      displayName: definition.displayName,
      reasonCode,
      supportedCurrency: currency === "EGP" ? "EGP" : null,
    };
  }
}

module.exports = { PaymentMethodAvailabilityService, contextSchema, getProviderRuntimeStatus };
