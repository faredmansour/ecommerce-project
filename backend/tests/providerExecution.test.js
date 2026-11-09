const { ProviderExecutionService } = require("../services/providerExecutionService");
const { PaymentService } = require("../services/paymentService");
const { PaymentProviderError, PROVIDER_ERROR_CODES } = require("../providers/providerErrors");

const PAYMENT_ID = "e68f6f50-8f63-4f1c-90ca-eaa6a82f25f1";
const ORDER_ID = "507f1f77bcf86cd799439011";
const CUSTOMER_ID = "507f191e810c19729de860ea";

function fixture({ provider = "paymob", status = "created", amountMinor = 12550, currency = "EGP" } = {}) {
  const payment = {
    paymentId: PAYMENT_ID,
    orderId: { toString: () => ORDER_ID },
    customerId: { toString: () => CUSTOMER_ID },
    provider,
    amountMinor,
    currency,
    paymentMethodType: "card",
    status,
    idempotencyKey: "payment-execute-0001",
    metadata: { channel: "web" },
  };
  const order = {
    status: "pending_payment",
    commercialSnapshot: { grandTotalMinor: 12550, currency: "EGP" },
  };
  const paymentRepository = { findByPaymentId: jest.fn().mockResolvedValue(payment) };
  const orderSnapshotRepository = { findOwnedOrderSnapshot: jest.fn().mockResolvedValue(order) };
  const registry = { resolveProvider: jest.fn() };
  return { payment, order, paymentRepository, orderSnapshotRepository, registry };
}

