const { ProviderExecutionService } = require("../services/providerExecutionService");
const PaymobProvider = require("../providers/paymobProvider");
const { WEBHOOK_VERIFICATION_STATUS } = require("../providers/webhookContract");
const PaymentExecutionAttemptRepository = require("../repositories/paymentExecutionAttemptRepository");
const PaymentExecutionAttempt = require("../models/paymentExecutionAttemptModel");
const { resolveProvider } = require("../providers");

const PAYMENT_ID = "e68f6f50-8f63-4f1c-90ca-eaa6a82f25f1";
const ORDER_ID = "507f1f77bcf86cd799439011";
const CUSTOMER_ID = "507f191e810c19729de860ea";
const SECRET_KEY = "egy_sk_test_offline-only";
const CLIENT_SECRET = "egy_csk_test_offline-only";

function testEnv(overrides = {}) {
  return {
    PAYMOB_ENVIRONMENT: "TEST",
    PAYMOB_TEST_EXECUTION_ENABLED: "true",
    PAYMOB_TEST_API_BASE_URL: "https://accept.paymob.com",
    PAYMOB_TEST_PUBLIC_KEY: "egy_pk_test_offline-only",
    PAYMOB_TEST_SECRET_KEY: SECRET_KEY,
    PAYMOB_TEST_INTEGRATION_ID: "12345",
    PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY: "22".repeat(32),
    PAYMOB_CHECKOUT_RESULT_KEYRING: JSON.stringify({ "execution-test": "22".repeat(32) }),
    PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID: "execution-test",
    ...overrides,
  };
}

function fixture({ status = "created", env = testEnv(), orderOverrides = {}, paymentOverrides = {} } = {}) {
  const payment = {
    paymentId: PAYMENT_ID,
    orderId: { toString: () => ORDER_ID },
    customerId: { toString: () => CUSTOMER_ID },
    provider: "paymob",
    amountMinor: 12550,
    currency: "EGP",
    paymentMethodType: "card",
    status,
    idempotencyKey: "payment-execute-0001",
    metadata: { channel: "web" },
    ...paymentOverrides,
  };
  const order = {
    _id: ORDER_ID,
    user: { email: "customer@example.test" },
    status: "pending_payment",
    items: [{ name: "Test item", quantity: 1, lineTotalMinor: 12550 }],
    shippingAddress: {
      fullName: "Ada Lovelace", phone: "+201000000000", line1: "1 Main Street", line2: "Unit 2",
      city: "Cairo", state: "Cairo", postalCode: "11511", country: "EG",
    },
    commercialSnapshot: { grandTotalMinor: 12550, currency: "EGP" },
    ...orderOverrides,
  };
  const paymentRepository = {
    findByPaymentId: jest.fn().mockResolvedValue(payment),
    updateProviderPaymentReference: jest.fn().mockResolvedValue({ matchedCount: 1 }),
  };
  const orderSnapshotRepository = {
    findOwnedOrderSnapshotForExecution: jest.fn().mockResolvedValue(order),
    findOwnedOrderSnapshot: jest.fn().mockResolvedValue(order),
  };
  const attemptStore = new Map();
  const executionAttemptRepository = {
    findByPaymentId: jest.fn(async (paymentId) => attemptStore.get(paymentId) || null),
    reserve: jest.fn(async ({ paymentId, orderId }) => {
      if ([...attemptStore.values()].some((entry) => entry.paymentId === paymentId || entry.orderId === orderId)) return false;
      attemptStore.set(paymentId, { paymentId, orderId, status: "REQUESTING" });
      return true;
    }),
    mark: jest.fn(async (paymentId, state, fields = {}) => {
      const entry = attemptStore.get(paymentId);
      if (!entry || entry.status !== "REQUESTING") return { matchedCount: 0 };
      Object.assign(entry, fields, { status: state });
      return { matchedCount: 1 };
    }),
  };
  const fetchImpl = jest.fn().mockResolvedValue({
    status: 201,
    text: async () => JSON.stringify({
      id: "pi_test_offline123",
      intention_order_id: 123456,
      client_secret: CLIENT_SECRET,
      status: "intended",
      confirmed: false,
    }),
  });
  const service = new ProviderExecutionService({
    paymentRepository,
    orderSnapshotRepository,
    env,
    fetchImpl,
    executionAttemptRepository,
  });
  return { service, payment, order, paymentRepository, orderSnapshotRepository, attemptStore, executionAttemptRepository, fetchImpl, env };
}

