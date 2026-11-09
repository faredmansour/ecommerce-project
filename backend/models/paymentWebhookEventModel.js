const crypto = require("crypto");
const mongoose = require("mongoose");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { PAYMENT_STATES } = require("../utils/paymentStateMachine");

const PROCESSING_STATUSES = Object.freeze([
  "RECEIVED",
  "PROCESSING",
  "PROCESSED",
  "RETRYABLE_FAILURE",
  "DEAD_LETTER",
]);

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, immutable: true, default: () => crypto.randomUUID(), match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i },
    provider: { type: String, required: true, immutable: true, enum: Object.values(PROVIDERS) },
    providerEventId: { type: String, required: true, immutable: true, trim: true, minlength: 1, maxlength: 200 },
    providerTransactionReference: { type: String, immutable: true, trim: true, minlength: 1, maxlength: 200, default: null },
    // Paymob callbacks can be HMAC-verified before the intention response has
    // persisted its provider order reference. Keep that safe event pending.
    paymentId: { type: String, default: null, match: /^[0-9a-f-]{36}$/i },
    paymentReference: { type: String, default: null, match: /^[0-9a-f-]{36}$/i },
    providerPaymentReference: { type: String, default: null, trim: true, minlength: 1, maxlength: 200 },
    providerOrderReference: { type: String, default: null, trim: true, minlength: 1, maxlength: 200 },
    bindingPending: { type: Boolean, default: false },
    bindingDeadlineAt: { type: Date, default: null },
    eventType: { type: String, required: true, immutable: true, enum: PAYMENT_STATES.map((state) => `payment_${state}`) },
    canonicalStatus: { type: String, required: true, immutable: true, enum: PAYMENT_STATES },
    amountMinor: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, required: true, immutable: true, uppercase: true, minlength: 3, maxlength: 3 },
    occurredAt: { type: Date, immutable: true, default: null },
    payloadHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
    verificationStatus: { type: String, required: true, immutable: true, enum: ["VERIFIED"], default: "VERIFIED" },
    processingStatus: { type: String, required: true, enum: PROCESSING_STATUSES, default: "RECEIVED" },
    attemptCount: { type: Number, required: true, min: 0, default: 0 },
    totalAttemptCount: { type: Number, required: true, min: 0, default: 0 },
    reprocessCount: { type: Number, required: true, min: 0, default: 0 },
    lastReprocessedAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    lastAttemptAt: { type: Date, default: null },
    lastErrorCode: { type: String, maxlength: 80, default: null },
    lastErrorAt: { type: Date, default: null },
    processingStartedAt: { type: Date, default: null },
    processingLeaseUntil: { type: Date, default: null },
    claimToken: { type: String, select: false, default: null },
    receivedAt: { type: Date, required: true, immutable: true, default: Date.now },
    processedAt: { type: Date, default: null },
    deadLetteredAt: { type: Date, default: null },
  },
  { timestamps: false, strict: "throw" }
);

paymentWebhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
paymentWebhookEventSchema.index({ processingStatus: 1, nextAttemptAt: 1, receivedAt: 1 });
paymentWebhookEventSchema.index({ processingStatus: 1, processingLeaseUntil: 1 });
paymentWebhookEventSchema.index({ paymentId: 1, receivedAt: 1 });

module.exports = mongoose.models.PaymentWebhookEvent || mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);
module.exports.PROCESSING_STATUSES = PROCESSING_STATUSES;
