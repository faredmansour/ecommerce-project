const mongoose = require("mongoose");

const oauthTransactionSchema = new mongoose.Schema({
  provider: { type: String, enum: ["google", "apple"], default: "google", required: true },
  stateHash: { type: String, required: true, unique: true },
  nonce: { type: String, required: true },
  codeVerifier: { type: String },
  exchangeBindingHash: { type: String, required: true },
  intent: { type: String, enum: ["sign_in", "link"], default: "sign_in", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  authVersion: { type: Number, default: 0 },
  returnTo: { type: String, required: true, default: "/" },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

oauthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OAuthTransaction", oauthTransactionSchema);
