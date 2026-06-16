const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "products", required: true },
  product_id: { type: String },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String },
  category: { type: String },
  quantity: { type: Number, default: 1, min: 1 },
});
const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
