const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/usermodel");
const Order = require("../models/orderModel");
const Payment = require("../models/paymentModel");
const PaymentLedgerEntry = require("../models/paymentLedgerEntryModel");
const PaymentIdempotency = require("../models/paymentIdempotencyModel");
const PaymentExecutionAttempt = require("../models/paymentExecutionAttemptModel");
const PaymentExecutionAttemptRepository = require("../repositories/paymentExecutionAttemptRepository");
const { encryptCheckoutUrl } = require("../utils/paymobCheckoutResultCrypto");
const { PaymentService, createPaymentCommandSchema } = require("../services/paymentService");
const { ProviderExecutionService } = require("../services/providerExecutionService");
const PaymentLedgerRepository = require("../repositories/paymentLedgerRepository");
const { assertPaymentTransition } = require("../utils/paymentStateMachine");

const paymentService = new PaymentService();

async function createUser(suffix = "owner") {
  const user = await User.create({
    name: `Payment ${suffix}`,
    email: `payment-${suffix}-${Date.now()}@example.com`,
    password: "Passw0rd!",
    role: "user",
    emailVerified: true,
  });
  return {
    user,
    token: jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" }),
  };
}

async function createPendingPaymentOrder(user, {
  withSnapshot = true,
  status = "pending_payment",
  amountMinor = 12550,
  currency = "EGP",
  paymentMethod = "card",
} = {}) {
  const orderId = new mongoose.Types.ObjectId();
  const document = {
    _id: orderId,
    user: user._id,
    status,
    paymentMethod,
  };
  if (withSnapshot) {
    document.commercialSnapshot = { grandTotalMinor: amountMinor, currency };
  }
  await Order.collection.insertOne(document);
  return orderId;
}

function createPaymentRequest(token, orderId, idempotencyKey = "api-payment-key-01", payload = {}) {
  return request(app)
    .post("/api/payments")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", idempotencyKey)
    .send({ orderId: orderId.toString(), ...payload });
}

function createPaymentIntentRequest(token, orderId, idempotencyKey = "api-paymob-intent-01", payload = {}) {
  return request(app)
    .post("/api/payments/intent")
    .set("Authorization", "Bearer " + token)
    .set("Idempotency-Key", idempotencyKey)
    .send({ orderId: orderId.toString(), ...payload });
}

function enablePaymobTestExecution(enabled = true, environment = "TEST") {
  const previousEnvironment = process.env.PAYMOB_ENVIRONMENT;
  const previousExecutionFlag = process.env.PAYMOB_TEST_EXECUTION_ENABLED;
  process.env.PAYMOB_ENVIRONMENT = environment;
  process.env.PAYMOB_TEST_EXECUTION_ENABLED = enabled ? "true" : "false";
  return () => {
    if (previousEnvironment === undefined) delete process.env.PAYMOB_ENVIRONMENT;
    else process.env.PAYMOB_ENVIRONMENT = previousEnvironment;
    if (previousExecutionFlag === undefined) delete process.env.PAYMOB_TEST_EXECUTION_ENABLED;
    else process.env.PAYMOB_TEST_EXECUTION_ENABLED = previousExecutionFlag;
  };
}

function mockPaymobCheckout() {
  let externalSessionCreates = 0;
  const spy = jest.spyOn(ProviderExecutionService.prototype, "executePayment").mockImplementation(async ({ paymentId }) => {
    const payment = await Payment.findOne({ paymentId });
    const checkoutUrl = "https://eg.checkout.paymob.com/?publicKey=test-public&clientSecret=test-client";
    const repository = new PaymentExecutionAttemptRepository();
    let attempt = await repository.findByPaymentId(paymentId);
    if (!attempt) {
      externalSessionCreates += 1;
      await repository.reserve({ paymentId, orderId: payment.orderId, provider: "paymob" });
      await repository.mark(paymentId, "SESSION_CREATED", {
        providerPaymentId: `paymob-session-${paymentId}`, providerReference: "7654321", checkoutUrl,
      });
      attempt = await repository.findByPaymentId(paymentId);
    }
    return {
      provider: "paymob",
      paymentId,
      orderId: payment.orderId.toString(),
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      paymentMethodType: payment.paymentMethodType,
      status: "pending",
      providerPaymentId: attempt.providerPaymentId,
      providerReference: attempt.providerReference,
      checkoutUrl: attempt.checkoutUrl,
      environment: "TEST",
    };
  });
  spy.externalSessionCreates = () => externalSessionCreates;
  return spy;
}

beforeAll(async () => {
  await Promise.all([Payment.init(), PaymentLedgerEntry.init(), PaymentIdempotency.init(), PaymentExecutionAttempt.init()]);
});

