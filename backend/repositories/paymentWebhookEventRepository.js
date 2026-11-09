const PaymentWebhookEvent = require("../models/paymentWebhookEventModel");

class PaymentWebhookEventRepository {
  findByProviderEvent(provider, providerEventId, session) {
    return PaymentWebhookEvent.findOne({ provider, providerEventId }).session(session || null);
  }

  findByEventId(eventId, session) {
    return PaymentWebhookEvent.findOne({ eventId }).select("+claimToken").session(session || null);
  }

  findVerifiedProcessedForPayment(paymentId, session) {
    return PaymentWebhookEvent.find({ paymentId, verificationStatus: "VERIFIED", processingStatus: "PROCESSED" })
      .session(session || null)
      .sort({ processedAt: 1, providerEventId: 1 })
      .lean();
  }

  create(receipt, session) {
    return PaymentWebhookEvent.create([receipt], { session }).then(([created]) => created);
  }

  findPendingWebhookEvents({ now = new Date(), limit = 100 } = {}) {
    return PaymentWebhookEvent.find({
      $or: [
        { processingStatus: "RECEIVED", nextAttemptAt: { $lte: now } },
        { processingStatus: "RETRYABLE_FAILURE", nextAttemptAt: { $lte: now } },
        { processingStatus: "PROCESSING", processingLeaseUntil: { $lte: now } },
      ],
    }).sort({ receivedAt: 1 }).limit(Math.max(1, Math.min(limit, 500))).lean();
  }

  claim(eventId, { now, leaseUntil, claimToken, maxAttempts }) {
    return PaymentWebhookEvent.findOneAndUpdate({
      eventId,
      $and: [
        { $or: [
          { attemptCount: { $lt: maxAttempts }, bindingPending: { $ne: true } },
          { bindingPending: true, bindingDeadlineAt: { $gt: now } },
        ] },
        { $or: [
          { processingStatus: "RECEIVED", nextAttemptAt: { $lte: now } },
          { processingStatus: "RETRYABLE_FAILURE", nextAttemptAt: { $lte: now } },
          { processingStatus: "PROCESSING", processingLeaseUntil: { $lte: now } },
        ] },
      ],
    }, {
      $set: {
        processingStatus: "PROCESSING",
        processingStartedAt: now,
        processingLeaseUntil: leaseUntil,
        lastAttemptAt: now,
        claimToken,
      },
      $inc: { attemptCount: 1, totalAttemptCount: 1 },
    }, { returnDocument: "after", runValidators: true }).select("+claimToken");
  }

  renewClaimInTransaction(eventId, claimToken, session, leaseUntil) {
    return PaymentWebhookEvent.findOneAndUpdate({
      eventId,
      processingStatus: "PROCESSING",
      claimToken,
    }, {
      $set: { processingLeaseUntil: leaseUntil },
    }, { session, returnDocument: "after", runValidators: true });
  }

  markProcessed(eventId, claimToken, session, processedAt = new Date()) {
    return PaymentWebhookEvent.findOneAndUpdate({
      eventId,
      processingStatus: "PROCESSING",
      claimToken,
    }, {
      $set: {
        processingStatus: "PROCESSED",
        processedAt,
        processingLeaseUntil: null,
        claimToken: null,
        lastErrorCode: null,
      },
    }, { session, returnDocument: "after", runValidators: true });
  }

  bindPaymobReferences(eventId, claimToken, session, { paymentReference, providerPaymentReference }) {
    return PaymentWebhookEvent.findOneAndUpdate({
      eventId,
      provider: "paymob",
      processingStatus: "PROCESSING",
      claimToken,
      bindingPending: true,
      paymentReference: null,
      providerPaymentReference: null,
    }, {
      $set: {
        paymentId: paymentReference,
        paymentReference,
        providerPaymentReference,
        bindingPending: false,
        bindingDeadlineAt: null,
      },
    }, { session, returnDocument: "after", runValidators: true });
  }

  markFailure(eventId, claimToken, { status, errorCode, now, nextAttemptAt = null }) {
    return PaymentWebhookEvent.findOneAndUpdate({
      eventId,
      processingStatus: "PROCESSING",
      claimToken,
    }, {
      $set: {
        processingStatus: status,
        lastErrorCode: errorCode,
        lastErrorAt: now,
        nextAttemptAt: nextAttemptAt || now,
        processingLeaseUntil: null,
        claimToken: null,
        deadLetteredAt: status === "DEAD_LETTER" ? now : null,
      },
    }, { returnDocument: "after", runValidators: true });
  }

  deadLetterExhausted(eventId, { now, maxAttempts }) {
    return PaymentWebhookEvent.findOneAndUpdate({
      eventId,
      $and: [
        { $or: [
          { attemptCount: { $gte: maxAttempts }, bindingPending: { $ne: true } },
          { bindingPending: true, bindingDeadlineAt: { $lte: now } },
        ] },
        { $or: [
          { processingStatus: "RECEIVED" },
          { processingStatus: "RETRYABLE_FAILURE" },
          { processingStatus: "PROCESSING", processingLeaseUntil: { $lte: now } },
        ] },
      ],
    }, {
      $set: {
        processingStatus: "DEAD_LETTER",
        deadLetteredAt: now,
        lastErrorCode: "WEBHOOK_MAX_ATTEMPTS_EXCEEDED",
        lastErrorAt: now,
        processingLeaseUntil: null,
        claimToken: null,
      },
    }, { returnDocument: "after", runValidators: true });
  }

  requeueDeadLetter(eventId, { now }) {
    return PaymentWebhookEvent.findOneAndUpdate({ eventId, processingStatus: "DEAD_LETTER", verificationStatus: "VERIFIED" }, {
      $set: {
        processingStatus: "RECEIVED",
        attemptCount: 0,
        nextAttemptAt: now,
        processingStartedAt: null,
        processingLeaseUntil: null,
        claimToken: null,
        processedAt: null,
        deadLetteredAt: null,
        lastReprocessedAt: now,
      },
      $inc: { reprocessCount: 1 },
    }, { returnDocument: "after", runValidators: true });
  }
}

module.exports = PaymentWebhookEventRepository;
