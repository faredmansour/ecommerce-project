const {
  PROVIDERS,
  PAYMENT_METHODS,
  CAPABILITY_STATUS,
  resolveProvider,
  getProviderCapabilities,
  PROVIDER_ERROR_CODES,
  normalizeProviderError,
  createProviderPaymentResult,
  createSafeProviderLogRecord,
  PaymobProvider,
  KashierProvider,
  FawryProvider,
} = require("../providers");
const PaymentProvider = require("../providers/paymentProvider");
const { normalizeCreatePaymentCommand } = require("../providers/providerInput");
const { readProviderConfig, ENV_KEYS } = require("../providers/providerConfig");

const testAdapter = (provider) => resolveProvider(provider, {
  enabledProviders: [provider],
  configReader: () => ({ configured: true }),
});

function expectSyncCode(action, code) {
  try {
    action();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected provider error ${code}.`);
}

const validCommand = Object.freeze({
  paymentId: "e68f6f50-8f63-4f1c-90ca-eaa6a82f25f1",
  orderId: "507f1f77bcf86cd799439011",
  amountMinor: 12550,
  currency: "EGP",
  paymentMethodType: PAYMENT_METHODS.CARD,
  idempotencyKey: "provider-create-0001",
  metadata: { channel: "web" },
});

describe("provider adapter foundation", () => {
  it("preserves the original abstract port and subclasses it for each Egypt adapter", async () => {
    const port = new PaymentProvider();
    await expect(port.createPayment()).rejects.toThrow("must be implemented by an adapter");
    expect(new PaymobProvider()).toBeInstanceOf(PaymentProvider);
    expect(new KashierProvider()).toBeInstanceOf(PaymentProvider);
    expect(new FawryProvider()).toBeInstanceOf(PaymentProvider);
  });

  it("resolves only the three known, disabled provider adapters", () => {
    for (const provider of Object.values(PROVIDERS)) {
      expectSyncCode(() => resolveProvider(provider), PROVIDER_ERROR_CODES.DISABLED);
      expectSyncCode(() => resolveProvider(provider, { enabledProviders: [provider], configReader: () => ({ configured: false }) }), PROVIDER_ERROR_CODES.NOT_CONFIGURED);
      const adapter = resolveProvider(provider, {
        enabledProviders: [provider],
        configReader: () => ({ configured: true }),
      });
      expect(adapter.provider).toBe(provider);
      expect(adapter.getCapabilities().runtime).toMatchObject({ enabled: false, availableMethods: [] });
      expect(Object.values(adapter.getCapabilities().runtime.operations)).toEqual(
        Array(7).fill(CAPABILITY_STATUS.DEFERRED)
      );
    }

    expectSyncCode(() => resolveProvider("stripe"), PROVIDER_ERROR_CODES.CAPABILITY_UNAVAILABLE);
    expectSyncCode(() => resolveProvider("cod"), PROVIDER_ERROR_CODES.CAPABILITY_UNAVAILABLE);
    expectSyncCode(() => resolveProvider("constructor", { enabledProviders: ["constructor"], configReader: () => ({ configured: true }) }), PROVIDER_ERROR_CODES.CAPABILITY_UNAVAILABLE);
    expect(getProviderCapabilities("constructor")).toBeNull();
  });

  it("keeps public documentation evidence separate from runtime availability", () => {
    expect(getProviderCapabilities(PROVIDERS.KASHIER).documentation.supportedMethods.instapay)
      .toBe(CAPABILITY_STATUS.VERIFIED);
    expect(getProviderCapabilities(PROVIDERS.KASHIER).documentation.supportedMethods.google_pay)
      .toBe(CAPABILITY_STATUS.NOT_SUPPORTED);
    expect(getProviderCapabilities(PROVIDERS.FAWRY).documentation.supportsRefund)
      .toBe(CAPABILITY_STATUS.NOT_VERIFIED);
    expect(getProviderCapabilities(PROVIDERS.FAWRY).runtime.enabled).toBe(false);
  });

  it("does not require provider configuration for construction and exposes no configuration values", () => {
    for (const provider of Object.values(PROVIDERS)) {
      const adapter = new (require("../providers").ADAPTERS[provider])();
      const status = adapter.getConfigurationStatus();
      expect(status).toHaveProperty("enabled", false);
      expect(JSON.stringify(status)).not.toMatch(/secret|api.?key|merchant.?code/i);
      expect(readProviderConfig(provider, {})).toMatchObject({ configured: false, missingCount: ENV_KEYS[provider].length });
      expect(readProviderConfig(provider, {})).not.toHaveProperty("values");
      expect(ENV_KEYS[provider].length).toBeGreaterThan(0);
    }
  });

  it("accepts EGP integer minor units but rejects decimal, negative, zero, and unsupported money", () => {
    expect(normalizeCreatePaymentCommand(validCommand)).toMatchObject({ amountMinor: 12550, currency: "EGP" });
    for (const amountMinor of [125.5, -1, 0, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => normalizeCreatePaymentCommand({ ...validCommand, amountMinor })).toThrow("amountMinor");
    }
    expect(() => normalizeCreatePaymentCommand({ ...validCommand, currency: "ZZZ" })).toThrow("currency");
    expect(() => normalizeCreatePaymentCommand({ ...validCommand, currency: "egp" })).toThrow("currency");
  });

  it("rejects card, wallet, credential, and token material in every adapter input", async () => {
    for (const provider of Object.values(PROVIDERS)) {
      const adapter = testAdapter(provider);
      for (const key of ["pan", "cardNumber", "cvv", "cvv2", "walletPin", "otp", "apiKey", "clientSecret"]) {
        await expect(adapter.createPayment({ ...validCommand, [key]: "sensitive-test-value" }))
          .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.SENSITIVE_DATA_REJECTED, retryable: false, outcome: "unknown" });
      }
      await expect(adapter.capture({ cardNumber: "sensitive-test-value" }))
        .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.SENSITIVE_DATA_REJECTED });
    }
    expect(() => normalizeCreatePaymentCommand({ ...validCommand, metadata: { requestId: "x", otp: "sensitive-test-value" } }))
      .toThrow("Sensitive payment data");
    expect(() => normalizeCreatePaymentCommand({ ...validCommand, metadata: { requestId: "x", one_time_password: "sensitive-test-value" } }))
      .toThrow("Sensitive payment data");
  });

  it("fails closed without sending payment/session requests", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn(() => { throw new Error("network must not be called"); });
    global.fetch = fetchSpy;
    try {
    for (const provider of Object.values(PROVIDERS)) {
      const adapter = resolveProvider(provider, { enabledProviders: [provider], configReader: () => ({ configured: true }) });
      const expectedCode = provider === PROVIDERS.PAYMOB
        ? PROVIDER_ERROR_CODES.DISABLED
        : adapter.getConfigurationStatus().configured
        ? PROVIDER_ERROR_CODES.OPERATION_DEFERRED
        : PROVIDER_ERROR_CODES.NOT_CONFIGURED;
      await expect(adapter.createPayment(validCommand)).rejects.toMatchObject({ code: expectedCode });
    }
    const fawry = testAdapter(PROVIDERS.FAWRY);
    await expect(fawry.refund())
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.UNSUPPORTED_OPERATION });
    const paymob = testAdapter(PROVIDERS.PAYMOB);
    await expect(paymob.authorize())
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.NOT_CONFIGURED });
    const kashier = testAdapter(PROVIDERS.KASHIER);
    const kashierVerification = await kashier.verifyWebhook({ rawBody: Buffer.from("{}"), headers: {} });
    expect(["MISSING_SIGNATURE", "DISABLED_PROVIDER"]).toContain(kashierVerification.status);
    expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("never fakes success for any external provider operation", async () => {
    for (const provider of Object.values(PROVIDERS)) {
      const adapter = testAdapter(provider);
      for (const operation of ["createPayment", "authorize", "capture", "cancel", "refund", "getPayment", "verifyWebhook"]) {
        if (operation === "verifyWebhook") {
          const verification = await adapter.verifyWebhook({ rawBody: Buffer.from("{}"), headers: {} });
          expect(verification.status).not.toBe("VERIFIED");
          continue;
        }
        await expect(adapter[operation](operation === "createPayment" ? validCommand : {})).rejects.toBeInstanceOf(Error);
      }
    }
  });

  it("builds provider-specific offline descriptors without inventing provider references, URLs, or expiry", () => {
    const descriptors = Object.values(PROVIDERS).map((provider) => testAdapter(provider).buildCreatePaymentRequest(validCommand));
    expect(descriptors.map((item) => item.requestType)).toEqual([
      "payment_intention_session_descriptor", "payment_session_descriptor", "payment_reference_descriptor",
    ]);
    for (const descriptor of descriptors) {
      expect(descriptor).toMatchObject({
        transport: "DISABLED",
        paymentId: validCommand.paymentId,
        orderId: validCommand.orderId,
        amountMinor: 12550,
        currency: "EGP",
      });
      expect(descriptor).not.toHaveProperty("providerReference");
      expect(descriptor).not.toHaveProperty("checkoutUrl");
      expect(descriptor).not.toHaveProperty("expiresAt");
    }
  });

  it("validates the provider-neutral result contract and never carries sensitive fields", () => {
    const result = createProviderPaymentResult({
      ...validCommand,
      provider: PROVIDERS.PAYMOB,
      status: "pending",
      providerPaymentId: "intent-123",
      providerReference: "provider-ref-123",
      checkoutUrl: "https://checkout.example.test/session",
    });
    expect(result).toMatchObject({
      provider: PROVIDERS.PAYMOB,
      paymentId: validCommand.paymentId,
      amountMinor: 12550,
      currency: "EGP",
      status: "pending",
      providerPaymentId: "intent-123",
      providerReference: "provider-ref-123",
    });
    expect(result.providerPaymentId).toBe("intent-123");
    expect(result).not.toHaveProperty("providerTransactionId");
    expect(result.checkoutUrl).toBe("https://checkout.example.test/session");
    expect(result).not.toHaveProperty("errorCode");
    expect(() => createProviderPaymentResult({ ...validCommand, provider: PROVIDERS.PAYMOB, status: "paid" }))
      .toThrow("status");
    expect(() => createProviderPaymentResult({ ...validCommand, provider: PROVIDERS.PAYMOB, status: "pending", cardNumber: "never-echo" }))
      .toThrow("Sensitive payment data");
    expect(() => createProviderPaymentResult({ ...validCommand, provider: PROVIDERS.PAYMOB, status: "pending", checkoutUrl: "http://insecure.test" }))
      .toThrow("HTTPS");
  });

  it("returns unsupported errors for methods not verified for the selected provider", async () => {
    await expect(testAdapter(PROVIDERS.PAYMOB).createPayment({
      ...validCommand,
      paymentMethodType: PAYMENT_METHODS.INSTAPAY,
    })).rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.UNSUPPORTED_PAYMENT_METHOD });
  });

  it("omits provider reference, checkout URL, expiry, and error fields when absent", () => {
    const result = createProviderPaymentResult({
      paymentId: validCommand.paymentId,
      orderId: validCommand.orderId,
      amountMinor: validCommand.amountMinor,
      currency: validCommand.currency,
      paymentMethodType: validCommand.paymentMethodType,
      idempotencyKey: validCommand.idempotencyKey,
      provider: PROVIDERS.FAWRY,
      status: "pending",
    });
    for (const field of ["providerPaymentId", "providerReference", "providerTransactionId", "checkoutUrl", "expiresAt", "errorCode"]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("normalizes provider failures and safe log records without echoing secret messages", () => {
    const failure = normalizeProviderError(PROVIDERS.PAYMOB, "createPayment", new Error("secret=do-not-log"));
    expect(failure).toMatchObject({ provider: PROVIDERS.PAYMOB, code: "PROVIDER_UNAVAILABLE", outcome: "unknown", retryable: false });
    expect(JSON.stringify(failure)).not.toContain("do-not-log");
    const unsafeProviderCode = normalizeProviderError(PROVIDERS.PAYMOB, "createPayment", Object.assign(new Error("private"), { code: "SECRET_API_TOKEN_very-private" }));
    expect(unsafeProviderCode.code).toBe("PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(unsafeProviderCode)).not.toContain("SECRET_API_TOKEN");
    const timeout = normalizeProviderError(PROVIDERS.PAYMOB, "createPayment", Object.assign(new Error("timeout"), { code: "PROVIDER_TIMEOUT" }));
    expect(timeout.code).toBe("PROVIDER_TIMEOUT");
    const decline = normalizeProviderError(PROVIDERS.PAYMOB, "createPayment", Object.assign(new Error("private"), { code: PROVIDER_ERROR_CODES.PAYMENT_DECLINED }));
    expect(decline.code).toBe(PROVIDER_ERROR_CODES.PAYMENT_DECLINED);
    const unknownContext = normalizeProviderError("arbitrary-secret-provider", "secret-operation", new Error("private"));
    expect(unknownContext).toMatchObject({ provider: null, operation: "unknown", code: "PROVIDER_UNAVAILABLE" });
    expect(JSON.stringify(unknownContext)).not.toContain("arbitrary-secret-provider");

    const record = createSafeProviderLogRecord({
      provider: PROVIDERS.KASHIER,
      operation: "createPayment",
      code: "PROVIDER_TIMEOUT",
      correlationId: "e68f6f50-8f63-4f1c-90ca-eaa6a82f25f1",
      paymentId: validCommand.paymentId,
      elapsedMs: 42,
    });
    expect(record).toMatchObject({ event: "payment_provider_operation", provider: PROVIDERS.KASHIER, code: "PROVIDER_TIMEOUT" });
    expect(JSON.stringify(record)).not.toMatch(/secret|pan|cvv|otp|pin/i);
    expect(createSafeProviderLogRecord({ provider: PROVIDERS.KASHIER, operation: "createPayment", code: "API_KEY_LEAK" }).code)
      .toBe("PROVIDER_UNAVAILABLE");
  });
});