describe("Payment foundation", () => {
  it("requires authentication for the Payment creation API", async () => {
    const res = await request(app).post("/api/payments").send({ orderId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(401);
  });

  it("creates an owner-scoped Payment from the Order snapshot and appends one initial ledger event", async () => {
    const owner = await createUser("api-create");
    const orderId = await createPendingPaymentOrder(owner.user, { amountMinor: 18425, currency: "EGP" });
    const fetchSpy = jest.spyOn(global, "fetch");

    const res = await createPaymentRequest(owner.token, orderId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "success",
      data: {
        orderId: orderId.toString(),
        amountMinor: 18425,
        currency: "EGP",
        paymentMethodType: "card",
        status: "created",
      },
    });
    expect(res.body.data.paymentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.data).not.toHaveProperty("provider");
    expect(res.body.data).not.toHaveProperty("providerPaymentId");
    expect(res.body.data).not.toHaveProperty("checkoutUrl");
    expect(res.body.data).not.toHaveProperty("idempotencyKey");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const payment = await Payment.findOne({ paymentId: res.body.data.paymentId });
    expect(payment.provider).toBe("deferred");
    expect(payment.providerPaymentId).toBeNull();
    expect(payment.providerTransactionId).toBeNull();
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_created" })).toBe(1);
    expect(await PaymentIdempotency.countDocuments({ paymentId: payment.paymentId })).toBe(1);
  });

  it("persists Payment as created without invoking provider execution", async () => {
    const owner = await createUser("autoexec");
    const orderId = await createPendingPaymentOrder(owner.user);
    const executionSpy = jest.spyOn(PaymentService.prototype, "executePayment");

    try {
      const res = await createPaymentRequest(owner.token, orderId, "api-no-auto-execution-01");
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("created");
      expect(executionSpy).not.toHaveBeenCalled();
      const payment = await Payment.findOne({ paymentId: res.body.data.paymentId });
      expect(payment.status).toBe("created");
      expect(payment.provider).toBe("deferred");
    } finally {
      executionSpy.mockRestore();
    }
  });

  it("initiates authorized TEST checkout from the owned Order and atomically binds the provider session", async () => {
    const restoreEnvironment = enablePaymobTestExecution();
    const executionSpy = mockPaymobCheckout();
    try {
      const owner = await createUser("paymob-checkout");
      const orderId = await createPendingPaymentOrder(owner.user, { amountMinor: 18425, currency: "EGP" });
      const response = await createPaymentIntentRequest(owner.token, orderId);

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        orderId: orderId.toString(),
        amountMinor: 18425,
        currency: "EGP",
        paymentMethodType: "card",
        status: "pending",
        checkoutUrl: expect.stringMatching(/^https:\/\/eg\.checkout\.paymob\.com\//),
      });
      expect(response.body.data).not.toHaveProperty("providerPaymentId");
      expect(response.body.data).not.toHaveProperty("apiKey");
      expect(executionSpy).toHaveBeenCalledWith({ paymentId: response.body.data.paymentId });

      const payment = await Payment.findOne({ paymentId: response.body.data.paymentId });
      expect(payment).toMatchObject({
        provider: "paymob",
        providerPaymentId: `paymob-session-${payment.paymentId}`,
        status: "pending",
        amountMinor: 18425,
        currency: "EGP",
      });
      const entries = await PaymentLedgerEntry.find({ paymentId: payment.paymentId }).sort({ recordedAt: 1 }).lean();
      expect(entries.map(({ eventType, fromStatus, toStatus }) => ({ eventType, fromStatus, toStatus }))).toEqual([
        { eventType: "payment_created", fromStatus: null, toStatus: "created" },
        { eventType: "payment_pending", fromStatus: "created", toStatus: "pending" },
      ]);

      const replay = await createPaymentIntentRequest(owner.token, orderId);
      expect(replay.status).toBe(201);
      expect(replay.body.data.checkoutUrl).toBe(response.body.data.checkoutUrl);
      expect(executionSpy.externalSessionCreates()).toBe(1);
      expect(await Payment.countDocuments({ orderId })).toBe(1);
    } finally {
      executionSpy.mockRestore();
      restoreEnvironment();
    }
  });

  it("adopts a durably recorded Paymob session after local persistence fails without creating another session", async () => {
    const restoreEnvironment = enablePaymobTestExecution();
    const executionSpy = mockPaymobCheckout();
    const originalAppend = PaymentLedgerRepository.prototype.append;
    const appendSpy = jest.spyOn(PaymentLedgerRepository.prototype, "append")
      .mockImplementationOnce(function appendInitialEntry(...args) { return originalAppend.apply(this, args); })
      .mockRejectedValueOnce(new Error("simulated local ledger failure"));
    try {
      const owner = await createUser("paymob-adopt");
      const orderId = await createPendingPaymentOrder(owner.user);
      const first = await createPaymentIntentRequest(owner.token, orderId, "intent-adopt-001");
      expect(first.status).toBe(500);
      const before = await Payment.findOne({ orderId });
      expect(before).toMatchObject({ status: "created", providerPaymentId: null });
      const attempt = await new PaymentExecutionAttemptRepository().findByPaymentId(before.paymentId);
      expect(attempt).toMatchObject({ status: "SESSION_CREATED", providerPaymentId: `paymob-session-${before.paymentId}` });
      expect(attempt.checkoutUrl).toMatch(/^https:\/\/eg\.checkout\.paymob\.com\//);
      const storedAttempt = await PaymentExecutionAttempt.findOne({ paymentId: before.paymentId }).select("+checkoutUrlEncrypted").lean();
      expect(storedAttempt.checkoutUrlEncrypted).not.toContain("test-client");

      const recovered = await createPaymentIntentRequest(owner.token, orderId, "intent-adopt-001");
      expect(recovered.status).toBe(201);
      expect(recovered.body.data.checkoutUrl).toBe(attempt.checkoutUrl);
      expect(executionSpy.externalSessionCreates()).toBe(1);
      expect(await Payment.findOne({ orderId })).toMatchObject({ status: "pending", providerPaymentId: attempt.providerPaymentId });
      expect(await PaymentLedgerEntry.countDocuments({ orderId, eventType: "payment_pending" })).toBe(1);
    } finally {
      appendSpy.mockRestore();
      executionSpy.mockRestore();
      restoreEnvironment();
    }
  });

  it("makes concurrent adoption idempotent with exactly one Payment transition and ledger event", async () => {
    const owner = await createUser("concurrent-adopt");
    const orderId = await createPendingPaymentOrder(owner.user);
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(), customerId: owner.user._id.toString(), provider: "paymob",
      idempotencyKey: "intent-concurrent-adopt-001",
    });
    const result = {
      provider: "paymob", paymentId: payment.paymentId, orderId: orderId.toString(),
      amountMinor: payment.amountMinor, currency: payment.currency, paymentMethodType: "card",
      status: "pending", providerPaymentId: "paymob-session-concurrent-adopt", providerReference: "7654322",
      checkoutUrl: "https://eg.checkout.paymob.com/?publicKey=test&clientSecret=test-client", environment: "TEST",
    };
    await expect(Promise.all([
      paymentService.recordProviderExecution(result),
      paymentService.recordProviderExecution(result),
    ])).resolves.toHaveLength(2);
    expect(await Payment.findOne({ paymentId: payment.paymentId })).toMatchObject({ status: "pending", providerPaymentId: result.providerPaymentId });
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_pending" })).toBe(1);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_created" })).toBe(1);
  });

  it("lazily re-encrypts old checkout ciphertext under the active key during safe replay", async () => {
    const owner = await createUser("paymob-key-rotation");
    const orderId = await createPendingPaymentOrder(owner.user);
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(), customerId: owner.user._id.toString(), provider: "paymob",
      idempotencyKey: "intent-key-rotate-001",
    });
    const checkoutUrl = "https://eg.checkout.paymob.com/?publicKey=test-public&clientSecret=test-client";
    const oldEnv = {
      PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID: "old-key",
      PAYMOB_CHECKOUT_RESULT_KEYRING: JSON.stringify({ "old-key": "aa".repeat(32) }),
    };
    const rotatedEnv = {
      PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID: "new-key",
      PAYMOB_CHECKOUT_RESULT_KEYRING: JSON.stringify({ "old-key": "aa".repeat(32), "new-key": "bb".repeat(32) }),
    };
    const oldCiphertext = encryptCheckoutUrl(checkoutUrl, oldEnv);
    await PaymentExecutionAttempt.create({
      paymentId: payment.paymentId, orderId, provider: "paymob", status: "SESSION_CREATED",
      providerPaymentId: "paymob-session-key-rotation", providerReference: "7654323", checkoutUrlEncrypted: oldCiphertext,
    });

    const recovered = await new PaymentExecutionAttemptRepository({ env: rotatedEnv }).findByPaymentId(payment.paymentId);
    expect(recovered.checkoutUrl).toBe(checkoutUrl);
    const stored = await PaymentExecutionAttempt.findOne({ paymentId: payment.paymentId }).select("+checkoutUrlEncrypted").lean();
    expect(stored.checkoutUrlEncrypted.startsWith("v2:new-key:")).toBe(true);
  });

  it("rejects amount/provider overrides on the checkout endpoint", async () => {
    const restoreEnvironment = enablePaymobTestExecution();
    const executionSpy = mockPaymobCheckout();
    try {
      const owner = await createUser("checkout-valid");
      const orderId = await createPendingPaymentOrder(owner.user);
      const response = await createPaymentIntentRequest(owner.token, orderId, "intent-override-001", {
        amountMinor: 1,
        amount: 1,
        currency: "USD",
        provider: "fawry",
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_PAYMENT_REQUEST");
      expect(executionSpy).not.toHaveBeenCalled();
      expect(await Payment.countDocuments({ orderId })).toBe(0);
    } finally {
      executionSpy.mockRestore();
      restoreEnvironment();
    }
  });

  it("rejects checkout when TEST execution is disabled without creating a Payment", async () => {
    const restoreEnvironment = enablePaymobTestExecution(false);
    const executionSpy = mockPaymobCheckout();
    try {
      const owner = await createUser("checkout-off");
      const orderId = await createPendingPaymentOrder(owner.user);
      const response = await createPaymentIntentRequest(owner.token, orderId, "intent-disabled-001");

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("PROVIDER_DISABLED");
      expect(executionSpy).not.toHaveBeenCalled();
      expect(await Payment.countDocuments({ orderId })).toBe(0);
    } finally {
      executionSpy.mockRestore();
      restoreEnvironment();
    }
  });

  it("rejects checkout when environment is LIVE", async () => {
    const restoreEnvironment = enablePaymobTestExecution(true, "LIVE");
    const executionSpy = mockPaymobCheckout();
    try {
      const owner = await createUser("checkout-live");
      const orderId = await createPendingPaymentOrder(owner.user);
      const response = await createPaymentIntentRequest(owner.token, orderId, "intent-live-001");

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("PROVIDER_CONFIGURATION_ERROR");
      expect(executionSpy).not.toHaveBeenCalled();
      expect(await Payment.countDocuments({ orderId })).toBe(0);
    } finally {
      executionSpy.mockRestore();
      restoreEnvironment();
    }
  });

  it("does not mark a Payment pending when provider execution fails", async () => {
    const restoreEnvironment = enablePaymobTestExecution();
    const executionSpy = jest.spyOn(ProviderExecutionService.prototype, "executePayment")
      .mockRejectedValue(Object.assign(new Error("provider unavailable"), {
        code: "PROVIDER_UNAVAILABLE",
        isOperational: true,
      }));
    try {
      const owner = await createUser("checkout-failed");
      const orderId = await createPendingPaymentOrder(owner.user);
      const response = await createPaymentIntentRequest(owner.token, orderId, "intent-failed-001");

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("PROVIDER_UNAVAILABLE");
      const payment = await Payment.findOne({ orderId });
      expect(payment).toMatchObject({ provider: "paymob", status: "created", providerPaymentId: null });
      expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(1);
    } finally {
      executionSpy.mockRestore();
      restoreEnvironment();
    }
  });

  it("rolls back the provider reference and pending ledger transition when the database write fails", async () => {
    const owner = await createUser("exec-rollback");
    const orderId = await createPendingPaymentOrder(owner.user);
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "paymob",
      idempotencyKey: "provider-execution-rollback-01",
    });
    const providerExecutionService = {
      executePayment: jest.fn().mockResolvedValue({
        provider: "paymob",
        paymentId: payment.paymentId,
        orderId: orderId.toString(),
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentMethodType: "card",
        status: "pending",
        providerPaymentId: "paymob-session-rollback",
        checkoutUrl: "https://eg.checkout.paymob.com/?publicKey=test&clientSecret=test",
        environment: "TEST",
      }),
    };
    const service = new PaymentService({ providerExecutionService });
    const appendSpy = jest.spyOn(PaymentLedgerRepository.prototype, "append")
      .mockRejectedValueOnce(new Error("ledger write failed"));

    try {
      await expect(service.executePayment({ paymentId: payment.paymentId })).rejects.toThrow("ledger write failed");
      const storedPayment = await Payment.findOne({ paymentId: payment.paymentId });
      expect(storedPayment).toMatchObject({ status: "created", providerPaymentId: null });
      expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(1);
    } finally {
      appendSpy.mockRestore();
    }
  });

  it("rejects malformed Order IDs, client money, method/provider selection, and card data without leaking stack details", async () => {
    const owner = await createUser("api-validation");
    const invalidOrderId = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Idempotency-Key", "api-payment-key-02")
      .send({ orderId: "not-an-object-id" });
    expect(invalidOrderId.status).toBe(400);
    expect(invalidOrderId.body).not.toHaveProperty("stack");

    const orderId = await createPendingPaymentOrder(owner.user);
    for (const payload of [
      { amount: 1 }, { currency: "USD" }, { total: 1 }, { subtotal: 1 },
      { discount: 1 }, { shipping: 1 }, { tax: 1 }, { unitPrice: 1 },
      { lineTotal: 1 }, { provider: "paymob" }, { paymentMethodType: "wallet" },
      { cardNumber: "4111111111111111" }, { cvv: "123" }, { otp: "000000" }, { walletPin: "not-a-real-pin" },
    ]) {
      const rejected = await createPaymentRequest(owner.token, orderId, `api-validation-${Math.random().toString(36).slice(2, 12)}`, payload);
      expect(rejected.status).toBe(400);
      expect(rejected.body).not.toHaveProperty("stack");
      expect(rejected.body).not.toHaveProperty("error");
    }
    expect(await Payment.countDocuments({ orderId })).toBe(0);
  });

  it("rejects missing/foreign Orders, missing or invalid snapshots, wrong state, and deferred methods", async () => {
    const owner = await createUser("api-owner-checks");
    const other = await createUser("api-foreign-checks");
    const foreignOrderId = await createPendingPaymentOrder(owner.user);
    const foreign = await createPaymentRequest(other.token, foreignOrderId, "api-foreign-001");
    expect(foreign.status).toBe(404);
    expect(foreign.body).not.toHaveProperty("stack");

    const missingOrder = await createPaymentRequest(owner.token, new mongoose.Types.ObjectId(), "api-missing-001");
    expect(missingOrder.status).toBe(404);

    const noSnapshotId = await createPendingPaymentOrder(owner.user, { withSnapshot: false });
    const noSnapshot = await createPaymentRequest(owner.token, noSnapshotId, "api-no-snapshot-01");
    expect(noSnapshot.status).toBe(422);

    const badAmountId = await createPendingPaymentOrder(owner.user, { amountMinor: 0 });
    const badAmount = await createPaymentRequest(owner.token, badAmountId, "api-bad-amount-01");
    expect(badAmount.status).toBe(422);

    const badCurrencyId = await createPendingPaymentOrder(owner.user, { currency: "ZZZ" });
    const badCurrency = await createPaymentRequest(owner.token, badCurrencyId, "api-bad-currency-1");
    expect(badCurrency.status).toBe(422);

    const wrongStateId = await createPendingPaymentOrder(owner.user, { status: "shipped" });
    const wrongState = await createPaymentRequest(owner.token, wrongStateId, "api-wrong-state-01");
    expect(wrongState.status).toBe(409);

    const codOrderId = await createPendingPaymentOrder(owner.user, { paymentMethod: "cod" });
    const cod = await createPaymentRequest(owner.token, codOrderId, "api-cod-method-001");
    expect(cod.status).toBe(422);
    expect(await Payment.countDocuments()).toBe(0);
  });

  it("requires a valid Idempotency-Key header", async () => {
    const owner = await createUser("api-idempotency-header");
    const orderId = await createPendingPaymentOrder(owner.user);
    const missing = await request(app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ orderId: orderId.toString() });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("INVALID_IDEMPOTENCY_KEY");
    expect(await Payment.countDocuments({ orderId })).toBe(0);
  });

  it("returns the same Payment and ledger event on an idempotent retry", async () => {
    const owner = await createUser("api-idempotent");
    const orderId = await createPendingPaymentOrder(owner.user);
    const first = await createPaymentRequest(owner.token, orderId, "api-idempotency-001");
    const retry = await createPaymentRequest(owner.token, orderId, "api-idempotency-001");

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.data.paymentId).toBe(first.body.data.paymentId);
    expect(await Payment.countDocuments({ orderId })).toBe(1);
    expect(await PaymentLedgerEntry.countDocuments({ orderId, eventType: "payment_created" })).toBe(1);
  });

  it("conflicts when a key is reused and prevents another active Payment for the same Order", async () => {
    const owner = await createUser("api-key-conflict");
    const orderA = await createPendingPaymentOrder(owner.user);
    const orderB = await createPendingPaymentOrder(owner.user);
    const first = await createPaymentRequest(owner.token, orderA, "api-same-key-001");
    const conflict = await createPaymentRequest(owner.token, orderB, "api-same-key-001");
    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const newAttempt = await createPaymentRequest(owner.token, orderA, "api-new-key-0001");
    expect(newAttempt.status).toBe(409);
    expect(newAttempt.body.code).toBe("ACTIVE_PAYMENT_EXISTS");
    expect(await Payment.countDocuments({ orderId: orderA })).toBe(1);
  });

  it("keeps identical idempotency keys isolated between different authenticated users", async () => {
    const firstOwner = await createUser("api-key-a");
    const secondOwner = await createUser("api-key-b");
    const firstOrder = await createPendingPaymentOrder(firstOwner.user);
    const secondOrder = await createPendingPaymentOrder(secondOwner.user);

    const first = await createPaymentRequest(firstOwner.token, firstOrder, "api-cross-user-key-01");
    const second = await createPaymentRequest(secondOwner.token, secondOrder, "api-cross-user-key-01");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.paymentId).not.toBe(second.body.data.paymentId);
    expect(await Payment.countDocuments()).toBe(2);
  });

  it("deduplicates concurrent API requests with one Payment and one initial ledger event", async () => {
    const owner = await createUser("api-concurrent");
    const orderId = await createPendingPaymentOrder(owner.user);
    const results = await Promise.all([
      createPaymentRequest(owner.token, orderId, "api-concurrent-key-01"),
      createPaymentRequest(owner.token, orderId, "api-concurrent-key-01"),
    ]);

    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].body.data.paymentId).toBe(results[1].body.data.paymentId);
    expect(await Payment.countDocuments({ orderId })).toBe(1);
    expect(await PaymentLedgerEntry.countDocuments({ orderId, eventType: "payment_created" })).toBe(1);
  });

  it("stores integer minor units and explicit currency with a separate internal Payment ID", async () => {
    const owner = await createUser();
    const orderId = await createPendingPaymentOrder(owner.user);
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0001",
    });

    expect(payment.paymentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(payment.paymentId).not.toBe(payment.providerPaymentId);
    expect(payment.orderId.toString()).toBe(orderId.toString());
    expect(payment.customerId.toString()).toBe(owner.user._id.toString());
    expect(payment.amountMinor).toBe(12550);
    expect(payment.currency).toBe("EGP");
    expect(payment.status).toBe("created");

    const unsafeMetadata = new Payment({
      orderId,
      customerId: owner.user._id,
      provider: "stripe",
      amountMinor: 12550,
      currency: "EGP",
      paymentMethodType: "card",
      idempotencyKey: "payment-create-unsafe",
      idempotencyRequestHash: "a".repeat(64),
      metadata: { pan: "not-a-real-pan" },
    });
    await expect(unsafeMetadata.validate()).rejects.toHaveProperty("errors.metadata");

    const floatingPointAmount = new Payment({
      orderId,
      customerId: owner.user._id,
      provider: "stripe",
      amountMinor: 125.5,
      currency: "EGP",
      paymentMethodType: "card",
      idempotencyKey: "payment-create-float",
      idempotencyRequestHash: "c".repeat(64),
    });
    await expect(floatingPointAmount.validate()).rejects.toHaveProperty("errors.amountMinor");

    for (const invalidAmount of ["10.5", -1]) {
      const invalid = new Payment({
        orderId,
        customerId: owner.user._id,
        provider: "stripe",
        amountMinor: invalidAmount,
        currency: "EGP",
        paymentMethodType: "card",
        idempotencyKey: `payment-invalid-${String(invalidAmount).replace(/[^a-z0-9]/gi, "")}`,
        idempotencyRequestHash: "d".repeat(64),
      });
      await expect(invalid.validate()).rejects.toHaveProperty("errors.amountMinor");
    }

    const missingFields = new Payment({
      provider: "stripe",
      amountMinor: 100,
      currency: "EGP",
      paymentMethodType: "card",
      idempotencyKey: "payment-missing-fields",
      idempotencyRequestHash: "e".repeat(64),
    });
    await expect(missingFields.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        orderId: expect.anything(),
        customerId: expect.anything(),
      }),
    });

    const missingCurrency = new Payment({
      orderId,
      customerId: owner.user._id,
      provider: "stripe",
      amountMinor: 100,
      paymentMethodType: "card",
      idempotencyKey: "payment-missing-currency",
      idempotencyRequestHash: "f".repeat(64),
    });
    await expect(missingCurrency.validate()).rejects.toHaveProperty("errors.currency");

    const malformedCurrency = new Payment({
      orderId,
      customerId: owner.user._id,
      provider: "stripe",
      amountMinor: 100,
      currency: "US",
      paymentMethodType: "card",
      idempotencyKey: "payment-bad-currency",
      idempotencyRequestHash: "a".repeat(64),
    });
    await expect(malformedCurrency.validate()).rejects.toHaveProperty("errors.currency");

    const unsupportedCurrency = new Payment({
      orderId,
      customerId: owner.user._id,
      provider: "stripe",
      amountMinor: 100,
      currency: "ZZZ",
      paymentMethodType: "card",
      idempotencyKey: "payment-unsupported-currency",
      idempotencyRequestHash: "b".repeat(64),
    });
    await expect(unsupportedCurrency.validate()).rejects.toHaveProperty("errors.currency");
  });

  it("rejects browser amount, currency, provider, and user fields from the Payment command DTO", () => {
    const base = {
      orderId: new mongoose.Types.ObjectId().toString(),
      customerId: new mongoose.Types.ObjectId().toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0002",
    };
    expect(createPaymentCommandSchema.validate({ ...base, amount: 1.25 }).error).toBeDefined();
    expect(createPaymentCommandSchema.validate({ ...base, amountMinor: 125, currency: "EGP" }).error).toBeDefined();
    expect(createPaymentCommandSchema.validate({ ...base, customerId: undefined, userId: "507f1f77bcf86cd799439011" }).error).toBeDefined();
  });

  it("fails closed when an existing Order has no accepted server-side snapshot", async () => {
    const owner = await createUser("legacy");
    const orderId = await createPendingPaymentOrder(owner.user, { withSnapshot: false });

    await expect(paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0003",
    })).rejects.toMatchObject({ code: "INVALID_COMMERCIAL_SNAPSHOT", statusCode: 422 });

    expect(await Payment.countDocuments({ orderId })).toBe(0);
    expect(await PaymentLedgerEntry.countDocuments({ orderId })).toBe(0);
    expect(await PaymentIdempotency.countDocuments({ customerId: owner.user._id })).toBe(0);
  });

  it("deduplicates concurrent requests with the same idempotency key", async () => {
    const owner = await createUser("concurrent-idempotency");
    const orderId = await createPendingPaymentOrder(owner.user);
    const command = {
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-concurrent-01",
    };

    const results = await Promise.all([
      paymentService.createFromOrderSnapshot(command),
      paymentService.createFromOrderSnapshot(command),
    ]);
    expect(results[0].paymentId).toBe(results[1].paymentId);
    expect(await Payment.countDocuments({ orderId })).toBe(1);
    expect(await PaymentLedgerEntry.countDocuments({ orderId })).toBe(1);
    expect(await PaymentIdempotency.countDocuments({ customerId: owner.user._id, idempotencyKey: command.idempotencyKey })).toBe(1);
  });

  it("atomically reserves a legacy pending card order and permits only one active attempt", async () => {
    const owner = await createUser("legacy-pending-order");
    const orderId = await createPendingPaymentOrder(owner.user, { status: "pending" });
    const command = {
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "legacy-order-payment-01",
    };

    const first = await paymentService.createFromOrderSnapshot(command);
    await expect(paymentService.createFromOrderSnapshot({
      ...command,
      idempotencyKey: "legacy-order-payment-02",
    })).rejects.toMatchObject({ code: "ACTIVE_PAYMENT_EXISTS", statusCode: 409 });
    const order = await Order.findById(orderId).select("+activePaymentId").lean();

    expect(first.status).toBe("created");
    expect(order).toMatchObject({ status: "pending_payment", activePaymentId: first.paymentId });
    expect(await Payment.countDocuments({ orderId })).toBe(1);
  });

  it("blocks a new attempt when a legacy Payment exists without a reservation marker", async () => {
    const owner = await createUser("legacy-active-payment");
    const orderId = await createPendingPaymentOrder(owner.user);
    await Payment.create({
      orderId,
      customerId: owner.user._id,
      provider: "stripe",
      amountMinor: 12550,
      currency: "EGP",
      paymentMethodType: "card",
      status: "pending",
      idempotencyKey: "legacy-payment-key-01",
      idempotencyRequestHash: "a".repeat(64),
    });

    await expect(paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "new-payment-key-legacy-01",
    })).rejects.toMatchObject({ code: "ACTIVE_PAYMENT_EXISTS", statusCode: 409 });
    expect(await Payment.countDocuments({ orderId })).toBe(1);
  });

  it("serializes concurrent attempts made with different idempotency keys", async () => {
    const owner = await createUser("concurrent-attempts");
    const orderId = await createPendingPaymentOrder(owner.user);
    const command = {
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
    };
    const results = await Promise.allSettled([
      paymentService.createFromOrderSnapshot({ ...command, idempotencyKey: "parallel-payment-key-01" }),
      paymentService.createFromOrderSnapshot({ ...command, idempotencyKey: "parallel-payment-key-02" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toMatchObject({ code: "ACTIVE_PAYMENT_EXISTS", statusCode: 409 });
    expect(await Payment.countDocuments({ orderId })).toBe(1);
  });

  it("rolls back Payment, ledger, and idempotency writes when a later transaction write fails", async () => {
    const owner = await createUser("transaction-rollback");
    const orderId = await createPendingPaymentOrder(owner.user);
    const failingService = new PaymentService({
      ledgerRepository: {
        append: async () => { throw new Error("injected ledger failure"); },
      },
    });

    await expect(failingService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-rollback-0001",
    })).rejects.toThrow("injected ledger failure");

    expect(await Payment.countDocuments({ orderId })).toBe(0);
    expect(await PaymentLedgerEntry.countDocuments({ orderId })).toBe(0);
    expect(await PaymentIdempotency.countDocuments({ customerId: owner.user._id, idempotencyKey: "payment-rollback-0001" })).toBe(0);
  });

  it("scopes Payment creation to the owning customer and an eligible Order state", async () => {
    const owner = await createUser("owner-scope");
    const other = await createUser("other-scope");
    const orderId = await createPendingPaymentOrder(owner.user);

    await expect(paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: other.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0004",
    })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });

    const order = await Order.collection.findOne({ _id: orderId });
    await Order.collection.updateOne({ _id: orderId }, { $set: { status: "delivered" } });
    await expect(paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0005",
    })).rejects.toMatchObject({ code: "INVALID_ORDER_STATE", statusCode: 409 });
    expect(order.status).toBe("pending_payment");
  });

  it("returns the same Payment for an exact idempotent retry and conflicts on a different request", async () => {
    const owner = await createUser("idempotency");
    const orderId = await createPendingPaymentOrder(owner.user);
    const command = {
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0006",
    };

    const first = await paymentService.createFromOrderSnapshot(command);
    const replay = await paymentService.createFromOrderSnapshot(command);
    expect(replay.paymentId).toBe(first.paymentId);
    expect(await Payment.countDocuments({ orderId })).toBe(1);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: first.paymentId })).toBe(1);

    const idempotencyRecord = await PaymentIdempotency.findOne({ paymentId: first.paymentId });
    await expect(PaymentIdempotency.updateOne({ _id: idempotencyRecord._id }, { $set: { requestHash: "b".repeat(64) } }))
      .rejects.toThrow("immutable");

    await expect(paymentService.createFromOrderSnapshot({ ...command, provider: "other_provider" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", statusCode: 409 });
  });

  it("appends ledger entries atomically with valid state changes and rejects unverified transitions", async () => {
    const owner = await createUser("state");
    const orderId = await createPendingPaymentOrder(owner.user);
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0007",
    });

    await paymentService.transition({ paymentId: payment.paymentId, toStatus: "pending", source: "payment_service" });
    await expect(paymentService.transition({
      paymentId: payment.paymentId,
      toStatus: "authorized",
      source: "provider_api",
      verified: false,
    })).rejects.toMatchObject({ code: "PAYMENT_EVIDENCE_REQUIRED" });
    await paymentService.transition({ paymentId: payment.paymentId, toStatus: "authorized", source: "provider_api", verified: true });
    const entries = await PaymentLedgerEntry.find({ paymentId: payment.paymentId }).sort({ recordedAt: 1 }).lean();
    const storedPayment = await Payment.findOne({ paymentId: payment.paymentId });

    expect(storedPayment.status).toBe("authorized");
    expect(entries.map((entry) => entry.eventType)).toEqual(["payment_created", "payment_pending", "payment_authorized"]);
    expect(entries[2].fromStatus).toBe("pending");
    await expect(PaymentLedgerEntry.create({
      paymentId: payment.paymentId,
      orderId,
      eventType: "payment_authorized",
      fromStatus: "pending",
      toStatus: "authorized",
      amountMinor: 12550,
      currency: "EGP",
      provider: "stripe",
      idempotencyKey: payment.idempotencyKey,
      actorType: "provider_api",
    })).rejects.toMatchObject({ code: 11000 });
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(3);
    await expect(PaymentLedgerEntry.updateOne({ _id: entries[0]._id }, { $set: { toStatus: "failed" } }))
      .rejects.toThrow("append-only");
    await expect(PaymentLedgerEntry.deleteOne({ _id: entries[0]._id })).rejects.toThrow("append-only");
  });

  it.each(["failed", "cancelled"])("keeps Order state aligned with verified %s Payment outcomes", async (outcome) => {
    const owner = await createUser("terminal-order-state");
    const orderId = await createPendingPaymentOrder(owner.user);
    const command = {
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: `payment-terminal-${outcome}-01`,
    };
    const payment = await paymentService.createFromOrderSnapshot(command);

    await paymentService.transition({
      paymentId: payment.paymentId,
      toStatus: "pending",
      source: "payment_service",
    });
    await paymentService.transition({
      paymentId: payment.paymentId,
      toStatus: outcome,
      source: "provider_api",
      verified: true,
    });

    const order = await Order.findById(orderId).select("+activePaymentId").lean();
    expect(order).toMatchObject({ status: outcome, activePaymentId: null });
    const replay = await paymentService.createFromOrderSnapshot(command);
    expect(replay.paymentId).toBe(payment.paymentId);
    await expect(paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: `payment-terminal-${outcome}-02`,
    })).rejects.toMatchObject({ code: "INVALID_ORDER_STATE", statusCode: 409 });
  });

  it("rejects invalid state changes", async () => {
    const validTransitions = [
      ["created", "pending", "payment_service", false],
      ["created", "failed", "payment_service", true],
      ["pending", "requires_action", "provider_api", true],
      ["pending", "authorized", "provider_api", true],
      ["pending", "captured", "provider_api", true],
      ["pending", "failed", "provider_api", true],
      ["pending", "cancelled", "provider_api", true],
      ["requires_action", "pending", "provider_api", true],
      ["requires_action", "authorized", "provider_api", true],
      ["requires_action", "captured", "provider_api", true],
      ["requires_action", "failed", "provider_api", true],
      ["requires_action", "cancelled", "provider_api", true],
      ["authorized", "captured", "provider_api", true],
      ["authorized", "failed", "provider_api", true],
      ["authorized", "cancelled", "provider_api", true],
    ];
    for (const [from, to, source, verified] of validTransitions) {
      expect(assertPaymentTransition(from, to, { source, verified })).toBe(true);
    }

    const invalidTransitions = [
      ["created", "captured"], ["created", "refunded"], ["failed", "captured"],
      ["cancelled", "captured"], ["refunded", "captured"], ["refunded", "failed"],
      ["disputed", "captured"],
    ];
    for (const [from, to] of invalidTransitions) {
      expect(() => assertPaymentTransition(from, to, { source: "provider_api", verified: true }))
        .toThrow();
    }
  });

  it("rejects legacy client amounts and returns a safe, owner-scoped Payment DTO", async () => {
    const owner = await createUser("api-owner");
    const other = await createUser("api-other");
    const orderId = await createPendingPaymentOrder(owner.user);
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: orderId.toString(),
      customerId: owner.user._id.toString(),
      provider: "stripe",
      idempotencyKey: "payment-create-0008",
    });

    const oldIntent = await request(app)
      .post("/api/payments/intent")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ amount: 1, currency: "usd" });
    expect(oldIntent.status).toBe(400);

    const ownPayment = await request(app)
      .get(`/api/payments/${payment.paymentId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownPayment.status).toBe(200);
    expect(ownPayment.body.data).toMatchObject({
      paymentId: payment.paymentId,
      orderId: orderId.toString(),
      amountMinor: 12550,
      currency: "EGP",
      status: "created",
    });
    expect(ownPayment.body.data).not.toHaveProperty("providerPaymentId");
    expect(ownPayment.body.data).not.toHaveProperty("idempotencyKey");

    const foreignPayment = await request(app)
      .get(`/api/payments/${payment.paymentId}`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(foreignPayment.status).toBe(404);

    const malformedId = await request(app)
      .get("/api/payments/not-a-uuid")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(malformedId.status).toBe(400);

    const anonymous = await request(app).get(`/api/payments/${payment.paymentId}`);
    expect(anonymous.status).toBe(401);
  });
});
