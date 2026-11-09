const mongoose = require("mongoose");

const paymentExecutionAttemptSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
  provider: { type: String, required: true, enum: ["paymob"], immutable: true },
  status: { type: String, required: true, enum: ["REQUESTING", "SESSION_CREATED", "REJECTED", "UNKNOWN"], default: "REQUESTING" },
  providerPaymentId: { type: String, default: null, maxlength: 200 },
  providerReference: { type: String, default: null, maxlength: 200 },
  // AES-GCM encrypted; the plaintext URL contains an intention-specific secret.
  checkoutUrlEncrypted: { type: String, default: null, maxlength: 4096, select: false },
  sessionCreatedAt: { type: Date, default: null },
  recoveryRequiredAt: { type: Date, default: null },
  errorCode: { type: String, default: null, maxlength: 80 },
}, { timestamps: true, strict: "throw" });

paymentExecutionAttemptSchema.index({ paymentId: 1 }, { unique: true });
paymentExecutionAttemptSchema.index({ orderId: 1 }, { unique: true });

module.exports = mongoose.models.PaymentExecutionAttempt || mongoose.model("PaymentExecutionAttempt", paymentExecutionAttemptSchema);
