const crypto = require("crypto");
const mongoose = require("mongoose");
const { PAYMENT_STATES } = require("../utils/paymentStateMachine");
const { isSafePaymentMetadata } = require("../utils/safePaymentMetadata");
const { isSupportedPaymentCurrency } = require("../utils/paymentCurrency");

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      immutable: true,
      default: () => crypto.randomUUID(),
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, immutable: true },
    provider: { type: String, required: true, immutable: true, trim: true, lowercase: true, match: /^[a-z][a-z0-9_-]{1,39}$/ },
    providerPaymentId: { type: String, default: null, trim: true, maxlength: 200 },
    providerTransactionId: { type: String, default: null, trim: true, maxlength: 200 },
    amountMinor: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: "amountMinor must be a safe integer" },
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      validate: { validator: isSupportedPaymentCurrency, message: "currency must be a supported ISO 4217 code" },
    },
    paymentMethodType: { type: String, required: true, immutable: true, enum: ["card"] },
    status: { type: String, required: true, enum: PAYMENT_STATES, default: "created" },
    idempotencyKey: { type: String, required: true, immutable: true, minlength: 8, maxlength: 128 },
    idempotencyRequestHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      validate: { validator: isSafePaymentMetadata, message: "Payment metadata contains unsupported or sensitive fields" },
    },
  },
  { timestamps: true, optimisticConcurrency: true, strict: "throw" }
);

paymentSchema.index({ paymentId: 1 }, { unique: true });
paymentSchema.index({ orderId: 1, createdAt: -1 });
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, updatedAt: 1 });
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } }
);
paymentSchema.index(
  { provider: 1, providerTransactionId: 1 },
  { unique: true, partialFilterExpression: { providerTransactionId: { $type: "string" } } }
);
paymentSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