describe("Paymob TEST hosted checkout execution", () => {
  it("fails closed by default and rejects LIVE configuration explicitly", async () => {
    const commandSetup = fixture();
    const command = {
      paymentId: PAYMENT_ID, orderId: ORDER_ID, amountMinor: 12550, currency: "EGP", paymentMethodType: "card",
      idempotencyKey: "payment-execute-0001",
      paymobOrderContext: { order: commandSetup.order, customerEmail: "customer@example.test" },
    };
    const disabled = new PaymobProvider({ env: testEnv({ PAYMOB_TEST_EXECUTION_ENABLED: "false" }), fetchImpl: jest.fn() });
    await expect(disabled.createPayment(command)).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
    const live = new PaymobProvider({ env: testEnv({ PAYMOB_ENVIRONMENT: "LIVE" }), fetchImpl: jest.fn() });
    await expect(live.createPayment(command)).rejects.toMatchObject({ code: "PROVIDER_CONFIGURATION_ERROR" });
    expect(disabled.fetchImpl).not.toHaveBeenCalled();
    expect(live.fetchImpl).not.toHaveBeenCalled();
    expect(() => resolveProvider("paymob", {
      configReader: () => ({ configured: true }),
      adapterFactories: { paymob: PaymobProvider },
    })).toThrow(expect.objectContaining({ code: "PROVIDER_DISABLED" }));
  });

  it("fails closed when TEST credentials or explicit test configuration are missing", async () => {
    const missingSecret = fixture({ env: testEnv({ PAYMOB_TEST_SECRET_KEY: "" }) });
    await expect(missingSecret.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
    expect(missingSecret.fetchImpl).not.toHaveBeenCalled();
    const noFlag = fixture({ env: testEnv({ PAYMOB_TEST_EXECUTION_ENABLED: "false" }) });
    await expect(noFlag.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
    expect(noFlag.fetchImpl).not.toHaveBeenCalled();

    const liveService = fixture({ env: testEnv({ PAYMOB_ENVIRONMENT: "LIVE" }) });
    await expect(liveService.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_CONFIGURATION_ERROR" });
    expect(liveService.fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the documented authenticated Intention request from persisted Payment and Order data", async () => {
    const setup = fixture();
    const result = await setup.service.executePayment({ paymentId: PAYMENT_ID });
    const [url, options] = setup.fetchImpl.mock.calls[0];
    expect(url).toBe("https://accept.paymob.com/v1/intention/");
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers).toEqual({
      Authorization: `Token ${SECRET_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(JSON.parse(options.body)).toEqual({
      amount: 12550,
      currency: "EGP",
      payment_methods: [12345],
      items: [{ name: "Test item", amount: 12550, quantity: 1 }],
      billing_data: {
        first_name: "Ada", last_name: "Lovelace", phone_number: "+201000000000", street: "1 Main Street",
        building: "NA", apartment: "Unit 2", floor: "NA", city: "Cairo", state: "Cairo", country: "EG",
        postal_code: "11511", email: "customer@example.test",
      },
      special_reference: PAYMENT_ID,
    });
    expect(result).toMatchObject({
      provider: "paymob", paymentId: PAYMENT_ID, orderId: ORDER_ID, amountMinor: 12550,
      currency: "EGP", status: "pending", environment: "TEST", providerPaymentId: "pi_test_offline123",
      providerReference: "123456", checkoutUrl: expect.stringContaining("https://eg.checkout.paymob.com/"),
    });
    const checkout = new URL(result.checkoutUrl);
    expect(checkout.searchParams.get("publicKey")).toBe("egy_pk_test_offline-only");
    expect(checkout.searchParams.get("clientSecret")).toBe(CLIENT_SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
    expect(options.headers.Authorization).toBe(`Token ${SECRET_KEY}`);
    expect(setup.paymentRepository.updateProviderPaymentReference).not.toHaveBeenCalled();
    expect(setup.payment.status).toBe("created");
  });

  it("does not accept caller-supplied financial values or execute invalid Payment states", async () => {
    const setup = fixture();
    await expect(setup.service.executePayment({ paymentId: PAYMENT_ID, amountMinor: 1, currency: "USD" }))
      .rejects.toMatchObject({ code: "INVALID_PROVIDER_COMMAND" });
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    const invalidState = fixture({ status: "failed" });
    await expect(invalidState.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PAYMENT_ALREADY_PROCESSED" });
    expect(invalidState.fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid Order snapshot items and incomplete billing data before network access", async () => {
    const mismatch = fixture({ orderOverrides: { items: [{ name: "Mismatch", quantity: 1, lineTotalMinor: 1 }] } });
    await expect(mismatch.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PAYMENT_AMOUNT_MISMATCH" });
    expect(mismatch.fetchImpl).not.toHaveBeenCalled();
    const missingBilling = fixture({ orderOverrides: { shippingAddress: { fullName: "OneName", country: "EG" } } });
    await expect(missingBilling.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_VALIDATION_FAILED" });
    expect(missingBilling.fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes authentication failure and timeout without exposing response or secret data", async () => {
    const auth = fixture();
    auth.fetchImpl.mockResolvedValue({ status: 401, text: async () => `rejected ${SECRET_KEY}` });
    await expect(auth.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_AUTHENTICATION_FAILED", message: "Provider operation did not complete. Reconcile before retrying." });
    expect(auth.attemptStore.get(PAYMENT_ID).status).toBe("REJECTED");

    const timeout = fixture();
    timeout.fetchImpl.mockRejectedValue(Object.assign(new Error(SECRET_KEY), { name: "TimeoutError" }));
    await expect(timeout.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_TIMEOUT", message: "Provider operation did not complete. Reconcile before retrying." });
    expect(timeout.attemptStore.get(PAYMENT_ID).status).toBe("UNKNOWN");

    const rejected = fixture();
    rejected.fetchImpl.mockResolvedValue({ status: 422, text: async () => `invalid ${SECRET_KEY}` });
    await expect(rejected.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_REJECTED", message: "Provider operation did not complete. Reconcile before retrying." });
    expect(rejected.attemptStore.get(PAYMENT_ID).status).toBe("REJECTED");
  });

  it("rejects malformed responses and missing client secrets without fabricating a URL", async () => {
    const setup = fixture();
    setup.fetchImpl.mockResolvedValue({ status: 201, text: async () => JSON.stringify({ id: "pi_test_1", intention_order_id: 1, status: "intended", confirmed: false }) });
    await expect(setup.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_VALIDATION_FAILED" });
    expect(setup.attemptStore.get(PAYMENT_ID).status).toBe("UNKNOWN");
  });

  it("uses durable attempt reservation to block duplicate or ambiguous execution", async () => {
    const setup = fixture();
    const first = await setup.service.executePayment({ paymentId: PAYMENT_ID });
    expect(first.status).toBe("pending");
    const replay = await setup.service.executePayment({ paymentId: PAYMENT_ID });
    expect(replay.checkoutUrl).toBe(first.checkoutUrl);
    expect(setup.fetchImpl).toHaveBeenCalledTimes(1);

    const ambiguous = fixture();
    ambiguous.fetchImpl.mockRejectedValue(new Error("socket disconnected"));
    await expect(ambiguous.service.executePayment({ paymentId: PAYMENT_ID })).rejects.toBeDefined();
    await expect(ambiguous.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_OUTCOME_UNKNOWN" });
    expect(ambiguous.fetchImpl).toHaveBeenCalledTimes(1);
    expect(ambiguous.attemptStore.get(PAYMENT_ID).status).toBe("UNKNOWN");
  });

  it("serializes concurrent same-key provider execution and returns one saved checkout result", async () => {
    const setup = fixture();
    const [first, second] = await Promise.all([
      setup.service.executePayment({ paymentId: PAYMENT_ID }),
      setup.service.executePayment({ paymentId: PAYMENT_ID }),
    ]);
    expect(first.checkoutUrl).toBe(second.checkoutUrl);
    expect(setup.fetchImpl).toHaveBeenCalledTimes(1);
    expect(setup.attemptStore.get(PAYMENT_ID).status).toBe("SESSION_CREATED");
  });

  it("keeps a legacy session without encrypted checkout data blocked from automatic execution", async () => {
    const setup = fixture();
    setup.attemptStore.set(PAYMENT_ID, {
      paymentId: PAYMENT_ID,
      orderId: ORDER_ID,
      status: "SESSION_CREATED",
      providerPaymentId: "pi_test_legacy",
      providerReference: "123456",
      checkoutUrl: null,
    });
    await expect(setup.service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_EXECUTION_UNRECOVERABLE" });
    expect(setup.fetchImpl).not.toHaveBeenCalled();
  });

  it("enforces at-most-once reservation with durable unique Payment and Order keys", async () => {
    await PaymentExecutionAttempt.init();
    const repository = new PaymentExecutionAttemptRepository();
    const samePayment = await Promise.all(Array.from({ length: 8 }, () => repository.reserve({ paymentId: PAYMENT_ID, orderId: ORDER_ID, provider: "paymob" })));
    expect(samePayment.filter(Boolean)).toHaveLength(1);
    expect(await repository.reserve({ paymentId: "f68f6f50-8f63-4f1c-90ca-eaa6a82f25f2", orderId: ORDER_ID, provider: "paymob" })).toBe(false);
    expect(await PaymentExecutionAttempt.countDocuments({ orderId: ORDER_ID })).toBe(1);
  });

  it("keeps Paymob webhook handling gated and cannot mark a Payment captured from session creation", async () => {
    const setup = fixture();
    const result = await setup.service.executePayment({ paymentId: PAYMENT_ID });
    expect(result.status).toBe("pending");
    expect(setup.payment.status).toBe("created");
    await expect(new PaymobProvider().verifyWebhook({ rawBody: Buffer.from("{}") }))
      .resolves.toEqual({ status: WEBHOOK_VERIFICATION_STATUS.DISABLED_PROVIDER });
  });
});
