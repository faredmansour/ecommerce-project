const { PROVIDERS, PAYMENT_METHODS } = require("./providerIdentifiers");

const CAPABILITY_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  NOT_VERIFIED: "NOT_VERIFIED",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  DEFERRED: "DEFERRED",
});

const METHODS = Object.values(PAYMENT_METHODS);
const CAPABILITIES = Object.freeze({
  [PROVIDERS.PAYMOB]: Object.freeze({
    provider: PROVIDERS.PAYMOB,
    documentation: Object.freeze({
      supportedMethods: Object.freeze({
        [PAYMENT_METHODS.CARD]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.MOBILE_WALLET]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.INSTAPAY]: CAPABILITY_STATUS.NOT_VERIFIED,
        [PAYMENT_METHODS.FAWRY]: CAPABILITY_STATUS.NOT_VERIFIED,
        [PAYMENT_METHODS.BNPL]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.INSTALLMENTS]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.APPLE_PAY]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.GOOGLE_PAY]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.COD]: CAPABILITY_STATUS.NOT_VERIFIED,
      }),
      supportsAuthorization: CAPABILITY_STATUS.VERIFIED,
      supportsCapture: CAPABILITY_STATUS.VERIFIED,
      supportsCancellation: CAPABILITY_STATUS.NOT_VERIFIED,
      supportsRefund: CAPABILITY_STATUS.VERIFIED,
      supportsPartialRefund: CAPABILITY_STATUS.VERIFIED,
      supportsWebhooks: CAPABILITY_STATUS.VERIFIED,
      supportsWebhookSignature: CAPABILITY_STATUS.VERIFIED,
      supportsHostedCheckout: CAPABILITY_STATUS.VERIFIED,
      supportsPaymentLinks: CAPABILITY_STATUS.VERIFIED,
      supportsIdempotency: CAPABILITY_STATUS.NOT_VERIFIED,
      currencySupport: Object.freeze({ EGP: CAPABILITY_STATUS.VERIFIED }),
    }),
  }),
  [PROVIDERS.KASHIER]: Object.freeze({
    provider: PROVIDERS.KASHIER,
    documentation: Object.freeze({
      supportedMethods: Object.freeze({
        [PAYMENT_METHODS.CARD]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.MOBILE_WALLET]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.INSTAPAY]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.FAWRY]: CAPABILITY_STATUS.NOT_VERIFIED,
        [PAYMENT_METHODS.BNPL]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.INSTALLMENTS]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.APPLE_PAY]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.GOOGLE_PAY]: CAPABILITY_STATUS.NOT_SUPPORTED,
        [PAYMENT_METHODS.COD]: CAPABILITY_STATUS.NOT_VERIFIED,
      }),
      supportsAuthorization: CAPABILITY_STATUS.VERIFIED,
      supportsCapture: CAPABILITY_STATUS.VERIFIED,
      supportsCancellation: CAPABILITY_STATUS.VERIFIED,
      supportsRefund: CAPABILITY_STATUS.VERIFIED,
      supportsPartialRefund: CAPABILITY_STATUS.VERIFIED,
      supportsWebhooks: CAPABILITY_STATUS.VERIFIED,
      supportsWebhookSignature: CAPABILITY_STATUS.VERIFIED,
      supportsHostedCheckout: CAPABILITY_STATUS.VERIFIED,
      supportsPaymentLinks: CAPABILITY_STATUS.VERIFIED,
      supportsIdempotency: CAPABILITY_STATUS.NOT_VERIFIED,
      currencySupport: Object.freeze({ EGP: CAPABILITY_STATUS.VERIFIED }),
    }),
  }),
  [PROVIDERS.FAWRY]: Object.freeze({
    provider: PROVIDERS.FAWRY,
    documentation: Object.freeze({
      supportedMethods: Object.freeze({
        [PAYMENT_METHODS.CARD]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.MOBILE_WALLET]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.INSTAPAY]: CAPABILITY_STATUS.NOT_VERIFIED,
        [PAYMENT_METHODS.FAWRY]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.BNPL]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.INSTALLMENTS]: CAPABILITY_STATUS.VERIFIED,
        [PAYMENT_METHODS.APPLE_PAY]: CAPABILITY_STATUS.NOT_VERIFIED,
        [PAYMENT_METHODS.GOOGLE_PAY]: CAPABILITY_STATUS.NOT_VERIFIED,
        [PAYMENT_METHODS.COD]: CAPABILITY_STATUS.VERIFIED,
      }),
      supportsAuthorization: CAPABILITY_STATUS.VERIFIED,
      supportsCapture: CAPABILITY_STATUS.VERIFIED,
      supportsCancellation: CAPABILITY_STATUS.NOT_VERIFIED,
      supportsRefund: CAPABILITY_STATUS.NOT_VERIFIED,
      supportsPartialRefund: CAPABILITY_STATUS.NOT_VERIFIED,
      supportsWebhooks: CAPABILITY_STATUS.VERIFIED,
      supportsWebhookSignature: CAPABILITY_STATUS.NOT_VERIFIED,
      supportsHostedCheckout: CAPABILITY_STATUS.NOT_VERIFIED,
      supportsPaymentLinks: CAPABILITY_STATUS.VERIFIED,
      supportsIdempotency: CAPABILITY_STATUS.NOT_VERIFIED,
      currencySupport: Object.freeze({ EGP: CAPABILITY_STATUS.VERIFIED }),
    }),
  }),
});

const OPERATION_CAPABILITY = Object.freeze({
  authorize: "supportsAuthorization",
  capture: "supportsCapture",
  cancel: "supportsCancellation",
  refund: "supportsRefund",
  verifyWebhook: "supportsWebhookSignature",
});

function getProviderCapabilities(provider) {
  if (!Object.prototype.hasOwnProperty.call(CAPABILITIES, provider)) return null;
  const record = CAPABILITIES[provider];
  const runtime = Object.freeze({
    enabled: false,
    availableMethods: Object.freeze([]),
    operations: Object.freeze(Object.fromEntries([
      "createPayment", "authorize", "capture", "cancel", "refund", "getPayment", "verifyWebhook",
    ].map((operation) => [operation, CAPABILITY_STATUS.DEFERRED]))),
  });
  return Object.freeze({ provider, documentation: record.documentation, runtime });
}

function isKnownPaymentMethod(value) {
  return METHODS.includes(value);
}

function isDocumentedCapability(provider, operation) {
  if (!Object.prototype.hasOwnProperty.call(CAPABILITIES, provider)) return CAPABILITY_STATUS.NOT_VERIFIED;
  const key = OPERATION_CAPABILITY[operation];
  if (!key) return CAPABILITY_STATUS.NOT_VERIFIED;
  const capability = CAPABILITIES[provider]?.documentation?.[key];
  return capability || CAPABILITY_STATUS.NOT_VERIFIED;
}

module.exports = { CAPABILITY_STATUS, CAPABILITIES, getProviderCapabilities, isKnownPaymentMethod, isDocumentedCapability };
