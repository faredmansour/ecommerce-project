const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "products", required: true },
  product_id: { type: String },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image: { type: String },
  category: { type: String },
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      state: { type: String },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    paymentMethod: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "shipped", "delivered"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
