const mongoose = require("mongoose");

const oauthExchangeSchema = new mongoose.Schema({
  provider: { type: String, enum: ["google", "apple"], default: "google", required: true },
  codeHash: { type: String, required: true, unique: true },
  bindingHash: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  returnTo: { type: String, required: true, default: "/" },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

oauthExchangeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OAuthExchange", oauthExchangeSchema);
