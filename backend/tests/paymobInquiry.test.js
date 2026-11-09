const PaymobProvider = require("../providers/paymobProvider");

const API_KEY = "unit-test-api-key";
const TRANSACTION_ID = "987654321";
const PAYMENT_ID = "e68f6f50-8f63-4f1c-90ca-eaa6a82f25f1";

function tokenWithExpiry(exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp })}.mock-signature`;
}

function env(overrides = {}) {
  return {
    PAYMOB_ENVIRONMENT: "TEST",
    PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED: "true",
    PAYMOB_TEST_API_BASE_URL: "https://accept.paymob.com",
    PAYMOB_TEST_API_KEY: API_KEY,
    PAYMOB_TEST_INTEGRATION_ID: "12345",
    ...overrides,
  };
}

function inquiryResponse(overrides = {}) {
  return {
    id: Number(TRANSACTION_ID),
    pending: false,
    amount_cents: 12550,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    integration_id: 12345,
    integration_type: "card",
    has_parent_transaction: false,
    order: { id: 7654321 },
    currency: "EGP",
    error_occured: false,
    is_live: false,
    is_captured: true,
    captured_amount: 12550,
    ...overrides,
  };
}

function payment() {
  return {
    paymentId: PAYMENT_ID,
    provider: "paymob",
    providerPaymentId: "pi_test_saved",
    providerTransactionId: TRANSACTION_ID,
    amountMinor: 12550,
    currency: "EGP",
  };
}

function setup({ providerEnv = env() } = {}) {
  const expiry = Math.floor(Date.now() / 1000) + 600;
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: tokenWithExpiry(expiry) }) })
    .mockResolvedValue({ ok: true, json: async () => inquiryResponse() });
  const attemptRepository = {
    findPaymobSessionByPaymentId: jest.fn().mockResolvedValue({
      paymentId: PAYMENT_ID,
      providerPaymentId: "pi_test_saved",
      providerReference: "7654321",
    }),
  };
  const provider = new PaymobProvider({ env: providerEnv, fetchImpl, attemptRepository });
  return { provider, fetchImpl, attemptRepository };
}

describe("Paymob TEST Transaction Inquiry", () => {
  it("authenticates with the TEST API Key and queries the stored transaction with a cached Bearer token", async () => {
    const { provider, fetchImpl, attemptRepository } = setup();
    const observed = await provider.inquirePayment(payment());
    await provider.inquirePayment(payment());

    expect(attemptRepository.findPaymobSessionByPaymentId).toHaveBeenCalledWith(PAYMENT_ID);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://accept.paymob.com/api/auth/tokens");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ api_key: API_KEY });
    expect(fetchImpl.mock.calls[1][0]).toBe(`https://accept.paymob.com/api/acceptance/transactions/${TRANSACTION_ID}`);
    expect(fetchImpl.mock.calls[1][1].method).toBe("GET");
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toMatch(/^Bearer /);
    expect(observed).toMatchObject({
      provider: "paymob",
      providerTransactionId: TRANSACTION_ID,
      orderReference: "7654321",
      status: "captured",
      amountMinor: 12550,
      currency: "EGP",
      capturedAmountMinor: 12550,
      isCaptured: true,
      integrationId: 12345,
      isLive: false,
      parentRelationshipVerified: true,
    });
    expect(JSON.stringify(observed)).not.toContain(API_KEY);
  });

  it("shares one in-flight authentication request across concurrent inquiries", async () => {
    const { provider, fetchImpl } = setup();
    const [first, second] = await Promise.all([
      provider.inquirePayment(payment()),
      provider.inquirePayment(payment()),
    ]);

    expect(first).toMatchObject({ providerTransactionId: TRANSACTION_ID });
    expect(second).toMatchObject({ providerTransactionId: TRANSACTION_ID });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });

  it("refreshes the auth token before its expiry", async () => {
    let now = Date.now();
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: tokenWithExpiry(Math.floor(now / 1000) + 60) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => inquiryResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: tokenWithExpiry(Math.floor(now / 1000) + 600) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => inquiryResponse() });
    const provider = new PaymobProvider({
      env: env(),
      fetchImpl,
      attemptRepository: { findPaymobSessionByPaymentId: jest.fn().mockResolvedValue({
        providerPaymentId: "pi_test_saved",
        providerReference: "7654321",
      }) },
    });

    try {
      await provider.inquirePayment(payment());
      now += 31000;
      await provider.inquirePayment(payment());
      expect(fetchImpl.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("rejects unsafe configuration and does not fall back to generic credentials", async () => {
    const missingScopedKey = setup({ providerEnv: env({ PAYMOB_TEST_API_KEY: undefined, PAYMOB_API_KEY: API_KEY }) });
    await expect(missingScopedKey.provider.inquirePayment(payment()))
      .rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
    expect(missingScopedKey.fetchImpl).not.toHaveBeenCalled();

    const live = setup({ providerEnv: env({ PAYMOB_ENVIRONMENT: "LIVE" }) });
    await expect(live.provider.inquirePayment(payment())).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
    expect(live.fetchImpl).not.toHaveBeenCalled();

    const disabled = setup({ providerEnv: env({ PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED: "false" }) });
    await expect(disabled.provider.inquirePayment(payment())).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
    expect(disabled.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "0", "not-an-integration-id"])(
    "rejects a missing or invalid TEST integration ID (%s) before network access",
    async (integrationId) => {
      const configured = setup({ providerEnv: env({ PAYMOB_TEST_INTEGRATION_ID: integrationId }) });
      await expect(configured.provider.inquireTransaction({
        transactionId: TRANSACTION_ID,
        amountMinor: 12550,
        currency: "EGP",
        orderReference: "7654321",
      })).rejects.toMatchObject({ code: "PROVIDER_CONFIGURATION_ERROR" });
      expect(configured.fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("fails closed when the token is not a JWT with a usable expiry", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "opaque-token" }) });
    const provider = new PaymobProvider({ env: env(), fetchImpl });
    await expect(provider.inquireTransaction({
      transactionId: TRANSACTION_ID, amountMinor: 12550, currency: "EGP", orderReference: "7654321",
    })).rejects.toMatchObject({ code: "PROVIDER_AUTHENTICATION_FAILED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["pending", { pending: true, is_captured: false, captured_amount: 0 }, "pending"],
    ["authorized", { is_standalone_payment: false, is_auth: true, is_captured: false, captured_amount: 0 }, "authorized"],
    ["failed", { success: false, is_captured: false, captured_amount: 0 }, "failed"],
  ])("normalizes a validated %s inquiry without assuming capture", async (_label, overrides, expectedStatus) => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: tokenWithExpiry(Math.floor(Date.now() / 1000) + 600) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => inquiryResponse(overrides) });
    const provider = new PaymobProvider({
      env: env(),
      fetchImpl,
      attemptRepository: { findPaymobSessionByPaymentId: jest.fn().mockResolvedValue({
        providerPaymentId: "pi_test_saved",
        providerReference: "7654321",
      }) },
    });
    await expect(provider.inquirePayment(payment())).resolves.toMatchObject({ status: expectedStatus });
  });

  it.each([
    ["success-only", { is_captured: false, captured_amount: 0, is_auth: false }],
    ["partial capture", { captured_amount: 10000 }],
    ["wrong transaction", { id: 987654320 }],
    ["wrong integration", { integration_id: 99999 }],
    ["live transaction", { is_live: true }],
    ["wrong order", { order: { id: 1111 } }],
    ["wrong amount", { amount_cents: 12551 }],
    ["inconsistent integer amount", { amount_cents_int: 12551 }],
    ["inconsistent captured integer amount", { captured_amount_int: 12549 }],
    ["success with provider error", { error_occured: true }],
    ["wrong currency", { currency: "USD" }],
    ["missing captured amount", { captured_amount: undefined }],
    ["refund", { is_refunded: true }],
    ["void", { is_voided: true }],
    ["missing parent reference", { has_parent_transaction: true, parent_transaction: undefined }],
    ["capture without parent", { is_capture: true, is_standalone_payment: false }],
    ["contradictory parent reference", { has_parent_transaction: false, parent_transaction: "7654320" }],
  ])("rejects %s inquiry evidence", async (_label, overrides) => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: tokenWithExpiry(Math.floor(Date.now() / 1000) + 600) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => inquiryResponse(overrides) });
    const provider = new PaymobProvider({
      env: env(),
      fetchImpl,
      attemptRepository: { findPaymobSessionByPaymentId: jest.fn().mockResolvedValue({
        providerPaymentId: "pi_test_saved",
        providerReference: "7654321",
      }) },
    });
    await expect(provider.inquirePayment(payment())).rejects.toMatchObject({ code: "PROVIDER_VALIDATION_FAILED" });
  });

  it("marks an otherwise valid parent transaction as unbound for manual review", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: tokenWithExpiry(Math.floor(Date.now() / 1000) + 600) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => inquiryResponse({
        is_capture: true,
        is_standalone_payment: false,
        has_parent_transaction: true,
        parent_transaction: "987654320",
      }) });
    const provider = new PaymobProvider({
      env: env(),
      fetchImpl,
      attemptRepository: { findPaymobSessionByPaymentId: jest.fn().mockResolvedValue({
        providerPaymentId: "pi_test_saved",
        providerReference: "7654321",
      }) },
    });
    await expect(provider.inquirePayment(payment())).resolves.toMatchObject({
      status: "captured",
      hasParentTransaction: true,
      parentTransactionId: "987654320",
      parentRelationshipVerified: false,
    });
  });
});
