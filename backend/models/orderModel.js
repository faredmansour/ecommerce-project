const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "products", immutable: true },
  product_id: { type: String, required: true, immutable: true },
  name: { type: String, required: true, immutable: true },
  // Legacy major-unit projection retained for existing read clients only.
  price: { type: Number, required: true, immutable: true },
  unitPriceMinor: { type: Number, min: 0, validate: Number.isSafeInteger, immutable: true },
  lineTotalMinor: { type: Number, min: 0, validate: Number.isSafeInteger, immutable: true },
  priceReference: {
    priceId: { type: String, immutable: true },
    priceBookId: { type: String, immutable: true },
    revision: { type: Number, min: 1, immutable: true },
  },
  quantity: { type: Number, required: true, min: 1, immutable: true },
  image: { type: String, immutable: true },
  category: { type: String, immutable: true },
}, { strict: "throw" });

const commercialSnapshotSchema = new mongoose.Schema({
  currency: { type: String, required: true, immutable: true, match: /^[A-Z]{3}$/ },
  subtotalMinor: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  discountMinor: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  shippingMinor: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  taxMinor: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  grandTotalMinor: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false, strict: "throw" });

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    items: { type: [orderItemSchema], immutable: true },
    commercialSnapshot: { type: commercialSnapshotSchema, immutable: true, default: undefined },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      state: { type: String },
      postalCode: { type: String },
      country: { type: String, required: true },
    },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    paymentMethod: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    activePaymentId: { type: String, select: false },
    status: {
      type: String,
      enum: ["pending_payment", "pending", "paid", "failed", "cancelled", "shipped", "delivered"],
      default: "pending_payment",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
