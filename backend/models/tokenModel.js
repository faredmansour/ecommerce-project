const mongoose = require("mongoose");
const hashToken = require("../utils/hashToken");

const tokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    token: { type: String, required: true },
    type: { type: String, enum: ["refresh", "reset"], required: true },
    sessionVersion: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

tokenSchema.index({ token: 1, type: 1 }, { unique: true });

tokenSchema.statics.revoke = async function (token, type) {
  return this.findOneAndUpdate(
    { token: { $in: [hashToken(token), token] }, type, revoked: false },
    { revoked: true },
    { returnDocument: "after" }
  );
};

module.exports = mongoose.model("Token", tokenSchema);
