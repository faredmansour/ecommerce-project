const { PROVIDERS } = require("../providers/providerIdentifiers");
const { CAPABILITY_STATUS } = require("../providers/providerCapabilities");
const { METHOD, METHOD_CAPABILITIES, getMethodCapability } = require("../services/paymentMethodRegistry");
const { PaymentMethodAvailabilityService, getProviderRuntimeStatus } = require("../services/paymentMethodAvailabilityService");
const Payment = require("../models/paymentModel");
const Order = require("../models/orderModel");
const PaymentLedgerEntry = require("../models/paymentLedgerEntryModel");
const PaymentWebhookEvent = require("../models/paymentWebhookEventModel");
const PaymentReconciliationRecord = require("../models/paymentReconciliationRecordModel");

const context = Object.freeze({ currency: "EGP", country: "EG", amountMinor: 12550 });

function enabledCapability(provider, method = "card") {
  return {
    provider,
    documentation: {
      supportedMethods: { [method]: CAPABILITY_STATUS.VERIFIED },
      currencySupport: { EGP: CAPABILITY_STATUS.VERIFIED },
    },
    runtime: { enabled: true, availableMethods: [method] },
  };
}

describe("Payment method capability and availability", () => {
  it("defines the canonical method vocabulary once and rejects unknown or duplicate identifiers", () => {
    expect(METHOD_CAPABILITIES.map(({ method }) => method)).toEqual([
      "card", "meeza", "mobile_wallet", "apple_pay", "google_pay", "instapay", "bnpl", "cod", "fawry_reference",
    ]);
    expect(new Set(METHOD_CAPABILITIES.map(({ method }) => method)).size).toBe(METHOD_CAPABILITIES.length);
    expect(() => getMethodCapability("mystery_method")).toThrow(expect.objectContaining({ code: "METHOD_UNSUPPORTED" }));
    expect(() => new PaymentMethodAvailabilityService({ methods: [METHOD_CAPABILITIES[0], METHOD_CAPABILITIES[0]] }))
      .toThrow(expect.objectContaining({ code: "DUPLICATE_PAYMENT_METHOD" }));
    expect(getMethodCapability(METHOD.INSTAPAY).providers).toEqual({
      [PROVIDERS.KASHIER]: "VERIFIED",
      [PROVIDERS.PAYMOB]: "NOT_VERIFIED",
      [PROVIDERS.FAWRY]: "NOT_VERIFIED",
    });
  });

  it("keeps documentary status separate from disabled and unconfigured runtime status", () => {
    const results = new PaymentMethodAvailabilityService().getAvailableMethods(context);
    expect(results).toHaveLength(9);
    expect(results.every((item) => item.status !== "AVAILABLE")).toBe(true);
    expect(results.find((item) => item.method === METHOD.CARD)).toMatchObject({ status: "UNAVAILABLE", reasonCode: "PROVIDER_DISABLED" });

    const unconfiguredService = new PaymentMethodAvailabilityService({
      methods: [getMethodCapability(METHOD.CARD)],
      capabilityResolver: (provider) => enabledCapability(provider),
      configReader: () => ({ configured: false }),
    });
    expect(unconfiguredService.getMethodAvailability(METHOD.CARD, context))
      .toMatchObject({ status: "UNAVAILABLE", reasonCode: "PROVIDER_UNCONFIGURED" });
    expect(getProviderRuntimeStatus("unknown-provider")).toBe("UNKNOWN");

    const enabledService = new PaymentMethodAvailabilityService({
      methods: [getMethodCapability(METHOD.CARD)],
      capabilityResolver: (provider) => enabledCapability(provider),
      configReader: () => ({ configured: true }),
    });
    expect(enabledService.getMethodAvailability(METHOD.CARD, context))
      .toMatchObject({ status: "AVAILABLE", reasonCode: null, supportedCurrency: "EGP" });
  });

  it("does not upgrade unverified or unsupported documentation into availability", () => {
    const notVerified = Object.freeze({ method: "future_method", displayName: "Unverified", providers: { [PROVIDERS.PAYMOB]: CAPABILITY_STATUS.NOT_VERIFIED }, currencies: ["EGP"], countries: ["EG"] });
    const unsupported = Object.freeze({ method: "blocked_method", displayName: "Unsupported", providers: { [PROVIDERS.KASHIER]: CAPABILITY_STATUS.NOT_SUPPORTED }, currencies: ["EGP"], countries: ["EG"] });
    const service = new PaymentMethodAvailabilityService({ methods: [notVerified, unsupported] });
    expect(service.getAvailableMethods(context)).toEqual([
      expect.objectContaining({ status: "UNAVAILABLE", reasonCode: "CAPABILITY_NOT_VERIFIED" }),
      expect.objectContaining({ status: "UNSUPPORTED", reasonCode: "METHOD_UNSUPPORTED" }),
    ]);
  });

  it("enforces Egypt and EGP without currency conversion", () => {
    const service = new PaymentMethodAvailabilityService({
      methods: [getMethodCapability(METHOD.CARD)],
      capabilityResolver: (provider) => enabledCapability(provider),
      configReader: () => ({ configured: true }),
    });
    expect(service.getMethodAvailability(METHOD.CARD, { ...context, currency: "USD" }))
      .toMatchObject({ status: "UNAVAILABLE", reasonCode: "UNSUPPORTED_CURRENCY", supportedCurrency: null });
    expect(service.getMethodAvailability(METHOD.CARD, { ...context, country: "US" }))
      .toMatchObject({ status: "UNAVAILABLE", reasonCode: "UNSUPPORTED_COUNTRY" });
    expect(service.getMethodAvailability(METHOD.CARD, context).supportedCurrency).toBe("EGP");
  });

  it("requires device capability for Apple Pay and Google Pay without collecting payment credentials", () => {
    const service = new PaymentMethodAvailabilityService();
    expect(service.getMethodAvailability(METHOD.APPLE_PAY, context))
      .toMatchObject({ status: "UNAVAILABLE", reasonCode: "DEVICE_REQUIREMENT_UNMET" });
    expect(service.getMethodAvailability(METHOD.APPLE_PAY, { ...context, deviceContext: { applePayAvailable: true } }).status)
      .toBe("UNAVAILABLE");
    expect(service.getMethodAvailability(METHOD.GOOGLE_PAY, { ...context, deviceContext: { googlePayAvailable: true } }).status)
      .toBe("UNAVAILABLE");
    expect(() => service.getAvailableMethods({ ...context, cardNumber: "4111111111111111", cvv: "123" }))
      .toThrow(expect.objectContaining({ code: "INVALID_PAYMENT_METHOD_CONTEXT" }));
    expect(() => service.getAvailableMethods({ ...context, deviceContext: { walletPin: "secret", otp: "secret" } }))
      .toThrow(expect.objectContaining({ code: "INVALID_PAYMENT_METHOD_CONTEXT" }));
  });

  it("requires positive safe integer minor units and rejects client authority fields", () => {
    const service = new PaymentMethodAvailabilityService();
    for (const amountMinor of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => service.getAvailableMethods({ ...context, amountMinor })).toThrow(expect.objectContaining({ code: "INVALID_PAYMENT_METHOD_CONTEXT" }));
    }
    for (const field of ["provider", "paymentStatus", "paymentState", "chargedAmount", "providerTransactionId"]) {
      expect(() => service.getAvailableMethods({ ...context, [field]: "untrusted" }))
        .toThrow(expect.objectContaining({ code: "INVALID_PAYMENT_METHOD_CONTEXT" }));
    }
  });

  it("returns only safe descriptors and has no financial or durable side effects", async () => {
    const before = await Promise.all([
      Payment.countDocuments(), Order.countDocuments(), PaymentLedgerEntry.countDocuments(),
      PaymentWebhookEvent.countDocuments(), PaymentReconciliationRecord.countDocuments(),
    ]);
    const descriptors = new PaymentMethodAvailabilityService().getAvailableMethods(context);
    expect(descriptors[0]).toEqual({
      method: METHOD.CARD,
      status: "UNAVAILABLE",
      displayName: "Card",
      reasonCode: "PROVIDER_DISABLED",
      supportedCurrency: "EGP",
    });
    for (const item of descriptors) {
      expect(Object.keys(item).sort()).toEqual(["displayName", "method", "reasonCode", "status", "supportedCurrency"]);
      expect(JSON.stringify(item)).not.toMatch(/credential|secret|pan|cvv|otp|pin|api.?key/i);
    }
    const after = await Promise.all([
      Payment.countDocuments(), Order.countDocuments(), PaymentLedgerEntry.countDocuments(),
      PaymentWebhookEvent.countDocuments(), PaymentReconciliationRecord.countDocuments(),
    ]);
    expect(after).toEqual(before);
  });
});