describe("ProviderExecutionService", () => {
  it("uses only a persisted Payment ID and keeps the deferred provider offline", async () => {
    const setup = fixture({ provider: "deferred" });
    const service = new ProviderExecutionService(setup);

    await expect(service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.OPERATION_DEFERRED, outcome: "unknown" });
    expect(setup.paymentRepository.findByPaymentId).toHaveBeenCalledWith(PAYMENT_ID);
    expect(setup.orderSnapshotRepository.findOwnedOrderSnapshot).toHaveBeenCalledWith(setup.payment.orderId, setup.payment.customerId);
    expect(setup.registry.resolveProvider).not.toHaveBeenCalled();
  });

  it("delegates the PaymentService execution command to ProviderExecutionService", async () => {
    const providerExecutionService = { executePayment: jest.fn().mockResolvedValue({ status: "deferred" }) };
    const service = new PaymentService({ providerExecutionService });
    await expect(service.executePayment({ paymentId: PAYMENT_ID })).resolves.toEqual({ status: "deferred" });
    expect(providerExecutionService.executePayment).toHaveBeenCalledWith({ paymentId: PAYMENT_ID });
  });

  it("keeps concurrent current-marker executions deferred and mutation-free", async () => {
    const setup = fixture({ provider: "deferred" });
    const service = new ProviderExecutionService(setup);
    const results = await Promise.allSettled([
      service.executePayment({ paymentId: PAYMENT_ID }),
      service.executePayment({ paymentId: PAYMENT_ID }),
    ]);

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: PROVIDER_ERROR_CODES.OPERATION_DEFERRED }) }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: PROVIDER_ERROR_CODES.OPERATION_DEFERRED }) }),
    ]));
    expect(setup.registry.resolveProvider).not.toHaveBeenCalled();
    expect(setup.payment.status).toBe("created");
  });

  it("rejects caller-supplied amount, currency, provider, and operation data", async () => {
    const setup = fixture();
    const service = new ProviderExecutionService(setup);
    await expect(service.executePayment({ paymentId: PAYMENT_ID, amountMinor: 1, currency: "USD", provider: "fawry" }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.INVALID_COMMAND });
    expect(setup.paymentRepository.findByPaymentId).not.toHaveBeenCalled();
  });

  it("fails closed for missing Payment and non-created Payment states", async () => {
    const missing = fixture();
    missing.paymentRepository.findByPaymentId.mockResolvedValue(null);
    await expect(new ProviderExecutionService(missing).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PAYMENT_NOT_FOUND });

    const processed = fixture({ status: "pending" });
    await expect(new ProviderExecutionService(processed).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PAYMENT_ALREADY_PROCESSED });
    expect(processed.orderSnapshotRepository.findOwnedOrderSnapshot).not.toHaveBeenCalled();
  });

  it("revalidates the owned Order snapshot and rejects amount or currency drift", async () => {
    const foreignOrMissing = fixture();
    foreignOrMissing.orderSnapshotRepository.findOwnedOrderSnapshot.mockResolvedValue(null);
    await expect(new ProviderExecutionService(foreignOrMissing).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED });

    const amountMismatch = fixture({ amountMinor: 12551 });
    await expect(new ProviderExecutionService(amountMismatch).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH });

    const currencyMismatch = fixture({ currency: "USD" });
    await expect(new ProviderExecutionService(currencyMismatch).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PAYMENT_CURRENCY_MISMATCH });
    expect(amountMismatch.registry.resolveProvider).not.toHaveBeenCalled();
    expect(currencyMismatch.registry.resolveProvider).not.toHaveBeenCalled();

    const wrongOrderState = fixture();
    wrongOrderState.order.status = "confirmed";
    await expect(new ProviderExecutionService(wrongOrderState).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED });

    const missingSnapshot = fixture();
    missingSnapshot.order.commercialSnapshot = null;
    await expect(new ProviderExecutionService(missingSnapshot).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED });
  });

  it("resolves providers only through the disabled registry and normalizes its errors", async () => {
    const setup = fixture();
    const service = new ProviderExecutionService({
      ...setup,
      registry: require("../providers"),
    });
    await expect(service.executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.DISABLED, provider: "paymob" });
  });

  it("passes only persisted values to an injected adapter and normalizes its provider-neutral result", async () => {
    const setup = fixture();
    const adapter = {
      createPayment: jest.fn().mockResolvedValue({
        provider: "paymob",
        paymentId: PAYMENT_ID,
        orderId: ORDER_ID,
        amountMinor: 12550,
        currency: "EGP",
        paymentMethodType: "card",
        idempotencyKey: "payment-execute-0001",
        status: "pending",
        providerPaymentId: "provider-reference-from-adapter",
        environment: "TEST",
      }),
    };
    setup.registry.resolveProvider.mockReturnValue(adapter);
    const result = await new ProviderExecutionService(setup).executePayment({ paymentId: PAYMENT_ID });

    expect(setup.registry.resolveProvider).toHaveBeenCalledWith("paymob", expect.any(Object));
    expect(adapter.createPayment).toHaveBeenCalledWith({
      paymentId: PAYMENT_ID,
      orderId: ORDER_ID,
      amountMinor: 12550,
      currency: "EGP",
      paymentMethodType: "card",
      idempotencyKey: "payment-execute-0001",
      metadata: { channel: "web" },
    });
    expect(result).toMatchObject({ provider: "paymob", status: "pending", paymentId: PAYMENT_ID });
    expect(setup.payment.status).toBe("created");
  });

  it("normalizes unexpected adapter errors without exposing their messages", async () => {
    const setup = fixture();
    setup.registry.resolveProvider.mockReturnValue({
      createPayment: jest.fn().mockRejectedValue(new PaymentProviderError("SECRET_TOKEN", "secret response body")),
    });
    await expect(new ProviderExecutionService(setup).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", message: "Provider operation did not complete. Reconcile before retrying." });
  });

  it("rejects a normalized adapter result that changes the persisted amount", async () => {
    const setup = fixture();
    setup.registry.resolveProvider.mockReturnValue({
      createPayment: jest.fn().mockResolvedValue({
        provider: "paymob",
        paymentId: PAYMENT_ID,
        orderId: ORDER_ID,
        amountMinor: 1,
        currency: "EGP",
        paymentMethodType: "card",
        idempotencyKey: "payment-execute-0001",
        status: "pending",
      }),
    });
    await expect(new ProviderExecutionService(setup).executePayment({ paymentId: PAYMENT_ID }))
      .rejects.toMatchObject({ code: PROVIDER_ERROR_CODES.PROVIDER_VALIDATION_FAILED });
    expect(setup.payment.status).toBe("created");
  });
});
