const mongoose = require("mongoose");

const wishlistItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "products", required: true },
  product_id: { type: String },
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
