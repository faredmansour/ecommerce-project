const { PROVIDERS, PAYMENT_METHODS } = require("./providerIdentifiers");
const { CAPABILITY_STATUS, getProviderCapabilities } = require("./providerCapabilities");
const { PROVIDER_ERROR_CODES, PaymentProviderError } = require("./providerErrors");
const { PROVIDER_OUTCOMES, createProviderPaymentResult, normalizeProviderError } = require("./providerResult");
const { createSafeProviderLogRecord } = require("./providerObservability");
const { readProviderConfig } = require("./providerConfig");
const PaymobProvider = require("./paymobProvider");
const KashierProvider = require("./kashierProvider");
const FawryProvider = require("./fawryProvider");

const ADAPTERS = Object.freeze({
  [PROVIDERS.PAYMOB]: PaymobProvider,
  [PROVIDERS.KASHIER]: KashierProvider,
  [PROVIDERS.FAWRY]: FawryProvider,
});

function resolveProvider(provider, {
  enabledProviders = [],
  configReader = readProviderConfig,
  adapterFactories = ADAPTERS,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, provider)) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.CAPABILITY_UNAVAILABLE, "Payment provider is unknown or disabled.");
  }
  const Adapter = ADAPTERS[provider];
  if (!Adapter) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.CAPABILITY_UNAVAILABLE, "Payment provider is unknown or disabled.");
  }
  const enabled = enabledProviders instanceof Set ? enabledProviders.has(provider) : enabledProviders.includes(provider);
  if (!enabled) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.DISABLED, "Payment provider is disabled.", { provider });
  }
  const configStatus = configReader(provider);
  if (!configStatus?.configured) {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Payment provider is not configured.", { provider });
  }
  const Factory = adapterFactories[provider];
  if (typeof Factory !== "function") {
    throw new PaymentProviderError(PROVIDER_ERROR_CODES.CAPABILITY_UNAVAILABLE, "Payment provider adapter is unavailable.", { provider });
  }
  return new Factory();
}

module.exports = {
  PROVIDERS,
  PAYMENT_METHODS,
  CAPABILITY_STATUS,
  ADAPTERS,
  PaymobProvider,
  KashierProvider,
  FawryProvider,
  resolveProvider,
  getProviderCapabilities,
  PROVIDER_ERROR_CODES,
  readProviderConfig,
  PaymentProviderError,
  normalizeProviderError,
  createProviderPaymentResult,
  PROVIDER_OUTCOMES,
  createSafeProviderLogRecord,
};
