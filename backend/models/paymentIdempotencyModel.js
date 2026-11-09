const mongoose = require("mongoose");

const paymentIdempotencySchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, immutable: true },
    operation: { type: String, required: true, enum: ["create_payment"], immutable: true },
    idempotencyKey: { type: String, required: true, minlength: 8, maxlength: 128, immutable: true },
    requestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
    paymentId: { type: String, required: true, immutable: true },
  },
  { timestamps: true, strict: "throw" }
);

paymentIdempotencySchema.index({ customerId: 1, operation: 1, idempotencyKey: 1 }, { unique: true });
paymentIdempotencySchema.index({ paymentId: 1 }, { unique: true });

paymentIdempotencySchema.pre("save", function preventIdempotencyMutation() {
  if (!this.isNew) throw new Error("Payment idempotency records are immutable.");
});

for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndReplace"]) {
  paymentIdempotencySchema.pre(operation, function preventIdempotencyQueryMutation() {
    throw new Error("Payment idempotency records are immutable.");
  });
}

module.exports = mongoose.models.PaymentIdempotency || mongoose.model("PaymentIdempotency", paymentIdempotencySchema);
