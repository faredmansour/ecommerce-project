const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../app");
const Order = require("../models/orderModel");
const User = require("../models/usermodel");
const Payment = require("../models/paymentModel");
const PaymentLedgerEntry = require("../models/paymentLedgerEntryModel");
const PaymentWebhookEvent = require("../models/paymentWebhookEventModel");
const PaymentExecutionAttempt = require("../models/paymentExecutionAttemptModel");
const { PaymentService } = require("../services/paymentService");
const { ProviderWebhookService, WEBHOOK_VERIFICATION_STATUS } = require("../services/providerWebhookService");
const { PaymentWebhookWorker } = require("../services/paymentWebhookWorker");
const { PaymentWebhookWorkerRuntime } = require("../services/paymentWebhookWorkerRuntime");
const PaymentWebhookEventRepository = require("../repositories/paymentWebhookEventRepository");
const { webhookService: routeWebhookService } = require("../controllers/paymentWebhookController");

const PAYMENT_ID = "e68f6f50-8f63-4f1c-90ca-eaa6a82f25f1";

async function createWebhookOwner() {
  const user = await User.create({
    name: "Webhook Owner",
    email: `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password: "Passw0rd!",
    role: "user",
  });
  return { user, token: jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" }) };
}

async function createPendingOrder(user) {
  const orderId = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({
    _id: orderId,
    user: user._id,
    status: "pending_payment",
    paymentMethod: "card",
    commercialSnapshot: { grandTotalMinor: 12550, currency: "EGP" },
  });
  return orderId;
}

async function createPendingPayment() {
  const owner = await createWebhookOwner();
  const orderId = await createPendingOrder(owner.user);
  const payments = new PaymentService({
    providerExecutionService: {
      executePayment: jest.fn(async ({ paymentId }) => ({
        provider: "paymob",
        paymentId,
        orderId: orderId.toString(),
        amountMinor: 12550,
        currency: "EGP",
        paymentMethodType: "card",
        status: "pending",
        providerPaymentId: `provider-ref-${paymentId}`,
        checkoutUrl: "https://eg.checkout.paymob.com/?publicKey=test&clientSecret=test",
        environment: "TEST",
      })),
    },
  });
  let payment = await payments.createFromOrderSnapshot({
    orderId: orderId.toString(),
    customerId: owner.user._id.toString(),
    provider: "paymob",
    idempotencyKey: `webhook-create-${Math.random().toString(36).slice(2, 12)}`,
  });
  await payments.executePayment({ paymentId: payment.paymentId });
  payment = await Payment.findOne({ paymentId: payment.paymentId });
  return { owner, orderId, payment, payments };
}

function signedTestWebhook(options = {}) {
  const { eventId = "test-provider-event-001", paymentReference = PAYMENT_ID, amountMinor = 12550, currency = "EGP", status = "captured", occurredAt } = options;
  const providerTransactionReference = options.providerTransactionReference || eventId;
  const providerPaymentReference = options.providerPaymentReference || `provider-ref-${paymentReference}`;
  const payload = { eventId, providerTransactionReference, paymentReference, providerPaymentReference, amountMinor, currency, status };
  const canonicalEvent = {
    provider: "paymob",
    providerEventId: eventId,
    providerTransactionReference,
    paymentReference,
    providerPaymentReference,
    eventType: `payment_${status}`,
    status,
    amountMinor,
    currency,
    ...(occurredAt ? { occurredAt } : {}),
  };
  const adapter = {
    verifyWebhook: jest.fn().mockResolvedValue({ status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, payload }),
    normalizeWebhookEvent: jest.fn().mockResolvedValue(canonicalEvent),
  };
  const registry = { resolveProvider: jest.fn().mockReturnValue(adapter) };
  const paymentService = new PaymentService();
  const service = new ProviderWebhookService({ registry, paymentService });
  return { payload, canonicalEvent, adapter, registry, paymentService, service };
}

beforeAll(async () => {
  await Promise.all([Payment.init(), PaymentLedgerEntry.init(), PaymentWebhookEvent.init(), PaymentExecutionAttempt.init()]);
});

describe("Payment provider webhook boundary", () => {
  it("rejects Paymob events without an independent transaction reference", async () => {
    await expect(new PaymentService().receiveVerifiedWebhook({
      provider: "paymob",
      providerEventId: "missing-transaction-reference",
      paymentReference: PAYMENT_ID,
      providerPaymentReference: "provider-ref-1",
      eventType: "payment_pending",
      status: "pending",
      amountMinor: 12550,
      currency: "EGP",
      payloadHash: "a".repeat(64),
    })).rejects.toMatchObject({ code: "WEBHOOK_MALFORMED_REQUEST" });
  });
  it("preserves raw JSON bytes only on the webhook path and does not require customer JWT", async () => {
    const raw = '{ "event": "test", "success": true }';
    const spy = jest.spyOn(routeWebhookService, "ingest").mockImplementation(async ({ rawBody, provider }) => {
      expect(provider).toBe("paymob");
      expect(Buffer.isBuffer(rawBody)).toBe(true);
      expect(rawBody.toString()).toBe(raw);
      return { duplicate: false };
    });
    try {
      const response = await request(app).post("/api/payments/webhooks/paymob")
        .set("Content-Type", "application/json")
        .send(raw);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ accepted: true, duplicate: false });
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects unknown providers and keeps recognized providers disabled without authentication", async () => {
    const unknown = await request(app).post("/api/payments/webhooks/stripe")
      .set("Content-Type", "application/json").send({ event: "test" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("WEBHOOK_UNSUPPORTED_PROVIDER");

    for (const provider of ["paymob", "kashier", "fawry"]) {
      const response = await request(app).post(`/api/payments/webhooks/${provider}`)
        .set("Content-Type", "application/json").send({ event: "test" });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("WEBHOOK_DISABLED_PROVIDER");
    }
  });

  it("returns a sanitized parser error for malformed webhook JSON without exposing payload excerpts", async () => {
    const response = await request(app).post("/api/payments/webhooks/paymob")
      .set("Content-Type", "application/json")
      .send('{"pan":"4111111111111111",');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "WEBHOOK_MALFORMED_REQUEST" });
    expect(response.body).not.toHaveProperty("stack");
    expect(JSON.stringify(response.body)).not.toContain("4111111111111111");
  });

  it("does not normalize or mutate Payment on invalid or missing signature", async () => {
    const { payment, payments } = await createPendingPayment();
    for (const status of [WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE, WEBHOOK_VERIFICATION_STATUS.MISSING_SIGNATURE]) {
      const { service, adapter } = signedTestWebhook({ paymentReference: payment.paymentId });
      adapter.verifyWebhook.mockResolvedValue({ status });
      await expect(service.ingest({ provider: "paymob", rawBody: Buffer.from('{"event":"signed"}'), headers: {} }))
        .rejects.toMatchObject({ code: status === "INVALID_SIGNATURE" ? "WEBHOOK_INVALID_SIGNATURE" : "WEBHOOK_MISSING_SIGNATURE" });
      expect(adapter.normalizeWebhookEvent).not.toHaveBeenCalled();
    }
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("pending");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(2);
    expect(await PaymentWebhookEvent.countDocuments({ paymentId: payment.paymentId })).toBe(0);
    expect(payments).toBeDefined();
  });

  it("normalizes only verified events and durably ingests without processing in the HTTP path", async () => {
    const { payment } = await createPendingPayment();
    const { service, adapter } = signedTestWebhook({ paymentReference: payment.paymentId });
    const rawBody = Buffer.from('{"eventId":"test-provider-event-001","verified":true}');
    const result = await service.ingest({ provider: "paymob", rawBody, headers: { "x-test-signature": "injected-test-only" } });

    expect(result).toMatchObject({ accepted: true, duplicate: false });
    expect(adapter.normalizeWebhookEvent).toHaveBeenCalledTimes(1);
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("pending");
    const receipt = await PaymentWebhookEvent.findOne({ provider: "paymob", providerEventId: "test-provider-event-001" });
    expect(receipt).toMatchObject({ processingStatus: "RECEIVED", verificationStatus: "VERIFIED", canonicalStatus: "captured" });
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(2);

    const processed = await new PaymentWebhookWorker({ paymentService: payment ? new PaymentService() : null }).process(receipt.eventId);
    expect(processed).toMatchObject({ claimed: true, duplicate: false, status: "PROCESSED" });
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("captured");
    expect((await PaymentWebhookEvent.findOne({ eventId: receipt.eventId })).processingStatus).toBe("PROCESSED");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(3);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_captured" })).toBe(1);
    expect(await Order.findById(payment.orderId).lean()).toMatchObject({ status: "paid" });

    const duplicateProcess = await new PaymentWebhookWorker().process(receipt.eventId);
    expect(duplicateProcess).toMatchObject({ claimed: false, duplicate: true, status: "PROCESSED" });
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(3);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_captured" })).toBe(1);
  });

  it("deduplicates identical and concurrent verified event deliveries durably", async () => {
    const { payment } = await createPendingPayment();
    const { service } = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-002" });
    const input = { provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-002"}'), headers: {} };
    const first = await service.ingest(input);
    const duplicate = await service.ingest(input);
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(2);
    expect(await PaymentWebhookEvent.countDocuments({ providerEventId: "test-provider-event-002" })).toBe(1);
    const firstReceipt = await PaymentWebhookEvent.findOne({ providerEventId: "test-provider-event-002" });
    await new PaymentWebhookWorker().process(firstReceipt.eventId);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_captured" })).toBe(1);

    const concurrentPayment = await createPendingPayment();
    const concurrent = signedTestWebhook({ paymentReference: concurrentPayment.payment.paymentId, eventId: "test-provider-event-003" });
    const concurrentInput = { provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-003"}'), headers: {} };
    const results = await Promise.all([
      concurrent.service.ingest(concurrentInput),
      concurrent.service.ingest(concurrentInput),
    ]);
    expect(results.filter((result) => result.duplicate === false)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate === true)).toHaveLength(1);
    const concurrentReceipt = await PaymentWebhookEvent.findOne({ providerEventId: "test-provider-event-003" });
    const workerResults = await Promise.all([
      new PaymentWebhookWorker().process(concurrentReceipt.eventId),
      new PaymentWebhookWorker().process(concurrentReceipt.eventId),
    ]);
    expect(workerResults.filter((result) => result.status === "PROCESSED")).toHaveLength(1);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: concurrentPayment.payment.paymentId, eventType: "payment_captured" })).toBe(1);
    expect(await PaymentWebhookEvent.countDocuments({ providerEventId: "test-provider-event-003" })).toBe(1);
  });

  it("rejects a conflicting terminal callback without changing the prior outcome", async () => {
    const { payment } = await createPendingPayment();
    const failed = signedTestWebhook({
      paymentReference: payment.paymentId,
      eventId: "test-provider-event-failed",
      status: "failed",
    });
    const failureReceipt = await failed.service.ingest({
      provider: "paymob",
      rawBody: Buffer.from('{"eventId":"test-provider-event-failed"}'),
      headers: {},
    });
    expect((await new PaymentWebhookWorker().process(failureReceipt.eventId)).status).toBe("PROCESSED");
    expect((await Order.findById(payment.orderId).lean()).status).toBe("failed");

    const captured = signedTestWebhook({
      paymentReference: payment.paymentId,
      eventId: "test-provider-event-captured-after-failure",
      status: "captured",
    });
    const captureReceipt = await captured.service.ingest({
      provider: "paymob",
      rawBody: Buffer.from('{"eventId":"test-provider-event-captured-after-failure"}'),
      headers: {},
    });
    expect((await new PaymentWebhookWorker().process(captureReceipt.eventId)).status).toBe("DEAD_LETTER");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("failed");
    expect(await Order.findById(payment.orderId).lean()).toMatchObject({ status: "failed" });
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_captured" })).toBe(0);
  });

  it("rejects replay identity reuse with different bytes and rejects unsupported lifecycle events", async () => {
    const { payment } = await createPendingPayment();
    const first = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-004" });
    const initialBytes = Buffer.from('{"eventId":"test-provider-event-004"}');
    await first.service.ingest({ provider: "paymob", rawBody: initialBytes, headers: {} });

    const replay = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-004" });
    await expect(replay.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-004","changed":true}'), headers: {} }))
      .rejects.toMatchObject({ code: "WEBHOOK_EVENT_CONFLICT" });

    const unsupported = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-005", status: "refunded" });
    await expect(unsupported.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-005"}'), headers: {} }))
      .rejects.toMatchObject({ code: "WEBHOOK_UNSUPPORTED_EVENT" });
  });

  it("rejects mismatched amount/currency, unknown references, and invalid state transitions without ledger writes", async () => {
    const { payment } = await createPendingPayment();
    const amountMismatch = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-006", amountMinor: 12551 });
    const amountResult = await amountMismatch.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"amountMinor":12551}'), headers: {} });
    const amountReceipt = await PaymentWebhookEvent.findOne({ eventId: amountResult.eventId });
    expect((await new PaymentWebhookWorker().process(amountReceipt.eventId)).status).toBe("DEAD_LETTER");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(2);
    expect((await PaymentWebhookEvent.findOne({ eventId: amountReceipt.eventId })).processingStatus).toBe("DEAD_LETTER");

    const currencyMismatch = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-007", currency: "USD" });
    const currencyResult = await currencyMismatch.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"currency":"USD"}'), headers: {} });
    expect((await new PaymentWebhookWorker().process(currencyResult.eventId)).status).toBe("DEAD_LETTER");

    const unknownReference = signedTestWebhook({ paymentReference: "77ad58b1-ff48-4eed-865f-3e5f16b89a65", eventId: "test-provider-event-008" });
    const unknownResult = await unknownReference.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-008"}'), headers: {} });
    expect((await new PaymentWebhookWorker().process(unknownResult.eventId)).status).toBe("DEAD_LETTER");

    const invalidTransition = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-009", status: "pending" });
    const invalidResult = await invalidTransition.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-009"}'), headers: {} });
    expect((await new PaymentWebhookWorker().process(invalidResult.eventId)).status).toBe("PROCESSED");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(3);

    await Order.collection.updateOne({ _id: payment.orderId }, { $set: { "commercialSnapshot.grandTotalMinor": 12600 } });
    const orderMismatch = signedTestWebhook({
      paymentReference: payment.paymentId,
      providerTransactionReference: "test-provider-event-009",
      eventId: "test-provider-event-012",
    });
    const orderResult = await orderMismatch.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"eventId":"test-provider-event-012"}'), headers: {} });
    expect((await new PaymentWebhookWorker().process(orderResult.eventId)).status).toBe("DEAD_LETTER");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("pending");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(3);
  });

  it("rejects sensitive or unrecognized normalized payload fields and never persists raw payload", async () => {
    const { payment } = await createPendingPayment();
    for (const [index, key] of ["pan", "cardNumber", "cvv", "otp", "walletPin"].entries()) {
      const sensitive = signedTestWebhook({ paymentReference: payment.paymentId, eventId: `test-sensitive-event-${index}` });
      sensitive.adapter.verifyWebhook.mockResolvedValue({
        status: WEBHOOK_VERIFICATION_STATUS.VERIFIED,
        payload: { ...sensitive.payload, [key]: "sensitive-test-value" },
      });
      await expect(sensitive.service.ingest({ provider: "paymob", rawBody: Buffer.from(`{"${key}":"sensitive-test-value"}`), headers: {} }))
        .rejects.toMatchObject({ code: "WEBHOOK_MALFORMED_REQUEST" });
    }
    expect(await PaymentWebhookEvent.countDocuments({ paymentId: payment.paymentId })).toBe(0);

    const good = signedTestWebhook({ paymentReference: payment.paymentId, eventId: "test-provider-event-011" });
    await good.service.ingest({ provider: "paymob", rawBody: Buffer.from('{"private":"do-not-store"}'), headers: {} });
    const receiptDocument = await PaymentWebhookEvent.findOne({ providerEventId: "test-provider-event-011" });
    const receipt = receiptDocument.toObject();
    expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt).not.toHaveProperty("rawPayload");
    expect(JSON.stringify(receipt)).not.toContain("do-not-store");
    await receiptDocument.updateOne({ $set: { providerEventId: "cannot-change" } });
    expect((await PaymentWebhookEvent.findById(receiptDocument._id)).providerEventId).toBe("test-provider-event-011");
  });
});

describe("Payment webhook processing reliability", () => {
  async function receiveEvent(paymentReference, eventId, options = {}) {
    const fixture = signedTestWebhook({ paymentReference, eventId, ...options });
    const result = await fixture.service.ingest({
      provider: "paymob",
      rawBody: Buffer.from(JSON.stringify({ eventId })),
      headers: {},
    });
    return { ...result, fixture };
  }

  it("does not apply an older webhook that would regress requires_action to pending", async () => {
    const { payment } = await createPendingPayment();
    const oldOccurredAt = new Date(Date.now() + 1000);
    const newOccurredAt = new Date(Date.now() + 2000);
    const newer = await receiveEvent(payment.paymentId, "ordered-action-002", {
      status: "requires_action",
      providerTransactionReference: "ordered-payment-transaction",
      occurredAt: newOccurredAt,
    });
    expect((await new PaymentWebhookWorker().process(newer.eventId)).status).toBe("PROCESSED");

    const older = await receiveEvent(payment.paymentId, "ordered-pending-001", {
      status: "pending",
      providerTransactionReference: "ordered-payment-transaction",
      occurredAt: oldOccurredAt,
    });
    expect((await new PaymentWebhookWorker().process(older.eventId)).status).toBe("DEAD_LETTER");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("requires_action");
  });

  it("binds a verified transaction reference once, deduplicates its callback, and rejects conflicting references", async () => {
    const { payment } = await createPendingPayment();
    const first = signedTestWebhook({
      paymentReference: payment.paymentId,
      providerTransactionReference: "paymob-tx-auth-001",
      eventId: "paymob-event-auth-001",
      status: "authorized",
    });
    const request = { provider: "paymob", rawBody: Buffer.from('{"eventId":"paymob-event-auth-001"}'), headers: {} };
    const received = await first.service.ingest(request);
    expect((await first.service.ingest(request)).duplicate).toBe(true);
    expect((await new PaymentWebhookWorker().process(received.eventId)).status).toBe("PROCESSED");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).providerTransactionId).toBe("paymob-tx-auth-001");

    const conflict = signedTestWebhook({
      paymentReference: payment.paymentId,
      providerTransactionReference: "paymob-tx-different-002",
      eventId: "paymob-event-different-002",
      status: "authorized",
    });
    const conflictResult = await conflict.service.ingest({
      provider: "paymob",
      rawBody: Buffer.from('{"eventId":"paymob-event-different-002"}'),
      headers: {},
    });
    expect((await new PaymentWebhookWorker().process(conflictResult.eventId)).status).toBe("DEAD_LETTER");
    expect((await PaymentWebhookEvent.findOne({ eventId: conflictResult.eventId })).lastErrorCode)
      .toBe("WEBHOOK_TRANSACTION_REFERENCE_CONFLICT");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).providerTransactionId).toBe("paymob-tx-auth-001");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(3);
  });

  it("retains an early verified webhook for retry after provider reference binding and deduplicates delivery", async () => {
    const { payment } = await createPendingPayment();
    const providerPaymentId = payment.providerPaymentId;
    await Payment.updateOne({ paymentId: payment.paymentId }, { $set: { providerPaymentId: null } });
    const received = await receiveEvent(payment.paymentId, "early-provider-binding-001", {
      status: "authorized",
      providerTransactionReference: "early-provider-tx-001",
    });

    expect((await new PaymentWebhookWorker().process(received.eventId)).status).toBe("RETRYABLE_FAILURE");
    expect(await PaymentWebhookEvent.countDocuments({ paymentId: payment.paymentId })).toBe(1);
    await Payment.updateOne({ paymentId: payment.paymentId }, { $set: { providerPaymentId, status: "pending" } });
    await PaymentWebhookEvent.updateOne({ eventId: received.eventId }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });

    expect((await new PaymentWebhookWorker().recover()).map(({ status }) => status)).toContain("PROCESSED");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("authorized");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_authorized" })).toBe(1);
    expect((await receiveEvent(payment.paymentId, "early-provider-binding-001", {
      status: "authorized", providerTransactionReference: "early-provider-tx-001",
    })).duplicate).toBe(true);
  });

  it("durably retains a verified callback received before the Paymob attempt reference exists", async () => {
    const { payment } = await createPendingPayment();
    const providerPaymentReference = payment.providerPaymentId;
    const providerOrderReference = "99887766";
    await PaymentExecutionAttempt.create({
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      provider: "paymob",
      status: "REQUESTING",
    });
    await Payment.updateOne({ paymentId: payment.paymentId }, { $set: { providerPaymentId: null } });

    const canonicalEvent = {
      provider: "paymob",
      providerEventId: "before-attempt-reference-001",
      providerTransactionReference: "before-attempt-transaction-001",
      providerOrderReference,
      eventType: "payment_authorized",
      status: "authorized",
      amountMinor: 12550,
      currency: "EGP",
    };
    const adapter = {
      verifyWebhook: jest.fn().mockResolvedValue({ status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, payload: { type: "TRANSACTION", obj: {} } }),
      normalizeWebhookEvent: jest.fn().mockResolvedValue(canonicalEvent),
    };
    const service = new ProviderWebhookService({
      registry: { resolveProvider: jest.fn().mockReturnValue(adapter) },
      paymentService: new PaymentService(),
      queue: { enqueue: jest.fn().mockResolvedValue({ durable: true }) },
    });
    const rawBody = Buffer.from('{"eventId":"before-attempt-reference-001"}');
    const received = await service.ingest({ provider: "paymob", rawBody, headers: {} });
    const firstReceipt = await PaymentWebhookEvent.findOne({ eventId: received.eventId });
    expect(firstReceipt).toMatchObject({ verificationStatus: "VERIFIED", processingStatus: "RECEIVED", bindingPending: true });
    expect(firstReceipt.paymentReference).toBeNull();

    expect((await new PaymentWebhookWorker().process(received.eventId)).status).toBe("RETRYABLE_FAILURE");
    await PaymentExecutionAttempt.updateOne({ paymentId: payment.paymentId }, {
      $set: { status: "SESSION_CREATED", providerPaymentId: providerPaymentReference, providerReference: providerOrderReference },
    });
    await Payment.updateOne({ paymentId: payment.paymentId }, { $set: { providerPaymentId: providerPaymentReference } });
    await PaymentWebhookEvent.updateOne({ eventId: received.eventId }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });

    const recovered = await new PaymentWebhookWorker().recover();
    expect(recovered).toEqual([expect.objectContaining({ status: "PROCESSED" })]);
    const stored = await PaymentWebhookEvent.findOne({ eventId: received.eventId }).lean();
    expect(stored).toMatchObject({ bindingPending: false, paymentReference: payment.paymentId, providerPaymentReference });
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("authorized");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_authorized" })).toBe(1);

    const duplicate = await service.ingest({ provider: "paymob", rawBody, headers: {} });
    expect(duplicate.duplicate).toBe(true);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_authorized" })).toBe(1);
  });

  it("processes the first pending callback after provider execution without treating it as capture", async () => {
    const { payment } = await createPendingPayment();
    const pending = signedTestWebhook({
      paymentReference: payment.paymentId,
      providerTransactionReference: "paymob-tx-pending-001",
      eventId: "paymob-event-pending-001",
      status: "pending",
    });
    const request = {
      provider: "paymob",
      rawBody: Buffer.from('{"eventId":"paymob-event-pending-001"}'),
      headers: {},
    };
    const received = await pending.service.ingest(request);

    expect((await new PaymentWebhookWorker().process(received.eventId)).status).toBe("PROCESSED");
    const storedPayment = await Payment.findOne({ paymentId: payment.paymentId });
    expect(storedPayment).toMatchObject({
      status: "pending",
      providerTransactionId: "paymob-tx-pending-001",
    });
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_captured" })).toBe(0);
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_pending" })).toBe(2);
  });

  it("recovers durable RECEIVED events independently of the original request", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "recover-received-001");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("pending");

    const recovered = await new PaymentWebhookWorker().recover();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ status: "PROCESSED" });
    expect((await PaymentWebhookEvent.findOne({ eventId: received.eventId })).processingStatus).toBe("PROCESSED");
  });

  it("atomically claims an event once and allows reclaim only after the lease expires", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "claim-event-001");
    const repository = new PaymentWebhookEventRepository();
    const pendingReceipt = await PaymentWebhookEvent.findOne({ eventId: received.eventId });
    const now = pendingReceipt.nextAttemptAt;
    const claimArgs = (claimToken) => ({ now, leaseUntil: new Date(now.getTime() + 1000), claimToken, maxAttempts: 5 });
    const claims = await Promise.all([
      repository.claim(received.eventId, claimArgs("claim-worker-one")),
      repository.claim(received.eventId, claimArgs("claim-worker-two")),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const staleClaim = claims.find(Boolean);
    const later = new Date(now.getTime() + 1001);
    const reclaimed = await repository.claim(received.eventId, {
      now: later,
      leaseUntil: new Date(later.getTime() + 1000),
      claimToken: "claim-worker-recovery",
      maxAttempts: 5,
    });
    expect(reclaimed).toMatchObject({ processingStatus: "PROCESSING", attemptCount: 2 });
    await expect(new PaymentService().processClaimedWebhook(received.eventId, staleClaim.claimToken))
      .rejects.toMatchObject({ code: "WEBHOOK_CLAIM_LOST" });
  });

  it("recovers an unfinished event after its processing lease expires", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "expired-lease-recovery-001");
    const expiredLease = new Date(Date.now() - 1000);
    await PaymentWebhookEvent.updateOne({ eventId: received.eventId }, {
      $set: {
        processingStatus: "PROCESSING",
        processingLeaseUntil: expiredLease,
        claimToken: "expired-claim-token",
      },
      $inc: { attemptCount: 1, totalAttemptCount: 1 },
    });

    const recovered = await new PaymentWebhookWorker().recover();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ status: "PROCESSED" });
    expect((await PaymentWebhookEvent.findOne({ eventId: received.eventId })).processingStatus).toBe("PROCESSED");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("captured");
  });

  it("recovers a timed-out worker claim after its lease expires", async () => {
    const { payment } = await createPendingPayment();
    let releaseClaimedProcessing;
    let markClaimedProcessing;
    const claimedProcessing = new Promise((resolve) => { markClaimedProcessing = resolve; });
    const processingGate = new Promise((resolve) => { releaseClaimedProcessing = resolve; });
    const paymentService = new PaymentService();
    jest.spyOn(paymentService, "processClaimedWebhook").mockImplementation(async () => {
      markClaimedProcessing();
      await processingGate;
      throw Object.assign(new Error("claim expired"), { code: "WEBHOOK_CLAIM_LOST" });
    });
    let fireShutdownTimeout;
    const worker = new PaymentWebhookWorker({
      paymentService,
      config: { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 900000, leaseMs: 50, recoveryBatchSize: 10 },
    });
    const runtime = new PaymentWebhookWorkerRuntime({
      worker,
      recoveryIntervalMs: 60000,
      shutdownTimeoutMs: 100,
      setTimeoutImpl: (callback) => {
        fireShutdownTimeout = callback;
        return "worker-shutdown-deadline";
      },
      clearTimeoutImpl: jest.fn(),
    });

    await runtime.start();
    const received = await receiveEvent(payment.paymentId, "timed-out-lease-recovery-001");
    runtime.notify(received.eventId);
    await claimedProcessing;
    const stop = runtime.stop();
    fireShutdownTimeout();
    await expect(stop).resolves.toMatchObject({ timedOut: true, unfinishedCount: 1 });

    const claimed = await PaymentWebhookEvent.findOne({ eventId: received.eventId }).select("+claimToken");
    expect(claimed.processingStatus).toBe("PROCESSING");
    expect(claimed.claimToken).toBeTruthy();

    releaseClaimedProcessing();
    await runtime.waitForIdle();
    await PaymentWebhookEvent.updateOne({ eventId: received.eventId }, {
      $set: { processingLeaseUntil: new Date(Date.now() - 1) },
    });

    const recovered = await new PaymentWebhookWorker().recover();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ status: "PROCESSED" });
    expect((await PaymentWebhookEvent.findOne({ eventId: received.eventId })).processingStatus).toBe("PROCESSED");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("captured");
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId, eventType: "payment_captured" })).toBe(1);
  });

  it("allows multiple worker runtimes to race while MongoDB claims the event once", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "multi-runtime-claim-001");
    const paymentService = new PaymentService();
    const processClaimedWebhook = paymentService.processClaimedWebhook.bind(paymentService);
    let releaseProcessing;
    let markProcessingStarted;
    const processingStarted = new Promise((resolve) => { markProcessingStarted = resolve; });
    const processingGate = new Promise((resolve) => { releaseProcessing = resolve; });
    const processing = jest.spyOn(paymentService, "processClaimedWebhook").mockImplementation(async (...args) => {
      markProcessingStarted();
      await processingGate;
      return processClaimedWebhook(...args);
    });
    const runtimeOne = new PaymentWebhookWorkerRuntime({
      worker: new PaymentWebhookWorker({ paymentService }),
      recoveryIntervalMs: 60_000,
    });
    const runtimeTwo = new PaymentWebhookWorkerRuntime({
      worker: new PaymentWebhookWorker({ paymentService }),
      recoveryIntervalMs: 60_000,
    });

    try {
      const starting = Promise.all([runtimeOne.start(), runtimeTwo.start()]);
      await processingStarted;
      releaseProcessing();
      await starting;
      expect(processing).toHaveBeenCalledTimes(1);
      expect((await PaymentWebhookEvent.findOne({ eventId: received.eventId })).processingStatus).toBe("PROCESSED");
    } finally {
      releaseProcessing();
      await Promise.all([runtimeOne.stop(), runtimeTwo.stop()]);
      processing.mockRestore();
    }
  });

  it("schedules bounded exponential retries and dead-letters after the configured maximum", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "retry-event-001");
    let now = (await PaymentWebhookEvent.findOne({ eventId: received.eventId })).nextAttemptAt;
    const retryConfig = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 250, leaseMs: 1000, recoveryBatchSize: 10 };
    const transientService = {
      processClaimedWebhook: jest.fn(async () => { throw Object.assign(new Error("temporary"), { code: "DB_TEMPORARY" }); }),
    };
    const worker = new PaymentWebhookWorker({
      paymentService: transientService,
      clock: () => now,
      config: retryConfig,
    });

    const first = await worker.process(received.eventId);
    expect(first.status).toBe("RETRYABLE_FAILURE");
    let receipt = await PaymentWebhookEvent.findOne({ eventId: received.eventId });
    expect(receipt).toMatchObject({ attemptCount: 1, lastErrorCode: "DB_TEMPORARY", processingStatus: "RETRYABLE_FAILURE" });
    expect(receipt.nextAttemptAt.getTime() - now.getTime()).toBe(100);
    expect((await worker.process(received.eventId)).claimed).toBe(false);

    now = receipt.nextAttemptAt;
    await worker.recover();
    receipt = await PaymentWebhookEvent.findOne({ eventId: received.eventId });
    expect(receipt.nextAttemptAt.getTime() - now.getTime()).toBe(200);
    now = receipt.nextAttemptAt;
    const finalAttempt = (await worker.recover())[0];
    receipt = await PaymentWebhookEvent.findOne({ eventId: received.eventId });
    expect(finalAttempt.status).toBe("DEAD_LETTER");
    expect(receipt).toMatchObject({ attemptCount: 3, totalAttemptCount: 3, processingStatus: "DEAD_LETTER" });
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("pending");
  });

  it("reprocesses a dead-letter internally without changing its provider event identity", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "reprocess-event-001");
    await PaymentWebhookEvent.updateOne({ eventId: received.eventId }, {
      $set: { processingStatus: "DEAD_LETTER", deadLetteredAt: new Date(), lastErrorCode: "WEBHOOK_STATE_CONFLICT" },
    });
    const before = await PaymentWebhookEvent.findOne({ eventId: received.eventId }).lean();
    const result = await new PaymentWebhookWorker().reprocessWebhookEvent(received.eventId);
    const after = await PaymentWebhookEvent.findOne({ eventId: received.eventId }).lean();
    expect(result).toMatchObject({ requeued: true, eventId: received.eventId, status: "RECEIVED" });
    expect(after).toMatchObject({ provider: before.provider, providerEventId: before.providerEventId, payloadHash: before.payloadHash, reprocessCount: 1, attemptCount: 0 });
    expect(after.lastReprocessedAt).toBeInstanceOf(Date);
    expect(await PaymentWebhookEvent.countDocuments({ providerEventId: before.providerEventId })).toBe(1);
    expect(await Payment.countDocuments({ paymentId: payment.paymentId })).toBe(1);
  });

  it("rolls back Payment and ledger when ledger persistence fails, leaving the event recoverable", async () => {
    const { payment } = await createPendingPayment();
    const received = await receiveEvent(payment.paymentId, "atomic-rollback-001");
    const failingPaymentService = new PaymentService({
      ledgerRepository: { append: async () => { throw Object.assign(new Error("transient ledger outage"), { code: "LEDGER_UNAVAILABLE" }); } },
    });
    const worker = new PaymentWebhookWorker({ paymentService: failingPaymentService });
    const result = await worker.process(received.eventId);
    expect(result.status).toBe("RETRYABLE_FAILURE");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).status).toBe("pending");
    expect((await Payment.findOne({ paymentId: payment.paymentId })).providerTransactionId).toBeNull();
    expect(await PaymentLedgerEntry.countDocuments({ paymentId: payment.paymentId })).toBe(2);
    expect((await PaymentWebhookEvent.findOne({ eventId: received.eventId })).processingStatus).toBe("RETRYABLE_FAILURE");
  });
});
