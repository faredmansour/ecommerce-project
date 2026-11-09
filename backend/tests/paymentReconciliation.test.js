const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/usermodel");
const Order = require("../models/orderModel");
const Payment = require("../models/paymentModel");
const PaymentLedgerEntry = require("../models/paymentLedgerEntryModel");
const PaymentWebhookEvent = require("../models/paymentWebhookEventModel");
const PaymentReconciliationRecord = require("../models/paymentReconciliationRecordModel");
const { PaymentService } = require("../services/paymentService");
const { PaymentWebhookWorker } = require("../services/paymentWebhookWorker");
const { PaymentReconciliationService, validateLedger } = require("../services/paymentReconciliationService");
const { fromVerifiedWebhookReceipt } = require("../services/providerStatusEvidence");

async function createPayment({ provider = "paymob", startStatus = "pending" } = {}) {
  const user = await User.create({
    name: "Recon Owner",
    email: `recon-${crypto.randomUUID()}@example.com`,
    password: "Passw0rd!",
    role: "user",
  });
  const orderId = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({
    _id: orderId,
    user: user._id,
    status: "pending_payment",
    paymentMethod: "card",
    commercialSnapshot: { grandTotalMinor: 12550, currency: "EGP" },
  });
  const service = new PaymentService();
  const payment = await service.createFromOrderSnapshot({
    orderId: orderId.toString(),
    customerId: user._id.toString(),
    provider,
    idempotencyKey: `recon-${crypto.randomUUID()}`,
  });
  if (provider !== "deferred") {
    payment.providerPaymentId = `provider-ref-${payment.paymentId}`;
    await payment.save();
  }
  if (startStatus === "pending" || startStatus === "captured" || startStatus === "failed") {
    await service.transition({ paymentId: payment.paymentId, toStatus: "pending", source: "payment_service" });
  }
  if (startStatus === "captured" || startStatus === "failed") {
    await service.transition({ paymentId: payment.paymentId, toStatus: startStatus, source: "provider_webhook", verified: true });
  }
  return { user, orderId, payment: await Payment.findOne({ paymentId: payment.paymentId }), service };
}

async function addProcessedReceipt(payment, { eventId = `event-${crypto.randomUUID()}`, status = "captured", amountMinor = 12550, currency = "EGP", provider = payment.provider, providerPaymentReference = payment.providerPaymentId } = {}) {
  const now = new Date();
  await PaymentWebhookEvent.collection.insertOne({
    eventId: crypto.randomUUID(),
    provider,
    providerEventId: eventId,
    paymentId: payment.paymentId,
    paymentReference: payment.paymentId,
    providerPaymentReference,
    eventType: `payment_${status}`,
    canonicalStatus: status,
    amountMinor,
    currency,
    occurredAt: now,
    payloadHash: crypto.createHash("sha256").update(eventId).digest("hex"),
    verificationStatus: "VERIFIED",
    processingStatus: "PROCESSED",
    attemptCount: 1,
    totalAttemptCount: 1,
    reprocessCount: 0,
    nextAttemptAt: now,
    receivedAt: now,
    processedAt: now,
  });
}

async function addThroughWebhookWorker(payment, { eventId = `processed-${crypto.randomUUID()}`, status = "captured", amountMinor = 12550, currency = "EGP" } = {}) {
  const receipt = await payment.service.receiveVerifiedWebhook({
    provider: payment.payment.provider,
    providerEventId: eventId,
    providerTransactionReference: eventId,
    paymentReference: payment.payment.paymentId,
    providerPaymentReference: payment.payment.providerPaymentId,
    eventType: `payment_${status}`,
    status,
    amountMinor,
    currency,
    payloadHash: crypto.createHash("sha256").update(eventId).digest("hex"),
  });
  await new PaymentWebhookWorker().process(receipt.eventId);
  return receipt;
}

beforeAll(async () => {
  await Promise.all([
    Payment.init(),
    PaymentLedgerEntry.init(),
    PaymentWebhookEvent.init(),
    PaymentReconciliationRecord.init(),
  ]);
});

