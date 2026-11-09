const mongoose = require("mongoose");
const { isSafePaymentMetadata } = require("../utils/safePaymentMetadata");
const { isSupportedPaymentCurrency } = require("../utils/paymentCurrency");

const ledgerEntrySchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, immutable: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
    eventType: {
      type: String,
      required: true,
      immutable: true,
      enum: ["payment_created", "payment_pending", "payment_authorized", "payment_captured", "payment_failed", "payment_cancelled", "payment_requires_action"],
    },
    fromStatus: { type: String, default: null, immutable: true },
    toStatus: { type: String, required: true, immutable: true },
    amountMinor: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, required: true, immutable: true, validate: isSupportedPaymentCurrency },
    provider: { type: String, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    actorType: { type: String, required: true, immutable: true, enum: ["payment_service", "provider_api", "provider_webhook", "reconciliation"] },
    reasonCode: { type: String, default: null, immutable: true, maxlength: 80 },
    occurredAt: { type: Date, default: Date.now, immutable: true },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      immutable: true,
      validate: { validator: isSafePaymentMetadata, message: "Ledger metadata contains unsupported or sensitive fields" },
    },
  },
  { timestamps: { createdAt: "recordedAt", updatedAt: false }, strict: "throw" }
);

ledgerEntrySchema.index({ paymentId: 1, recordedAt: 1 });
ledgerEntrySchema.index({ orderId: 1, recordedAt: 1 });
ledgerEntrySchema.index({ paymentId: 1, idempotencyKey: 1, eventType: 1 }, { unique: true });

ledgerEntrySchema.pre("save", function preventLedgerMutation() {
  if (!this.isNew) throw new Error("Payment ledger entries are append-only.");
});

for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndReplace"]) {
  ledgerEntrySchema.pre(operation, function preventLedgerQueryMutation() {
    throw new Error("Payment ledger entries are append-only.");
  });
}

module.exports = mongoose.models.PaymentLedgerEntry || mongoose.model("PaymentLedgerEntry", ledgerEntrySchema);
