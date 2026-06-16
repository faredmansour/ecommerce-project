const mongoose = require("mongoose");

const wishlistItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "products" },
  product_id: { type: String, required: true },
  name: { type: String, required: true },
  image: { type: String },
  category: { type: String },
  addedAt: { type: Date, default: Date.now },
});
const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, unique: true },
    items: [wishlistItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wishlist", wishlistSchema);