describe("Payment reconciliation foundation", () => {
  it("matches Payment, Order snapshot, ledger, and processed verified webhook evidence", async () => {
    const fixture = await createPayment();
    await addThroughWebhookWorker(fixture, { status: "captured" });
    const paymentBefore = await Payment.findOne({ paymentId: fixture.payment.paymentId }).lean();
    const ledgerBefore = await PaymentLedgerEntry.find({ paymentId: fixture.payment.paymentId }).lean();
    const result = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);

    expect(result).toMatchObject({
      reconciliationStatus: "MATCHED",
      discrepancyCodes: [],
      internalPaymentState: "captured",
      providerObservedState: "captured",
      providerObservedAt: expect.any(Date),
      internalAmountMinor: 12550,
      orderAmountMinor: 12550,
      providerObservedAmountMinor: 12550,
      internalCurrency: "EGP",
      orderCurrency: "EGP",
      providerObservedCurrency: "EGP",
      evidenceSource: "verified_webhook",
      providerRecognized: true,
      providerEnabled: false,
      providerStatusQueryAvailable: false,
    });
    expect(await Order.findById(fixture.orderId).lean()).toMatchObject({ status: "paid" });
    expect((await Payment.findOne({ paymentId: fixture.payment.paymentId }).lean()).status).toBe(paymentBefore.status);
    expect(await PaymentLedgerEntry.find({ paymentId: fixture.payment.paymentId }).lean()).toHaveLength(ledgerBefore.length);
  });

  it("is idempotent and safe under concurrent repeated reconciliation", async () => {
    const fixture = await createPayment();
    await addThroughWebhookWorker(fixture, { status: "captured" });
    const service = new PaymentReconciliationService();
    const results = await Promise.all([
      service.reconcilePayment(fixture.payment.paymentId),
      service.reconcilePayment(fixture.payment.paymentId),
    ]);
    expect(results[0].reconciliationId).toBe(results[1].reconciliationId);
    expect(await PaymentReconciliationRecord.countDocuments({ paymentId: fixture.payment.paymentId })).toBe(1);
    expect(await Payment.countDocuments({ paymentId: fixture.payment.paymentId })).toBe(1);
  });

  it("returns UNKNOWN for disabled providers without verified provider evidence", async () => {
    const fixture = await createPayment();
    const result = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);
    expect(result).toMatchObject({
      reconciliationStatus: "UNKNOWN",
      discrepancyCodes: ["MISSING_PROVIDER_EVIDENCE"],
      evidenceSource: "none",
      providerRecognized: true,
      providerEnabled: false,
      providerStatusQueryAvailable: false,
    });
  });

  it("records explicit TEST inquiry evidence for review without transitioning the Payment or Order", async () => {
    const fixture = await createPayment({ startStatus: "pending" });
    fixture.payment.providerTransactionId = "987654321";
    await fixture.payment.save();
    const paymobProvider = {
      inquirePayment: jest.fn().mockResolvedValue({
        provider: "paymob",
        providerTransactionId: "987654321",
        orderReference: "7654321",
        status: "captured",
        amountMinor: 12550,
        currency: "EGP",
        capturedAmountMinor: 12550,
        isCaptured: true,
        pending: false,
        success: true,
        errorOccurred: false,
        integrationId: 12345,
        integrationType: "card",
        isLive: false,
        hasParentTransaction: true,
        parentTransactionId: "987654320",
        parentRelationshipVerified: false,
        isAuth: false,
        isCapture: true,
        isStandalonePayment: false,
        isVoided: false,
        isRefunded: false,
        observedAt: new Date(),
      }),
    };
    const result = await new PaymentReconciliationService({
      env: {
        PAYMOB_ENVIRONMENT: "TEST",
        PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED: "true",
      },
      paymobProvider,
    }).reconcilePayment(fixture.payment.paymentId);

    expect(paymobProvider.inquirePayment).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: fixture.payment.paymentId,
      providerTransactionId: "987654321",
    }));
    expect(result.evidenceSource).toBe("paymob_transaction_inquiry");
    expect(result).toMatchObject({
      reconciliationStatus: "PENDING_REVIEW",
      providerObservedState: "captured",
      providerObservedCapturedAmountMinor: 12550,
      providerObservedIsCaptured: true,
      providerObservedPending: false,
      providerObservedSuccess: true,
      providerObservedErrorOccurred: false,
      providerObservedIsCapture: true,
      providerObservedIsVoided: false,
      providerObservedIsRefunded: false,
      providerObservedIntegrationId: 12345,
      providerObservedIsLive: false,
      providerObservedParentTransactionId: "987654320",
      providerObservedOrderReference: "7654321",
      evidenceSource: "paymob_transaction_inquiry",
      providerEnabled: false,
      providerStatusQueryAvailable: false,
    });
    expect(result.discrepancyCodes).toContain("PROVIDER_PARENT_TRANSACTION_UNBOUND");
    expect((await Payment.findOne({ paymentId: fixture.payment.paymentId })).status).toBe("pending");
    expect((await Order.findById(fixture.orderId)).status).toBe("pending_payment");
  });

  it("detects provider amount/currency mismatches without changing financial records", async () => {
    const amountFixture = await createPayment();
    await addProcessedReceipt(amountFixture.payment, { amountMinor: 12551 });
    const amountResult = await new PaymentReconciliationService().reconcilePayment(amountFixture.payment.paymentId);
    expect(amountResult).toMatchObject({ reconciliationStatus: "MISMATCH" });
    expect(amountResult.discrepancyCodes).toContain("AMOUNT_MISMATCH");

    const currencyFixture = await createPayment();
    await addProcessedReceipt(currencyFixture.payment, { currency: "USD" });
    const currencyResult = await new PaymentReconciliationService().reconcilePayment(currencyFixture.payment.paymentId);
    expect(currencyResult).toMatchObject({ reconciliationStatus: "MISMATCH", providerObservedCurrency: "USD" });
    expect(currencyResult.discrepancyCodes).toContain("CURRENCY_MISMATCH");
    expect((await Payment.findOne({ paymentId: currencyFixture.payment.paymentId })).currency).toBe("EGP");
  });

  it("detects Payment/Order amount and currency divergence", async () => {
    const fixture = await createPayment();
    await Order.collection.updateOne({ _id: fixture.orderId }, { $set: { "commercialSnapshot.grandTotalMinor": 13000 } });
    const amountResult = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);
    expect(amountResult.discrepancyCodes).toContain("AMOUNT_MISMATCH");

    await Order.collection.updateOne({ _id: fixture.orderId }, { $set: { "commercialSnapshot.currency": "USD" } });
    const currencyResult = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);
    expect(currencyResult.discrepancyCodes).toContain("CURRENCY_MISMATCH");
    expect((await Payment.findOne({ paymentId: fixture.payment.paymentId })).amountMinor).toBe(12550);
  });

  it("classifies provider/internal state differences for review without automatic transition", async () => {
    const created = await createPayment({ startStatus: "created" });
    await addProcessedReceipt(created.payment, { status: "captured" });
    const result = await new PaymentReconciliationService().reconcilePayment(created.payment.paymentId);
    expect(result).toMatchObject({
      reconciliationStatus: "PENDING_REVIEW",
      internalPaymentState: "created",
      providerObservedState: "captured",
    });
    expect(result.discrepancyCodes).toContain("PAYMENT_STATE_MISMATCH");
    expect((await Payment.findOne({ paymentId: created.payment.paymentId })).status).toBe("created");
  });

  it("does not silently select between conflicting terminal provider events", async () => {
    const fixture = await createPayment({ startStatus: "captured" });
    await addProcessedReceipt(fixture.payment, { eventId: "terminal-captured", status: "captured" });
    await addProcessedReceipt(fixture.payment, { eventId: "terminal-failed", status: "failed" });
    const result = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);
    expect(result.reconciliationStatus).toBe("PENDING_REVIEW");
    expect(result.providerObservedState).toBeNull();
    expect(result.discrepancyCodes).toContain("PAYMENT_STATE_MISMATCH");
  });

  it("ignores unverified and unprocessed webhook records as provider evidence", async () => {
    const fixture = await createPayment();
    const now = new Date();
    await PaymentWebhookEvent.collection.insertOne({
      eventId: crypto.randomUUID(),
      provider: "paymob",
      providerEventId: "not-trusted",
      paymentId: fixture.payment.paymentId,
      paymentReference: fixture.payment.paymentId,
      providerPaymentReference: fixture.payment.providerPaymentId,
      eventType: "payment_captured",
      canonicalStatus: "captured",
      amountMinor: 12550,
      currency: "EGP",
      payloadHash: crypto.createHash("sha256").update("untrusted").digest("hex"),
      verificationStatus: "VERIFIED",
      processingStatus: "RECEIVED",
      receivedAt: now,
    });
    const result = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);
    expect(result).toMatchObject({ reconciliationStatus: "UNKNOWN", evidenceSource: "none", webhookEvidenceCount: 0 });
    expect(result.discrepancyCodes).toContain("MISSING_PROVIDER_EVIDENCE");
  });

  it("reports missing internal records and unknown provider safely", async () => {
    const missing = await new PaymentReconciliationService().reconcilePayment("77ad58b1-ff48-4eed-865f-3e5f16b89a65");
    expect(missing.reconciliationStatus).toBe("MISMATCH");
    expect(missing.discrepancyCodes).toContain("MISSING_INTERNAL_PAYMENT");

    const unknownFixture = await createPayment({ provider: "mystery_provider" });
    const unknown = await new PaymentReconciliationService().reconcilePayment(unknownFixture.payment.paymentId);
    expect(unknown.reconciliationStatus).toBe("UNKNOWN");
    expect(unknown.discrepancyCodes).toContain("UNKNOWN_PROVIDER");
  });

  it("detects ledger corruption and keeps ledger entries append-only", async () => {
    const fixture = await createPayment();
    await PaymentLedgerEntry.collection.updateOne({ paymentId: fixture.payment.paymentId, eventType: "payment_created" }, { $set: { amountMinor: 12551 } });
    const result = await new PaymentReconciliationService().reconcilePayment(fixture.payment.paymentId);
    expect(result.reconciliationStatus).toBe("MISMATCH");
    expect(result.discrepancyCodes).toContain("AMOUNT_MISMATCH");

    const entry = await PaymentLedgerEntry.findOne({ paymentId: fixture.payment.paymentId });
    await expect(entry.updateOne({ $set: { amountMinor: 12550 } })).rejects.toThrow("append-only");
  });

  it("rejects client-controlled reconciliation values and unverified status evidence", async () => {
    const service = new PaymentReconciliationService();
    await expect(service.reconcilePayment({ paymentId: "77ad58b1-ff48-4eed-865f-3e5f16b89a65", amountMinor: 1 }))
      .rejects.toMatchObject({ code: "INVALID_RECONCILIATION_COMMAND" });
    expect(() => fromVerifiedWebhookReceipt({
      verificationStatus: "INVALID_SIGNATURE",
      processingStatus: "PROCESSED",
    })).toThrow("Only verified and processed webhook receipts");
  });

  it("detects invalid ledger transition chains using the existing Payment state machine", async () => {
    const fixture = await createPayment();
    const payment = fixture.payment.toObject();
    const badLedger = [
      { paymentId: payment.paymentId, orderId: payment.orderId, eventType: "payment_created", fromStatus: null, toStatus: "created", amountMinor: payment.amountMinor, currency: payment.currency, provider: payment.provider, idempotencyKey: "created", actorType: "payment_service" },
      { paymentId: payment.paymentId, orderId: payment.orderId, eventType: "payment_captured", fromStatus: "created", toStatus: "captured", amountMinor: payment.amountMinor, currency: payment.currency, provider: payment.provider, idempotencyKey: "capture", actorType: "provider_webhook" },
    ];
    expect(validateLedger(payment, { _id: payment.orderId }, badLedger)).toContain("LEDGER_TRANSITION_INVALID");
  });
});
